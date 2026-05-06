try:
    from drf_spectacular.utils import (
        extend_schema,
        extend_schema_field,
        extend_schema_view,
        OpenApiParameter,
        OpenApiExample,
        OpenApiResponse,
        inline_serializer,
    )
    from drf_spectacular.types import OpenApiTypes

    HAS_SPECTACULAR = True
except ImportError:
    HAS_SPECTACULAR = False

    # No-op decorator that does nothing
    def extend_schema(*args, **kwargs):
        def decorator(func):
            return func

        return decorator

    extend_schema_view = extend_schema

    def OpenApiParameter(*args, **kwargs):
        return None

    def OpenApiExample(*args, **kwargs):
        return None

    def OpenApiResponse(*args, **kwargs):
        return None

    def inline_serializer(*args, **kwargs):
        return None

    def extend_schema_field(*args, **kwargs):
        def decorator(func):
            return func

        return decorator

    def OpenApiTypes():
        return None


__all__ = [
    "extend_schema",
    "extend_schema_field",
    "extend_schema_view",
    "OpenApiParameter",
    "OpenApiExample",
    "OpenApiResponse",
    "inline_serializer",
    "HAS_SPECTACULAR",
    "OpenApiTypes",
]
