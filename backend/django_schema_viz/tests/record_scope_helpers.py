"""
Test double for ``SCHEMA_VIZ["RECORD_SCOPE"]``.

Tests register the rows a given user must not see, then point the setting at
:func:`scope_queryset_for_tests`. Keeping the state module-level (rather than
on the callable) lets tests reconfigure visibility without re-importing.
"""

from __future__ import annotations

_HIDDEN_PKS: dict[tuple[str, str], set[str]] = {}


def hide_for(username: str, model_label: str, pks) -> None:
    """Hide *pks* of *model_label* (``"app_label.modelname"``) from *username*."""
    key = (username, model_label.lower())
    _HIDDEN_PKS.setdefault(key, set()).update(str(pk) for pk in pks)


def reset_record_scope() -> None:
    _HIDDEN_PKS.clear()


def scope_queryset_for_tests(queryset, user):
    username = getattr(user, "username", "") or ""
    hidden = _HIDDEN_PKS.get((username, queryset.model._meta.label_lower))
    if not hidden:
        return queryset
    return queryset.exclude(pk__in=hidden)


def scope_returning_wrong_type(queryset, user):
    return list(queryset)
