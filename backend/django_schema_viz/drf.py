import json

from django.conf import settings
from django.http.multipartparser import (
    MultiPartParser as DjangoMultiPartParser,
    MultiPartParserError,
)
from djangorestframework_camel_case.util import (
    File,
    MultiValueDict,
    OrderedDict,
    Promise,
    QueryDict,
    ReturnDict,
    _get_iterable,
    camel_to_underscore,
    camelize_re,
    force_str,
    is_iterable,
    underscore_to_camel,
)
from rest_framework.parsers import (
    DataAndFiles,
    FormParser,
    JSONParser,
    MultiPartParser,
    ParseError,
)
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.renderers import JSONRenderer


SCHEMA_VIZ_JSON_UNDERSCOREIZE = {
    "no_underscore_before_number": False,
    "ignore_fields": (
        "lexical_state",
        "react_flow_state",
        "definition",
        "inline_definition",
        "styleDrafts",
        "style_drafts",
    ),
    "ignore_keys": None,
}

DYNAMIC_MODEL_DATA_KEYS = frozenset(
    {
        "fields",
        "_record_fields",
        "_recordFields",
        "record_fields",
        "recordFields",
    }
)


def _camelize_key(key, options):
    if isinstance(key, Promise):
        key = force_str(key)
    if isinstance(key, str) and "_" in key:
        return camelize_re.sub(underscore_to_camel, key)
    return key


def _is_dynamic_model_data_container(key, normalized_key, value):
    return (
        isinstance(value, dict)
        and (key in DYNAMIC_MODEL_DATA_KEYS or normalized_key in DYNAMIC_MODEL_DATA_KEYS)
    )


def schema_viz_camelize(data, **options):
    """Camelize typed API keys without mutating dynamic model field dictionaries."""
    ignore_fields = options.get("ignore_fields") or ()
    ignore_keys = options.get("ignore_keys") or ()

    if isinstance(data, Promise):
        data = force_str(data)

    if isinstance(data, dict):
        if isinstance(data, ReturnDict):
            new_dict = ReturnDict(serializer=data.serializer)
        else:
            new_dict = OrderedDict()

        for key, value in data.items():
            new_key = _camelize_key(key, options)
            if _is_dynamic_model_data_container(key, new_key, value):
                result = value
                output_key = key
            elif key not in ignore_fields and new_key not in ignore_fields:
                result = schema_viz_camelize(value, **options)
                output_key = key if key in ignore_keys or new_key in ignore_keys else new_key
            else:
                result = value
                output_key = key if key in ignore_keys or new_key in ignore_keys else new_key

            new_dict[output_key] = result
        return new_dict

    if is_iterable(data) and not isinstance(data, str):
        return [schema_viz_camelize(item, **options) for item in data]

    return data


def schema_viz_underscoreize(data, **options):
    """Underscore typed API keys without mutating dynamic model field dictionaries."""
    ignore_fields = options.get("ignore_fields") or ()
    ignore_keys = options.get("ignore_keys") or ()

    if isinstance(data, dict):
        if type(data) == MultiValueDict:
            new_data = MultiValueDict()
            for key, value in data.items():
                new_data.setlist(camel_to_underscore(key, **options), data.getlist(key))
            return new_data

        new_dict = {}
        for key, value in _get_iterable(data):
            new_key = camel_to_underscore(key, **options) if isinstance(key, str) else key

            if _is_dynamic_model_data_container(key, new_key, value):
                result = value
                output_key = key
            elif key not in ignore_fields and new_key not in ignore_fields:
                result = schema_viz_underscoreize(value, **options)
                output_key = key if key in ignore_keys or new_key in ignore_keys else new_key
            else:
                result = value
                output_key = key if key in ignore_keys or new_key in ignore_keys else new_key

            new_dict[output_key] = result

        if isinstance(data, QueryDict):
            new_query = QueryDict(mutable=True)
            for key, value in new_dict.items():
                new_query.setlist(key, value)
            return new_query
        return new_dict

    if is_iterable(data) and not isinstance(data, (str, File)):
        return [schema_viz_underscoreize(item, **options) for item in data]

    return data


class QueryPagination(LimitOffsetPagination):
    default_limit = 50
    max_limit = 200


class QuickAccessPagination(LimitOffsetPagination):
    default_limit = 6
    max_limit = 24


class SchemaVizCamelCaseJSONParser(JSONParser):
    json_underscoreize = SCHEMA_VIZ_JSON_UNDERSCOREIZE

    def parse(self, stream, media_type=None, parser_context=None):
        parser_context = parser_context or {}
        encoding = parser_context.get("encoding", settings.DEFAULT_CHARSET)

        try:
            data = stream.read().decode(encoding)
            return schema_viz_underscoreize(
                json.loads(data),
                **self.json_underscoreize,
            )
        except ValueError as exc:
            raise ParseError(f"JSON parse error - {exc}")


class SchemaVizCamelCaseMultiPartParser(MultiPartParser):
    json_underscoreize = SCHEMA_VIZ_JSON_UNDERSCOREIZE
    media_type = "multipart/form-data"

    def parse(self, stream, media_type=None, parser_context=None):
        parser_context = parser_context or {}
        request = parser_context["request"]
        encoding = parser_context.get("encoding", settings.DEFAULT_CHARSET)
        meta = request.META.copy()
        meta["CONTENT_TYPE"] = media_type
        upload_handlers = request.upload_handlers

        try:
            parser = DjangoMultiPartParser(meta, stream, upload_handlers, encoding)
            data, files = parser.parse()
            return DataAndFiles(
                schema_viz_underscoreize(data, **self.json_underscoreize),
                schema_viz_underscoreize(files, **self.json_underscoreize),
            )
        except MultiPartParserError as exc:
            raise ParseError(f"Multipart form parse error - {exc}")


class SchemaVizCamelCaseFormParser(FormParser):
    json_underscoreize = SCHEMA_VIZ_JSON_UNDERSCOREIZE

    def parse(self, stream, media_type=None, parser_context=None):
        return schema_viz_underscoreize(
            super().parse(stream, media_type, parser_context),
            **self.json_underscoreize,
        )


class SchemaVizCamelCaseJSONRenderer(JSONRenderer):
    json_underscoreize = SCHEMA_VIZ_JSON_UNDERSCOREIZE

    def render(self, data, *args, **kwargs):
        return super().render(
            schema_viz_camelize(data, **self.json_underscoreize),
            *args,
            **kwargs,
        )
