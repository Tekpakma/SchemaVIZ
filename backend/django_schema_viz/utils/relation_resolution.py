"""
Relation-path resolution for generation runtime.

When a generation step's lexical content references a relation path like
``templates.name`` on a CloudProvider node, the engine resolves it via this
module:

1. :func:`build_prefetch_plan` returns ``select_related`` / ``prefetch_related``
   lists derived from ``_meta.get_fields()`` so the queryset fetch is N+1-free.
2. :func:`resolve_relation_paths` walks each path on a single record post-fetch
   and returns a nested dict the frontend renderer can ``walkPath()`` against.

The frontend (``templateTextContent.ts``) treats ``None`` / missing keys as
"unresolved" and renders ``{{path}}`` literally — useful for debugging.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db import models
from django.db.models.fields.related import ForeignKey, ManyToManyField, OneToOneField

# Limits — prevent runaway payloads from highly-connected records or
# accidentally-deep paths. Reverse FKs to records with thousands of children
# would otherwise inflate fields_data well past anything renderable.
MAX_COLLECTION_SIZE = 50
MAX_PATH_DEPTH = 3

# Sentinel keys added to truncated collections so the frontend can surface
# the partial-resolution state ("...and 12 more") if it chooses.
TRUNCATED_KEY = "_truncated"
TOTAL_COUNT_KEY = "_count"


# ---------------------------------------------------------------------------
# Prefetch plan
# ---------------------------------------------------------------------------


def build_prefetch_plan(
    model: type[models.Model],
    paths: Iterable[str],
) -> tuple[list[str], list[str]]:
    """
    Given a model and a set of dotted paths referenced on it, return
    ``(select_related, prefetch_related)`` lists Django can apply to a queryset.

    Forward FK / O2O segments are eligible for ``select_related`` (SQL JOIN).
    Reverse FK / M2M segments require ``prefetch_related``. Mixed chains
    fall back to ``prefetch_related`` end-to-end since ``select_related``
    cannot follow reverse relations.
    """
    select_related: set[str] = set()
    prefetch_related: set[str] = set()

    for path in paths:
        segments = [seg for seg in path.split(".") if seg]
        if len(segments) <= 1:
            continue  # flat field — no prefetch needed
        # Walk the segments classifying relation kinds along the way.
        current_model: type[models.Model] | None = model
        is_select_eligible = True
        django_path_parts: list[str] = []
        for segment in segments[:-1]:  # last segment is a scalar, not a relation
            if current_model is None:
                break
            relation = _get_relation_field(current_model, segment)
            if relation is None:
                is_select_eligible = False
                break
            django_path_parts.append(segment)
            kind = relation["kind"]
            if kind not in {"forward_fk", "one_to_one"}:
                is_select_eligible = False
            current_model = relation["target_model"]

        if not django_path_parts:
            continue
        joined = "__".join(django_path_parts)
        if is_select_eligible:
            select_related.add(joined)
        else:
            prefetch_related.add(joined)

    return sorted(select_related), sorted(prefetch_related)


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def resolve_relation_paths(
    record: models.Model,
    paths: Iterable[str],
    *,
    user=None,
    accessibility_check=None,
) -> dict[str, Any]:
    """
    Walk the union of paths on ``record`` and return nested data shaped for
    the frontend renderer. Only relation paths (containing a ``.``) are
    materialised; flat field references are already served by the
    ``DynamicModelSerializer`` output and need no extra work here.

    Multiple paths sharing a relation prefix (``templates.name`` +
    ``templates.os_family``) are merged into one pass over the related
    records so the same children get enriched with every requested field.

    ``accessibility_check`` is an optional callable
    ``(user, app_label, model_name) -> bool`` used to gate related-record
    access. Pass ``is_model_accessible_for_user`` from the engine to keep
    QLab permission boundaries intact.
    """
    relation_paths: list[list[str]] = []
    for path in paths:
        segments = [seg for seg in path.split(".") if seg]
        if len(segments) <= 1:
            continue
        if len(segments) > MAX_PATH_DEPTH + 1:  # +1 because last segment is scalar
            continue
        relation_paths.append(segments)
    if not relation_paths:
        return {}
    nested: dict[str, Any] = {}
    _resolve_group(nested, relation_paths, record, user, accessibility_check, depth=0)
    return nested


def _resolve_group(
    target: dict[str, Any],
    path_groups: list[list[str]],
    record: models.Model,
    user,
    accessibility_check,
    *,
    depth: int,
) -> None:
    """
    Resolve a batch of paths against a single record. Paths are grouped by
    their first segment so each relation is fetched at most once even when
    multiple chips reference it.
    """
    if depth > MAX_PATH_DEPTH:
        return

    # Group remaining-path-tails by their shared head segment.
    by_head: dict[str, list[list[str]]] = {}
    leaf_heads: set[str] = set()
    for segments in path_groups:
        if not segments:
            continue
        head, *rest = segments
        if rest:
            by_head.setdefault(head, []).append(rest)
        else:
            leaf_heads.add(head)

    # Scalar leaves — read directly off the record.
    for head in leaf_heads:
        if head not in target:
            target[head] = _read_scalar(record, head)

    # Relation branches — fetch once per relation, recurse with the tails.
    model = type(record)
    for head, tails in by_head.items():
        relation = _get_relation_field(model, head)
        if relation is None:
            continue  # unknown relation — leave unresolved
        target_model = relation["target_model"]
        if (
            accessibility_check
            and target_model is not None
            and not accessibility_check(
                user,
                target_model._meta.app_label,
                target_model._meta.model_name or "",
            )
        ):
            continue  # permission denied — leave unresolved

        related = _read_related(record, head, relation)
        if related is None:
            continue

        if isinstance(related, list):
            total = len(related)
            truncated = total > MAX_COLLECTION_SIZE
            children_to_walk = related[:MAX_COLLECTION_SIZE]
            existing = target.get(head)
            if not isinstance(existing, list) or len(existing) != len(
                children_to_walk
            ):
                existing = [{} for _ in children_to_walk]
                target[head] = existing
            for child_dict, child_record in zip(existing, children_to_walk):
                _resolve_group(
                    child_dict,
                    tails,
                    child_record,
                    user,
                    accessibility_check,
                    depth=depth + 1,
                )
            if truncated:
                # Annotate at the collection level — frontend can surface this.
                target[f"{head}{TRUNCATED_KEY}"] = True
                target[f"{head}{TOTAL_COUNT_KEY}"] = total
        else:
            existing = target.get(head)
            if not isinstance(existing, dict):
                existing = {}
                target[head] = existing
            _resolve_group(
                existing,
                tails,
                related,
                user,
                accessibility_check,
                depth=depth + 1,
            )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _get_relation_field(
    model: type[models.Model], segment: str
) -> dict[str, Any] | None:
    """
    Look up a relation by attribute name on the model and classify it.

    Returns ``{kind, target_model}`` or ``None`` when the segment is not
    a known relation accessor.
    """
    try:
        descriptor = model._meta.get_field(segment)
    except Exception:
        # Reverse-relation accessors are exposed as related_name, which
        # `_meta.get_field` does find — but some auto-generated accessors
        # (e.g. ``foo_set``) need special handling.
        for field in model._meta.get_fields():
            accessor = getattr(field, "get_accessor_name", None)
            if accessor and accessor() == segment:
                descriptor = field
                break
        else:
            return None

    if isinstance(descriptor, OneToOneField):
        return {
            "kind": "one_to_one",
            "target_model": descriptor.related_model,
        }
    if isinstance(descriptor, ForeignKey):
        return {
            "kind": "forward_fk",
            "target_model": descriptor.related_model,
        }
    if isinstance(descriptor, ManyToManyField):
        return {
            "kind": "many_to_many",
            "target_model": descriptor.related_model,
        }
    # Reverse relations expose themselves as ManyToOneRel / ManyToManyRel /
    # OneToOneRel on _meta.get_fields(). They all carry a ``related_model``.
    related_model = getattr(descriptor, "related_model", None)
    one_to_one = getattr(descriptor, "one_to_one", False)
    many_to_many = getattr(descriptor, "many_to_many", False)
    if related_model is None:
        return None
    if one_to_one:
        return {"kind": "reverse_one_to_one", "target_model": related_model}
    if many_to_many:
        return {"kind": "many_to_many", "target_model": related_model}
    return {"kind": "reverse_fk", "target_model": related_model}


def _read_related(
    record: models.Model, segment: str, relation: dict[str, Any]
) -> models.Model | list[models.Model] | None:
    try:
        value = getattr(record, segment)
    except Exception:
        return None
    if value is None:
        return None
    if isinstance(value, models.Manager):
        # Covers RelatedManager (reverse FK) and ManyRelatedManager (M2M);
        # both subclass models.Manager. +1 lets caller detect truncation.
        return list(value.all()[: MAX_COLLECTION_SIZE + 1])
    return value


def _read_scalar(record: models.Model, field_name: str) -> Any:
    """Read a flat field value off a record, returning ``None`` if absent."""
    try:
        value = getattr(record, field_name)
    except Exception:
        return None
    # FK ids: prefer the ``<name>_id`` form to avoid an extra DB hit when the
    # related object isn't already cached.
    if hasattr(record, f"{field_name}_id") and field_name != "id":
        id_value = getattr(record, f"{field_name}_id", None)
        if id_value is not None and isinstance(value, models.Model):
            return id_value
    return value
