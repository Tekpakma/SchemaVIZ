"""
Authentication adapters for django-schema-viz.

When deployed behind TanStack Start with DOT (Django OAuth Toolkit) as the OIDC provider,
requests arrive with a DOT access token in the Authorization header.  Django validates the
token using DOT's ``OAuth2Authentication`` (configured via DRF's global or per-view
``DEFAULT_AUTHENTICATION_CLASSES``).  No custom authentication class is required here.

This module is kept as a namespace for potential future authentication helpers.
"""
