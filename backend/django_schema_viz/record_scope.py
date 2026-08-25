"""
Row-level scoping for consumer-model querysets.

The QLab model registry decides *which models* a user may reach. It does not
decide *which rows*. Without a second boundary, any authenticated user can read
any record of an accessible model by guessing a primary key — most visibly on
shared generation links, where the record id is part of the URL.

Deployments close that gap by pointing ``SCHEMA_VIZ["RECORD_SCOPE"]`` at a
callable::

    def scope_to_tenant(queryset, user):
        model = queryset.model
        if not hasattr(model, "perm_group"):
            return queryset  # reference data, not tenant-owned
        return queryset.filter(perm_group__in=user.perm_groups)

    SCHEMA_VIZ = {"RECORD_SCOPE": "myproject.scoping.scope_to_tenant"}

Every queryset schema-viz builds against a consumer model passes through
:func:`scope_queryset` first. When no hook is configured the queryset is
returned unchanged, which keeps single-tenant installs working as before.
"""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured
from django.db.models import QuerySet

from .conf import get_setting, resolve_callable


def get_record_scope():
    """Return the configured scope callable, or ``None`` when unset."""
    return resolve_callable(get_setting("RECORD_SCOPE"))


def scope_queryset(queryset: QuerySet, user) -> QuerySet:
    """
    Narrow *queryset* to the rows *user* may read.

    Returns *queryset* unchanged when no ``RECORD_SCOPE`` is configured.
    """
    scope = get_record_scope()
    if scope is None:
        return queryset

    scoped = scope(queryset, user)
    if not isinstance(scoped, QuerySet):
        raise ImproperlyConfigured(
            "SCHEMA_VIZ['RECORD_SCOPE'] must return a QuerySet, got "
            f"{type(scoped).__name__}."
        )
    if scoped.model is not queryset.model:
        raise ImproperlyConfigured(
            "SCHEMA_VIZ['RECORD_SCOPE'] must return a QuerySet for "
            f"{queryset.model._meta.label}, got {scoped.model._meta.label}."
        )
    return scoped


def scope_model_queryset(model, user) -> QuerySet:
    """Scoped ``all()`` queryset for *model*."""
    return scope_queryset(model._default_manager.all(), user)


def is_record_in_scope(record, user) -> bool:
    """Whether *user* may read *record*."""
    if get_record_scope() is None:
        return True
    return scope_model_queryset(type(record), user).filter(pk=record.pk).exists()
