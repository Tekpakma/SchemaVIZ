"""
Mint a long-lived OAuth2 access token for an MCP client.

External MCP clients (Claude Desktop, VS Code, the MCP Inspector, …) cannot run
the interactive OIDC login flow that the browser frontend uses. They send a
static ``Authorization: Bearer <token>`` header instead, which the already
configured ``oauth2_provider.contrib.rest_framework.OAuth2Authentication``
validates like any other access token.

The token inherits the permissions of *its user* - there is no separate
privilege model. Revoke it via the Django admin or by deleting the row.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

MCP_APPLICATION_NAME = "SchemaVIZ MCP"
DEFAULT_SCOPES = "openid profile email"
DEFAULT_EXPIRES_DAYS = 365


class Command(BaseCommand):
    help = "Create a long-lived OAuth2 access token for an MCP client."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            required=True,
            help="Username the token acts on behalf of.",
        )
        parser.add_argument(
            "--scopes",
            default=DEFAULT_SCOPES,
            help=f"Space-separated OAuth2 scopes (default: {DEFAULT_SCOPES!r}).",
        )
        parser.add_argument(
            "--expires-days",
            type=int,
            default=DEFAULT_EXPIRES_DAYS,
            help=f"Token lifetime in days (default: {DEFAULT_EXPIRES_DAYS}).",
        )

    def handle(self, *args, **options):
        try:
            from oauth2_provider.models import get_access_token_model, get_application_model
        except ImportError as exc:  # pragma: no cover - depends on deployment
            raise CommandError(
                "django-oauth-toolkit is not installed; cannot mint MCP tokens."
            ) from exc

        from oauthlib.common import generate_token

        expires_days = options["expires_days"]
        if expires_days < 1:
            raise CommandError("--expires-days must be at least 1.")

        user_model = get_user_model()
        username = options["user"]
        try:
            user = user_model.objects.get(**{user_model.USERNAME_FIELD: username})
        except user_model.DoesNotExist as exc:
            raise CommandError(f'User "{username}" does not exist.') from exc

        application_model = get_application_model()
        application, created = application_model.objects.get_or_create(
            name=MCP_APPLICATION_NAME,
            defaults={
                "client_type": application_model.CLIENT_CONFIDENTIAL,
                "authorization_grant_type": application_model.GRANT_CLIENT_CREDENTIALS,
                "skip_authorization": True,
            },
        )
        if created:
            self.stdout.write(f'Created OAuth2 application "{MCP_APPLICATION_NAME}".')

        access_token_model = get_access_token_model()
        token = access_token_model.objects.create(
            user=user,
            application=application,
            token=generate_token(),
            expires=timezone.now() + timedelta(days=expires_days),
            scope=options["scopes"],
        )

        self.stdout.write(self.style.SUCCESS("MCP access token created."))
        self.stdout.write(f"  user:    {username}")
        self.stdout.write(f"  scopes:  {token.scope}")
        self.stdout.write(f"  expires: {token.expires.isoformat()}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("Token (shown once, store it securely):"))
        self.stdout.write(token.token)
