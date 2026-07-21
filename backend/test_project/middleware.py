from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware


class DevelopmentCsrfViewMiddleware(CsrfViewMiddleware):
    """Relax Django CSRF origin checks for the local development project."""

    def _origin_verified(self, request):
        if settings.DEBUG:
            return True
        return super()._origin_verified(request)