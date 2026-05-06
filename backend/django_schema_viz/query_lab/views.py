from __future__ import annotations

from dataclasses import dataclass

from django.apps import apps
from django.db import models
from qlab.mixins import NeighborhoodMixin, QLabMetadataMixin, QLabMixin
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from django_schema_viz.drf import (
    SchemaVizCamelCaseJSONParser as CamelCaseJSONParser,
    SchemaVizCamelCaseJSONRenderer as CamelCaseJSONRenderer,
)
from django_schema_viz.mixins import SchemaVizViewMixin
from django_schema_viz.schema_compat import extend_schema
from django_schema_viz.serializers import DynamicModelSerializer, ErrorResponseSerializer
from django_schema_viz.utils.qlab_access import is_model_accessible_for_user

from .serializers import (
    QLabErrorResponseSerializer,
    QueryMetadataRequestSerializer,
    QueryMetadataResponseSerializer,
    QueryNeighborhoodRequestSerializer,
    QueryNeighborhoodResponseSerializer,
    QueryRecordRequestSerializer,
    QueryRecordsRequestSerializer,
    QueryRecordsResponseSerializer,
    QueryResultSerializer,
)


@dataclass
class _ResolvedModel:
    app_label: str
    model_name: str
    model: type[models.Model]


class _ProxyRequest:
    def __init__(self, request, data):
        self._request = request
        self.data = data

    def __getattr__(self, name):
        return getattr(self._request, name)


class SchemaVizQLabBaseView(SchemaVizViewMixin, GenericAPIView):
    schema_viz_permission_category = "introspection"
    renderer_classes = [CamelCaseJSONRenderer]
    parser_classes = [CamelCaseJSONParser]

    @staticmethod
    def _error_response(message: str, status_code: int) -> Response:
        return Response({"error": message}, status=status_code)

    def _resolve_model(self, app_label: str, model_name: str) -> _ResolvedModel | Response:
        if not is_model_accessible_for_user(self.request.user, app_label, model_name):
            return self._error_response(
                f"Model {app_label}.{model_name} is not accessible",
                status.HTTP_403_FORBIDDEN,
            )

        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            return self._error_response(
                f"Model {app_label}.{model_name} not found",
                status.HTTP_404_NOT_FOUND,
            )

        return _ResolvedModel(app_label=app_label, model_name=model_name, model=model)

    def get_queryset(self, model):
        return model._default_manager.all()

    @staticmethod
    def _default_select_fields(model: type[models.Model]) -> list[str]:
        return [field.name for field in model._meta.concrete_fields]

    @staticmethod
    def _normalize_record_row(
        row: dict[str, object],
        pk_field: str,
        display_name: str,
    ) -> dict[str, object]:
        normalized = dict(row)
        if "id" not in normalized:
            normalized["id"] = normalized.get(pk_field)
        return {"fields": normalized, "display_name": display_name}

    def _normalize_results_page(
        self,
        *,
        model: type[models.Model],
        payload: dict[str, object],
        raw_results: list[dict[str, object]],
    ) -> dict[str, object]:
        pk_field = model._meta.pk.name
        pk_values = [
            row.get("id", row.get(pk_field))
            for row in raw_results
            if row.get("id", row.get(pk_field)) is not None
        ]
        instance_map = model._default_manager.in_bulk(pk_values)
        results = [
            self._normalize_record_row(
                row,
                pk_field=pk_field,
                display_name=str(instance_map.get(row.get("id", row.get(pk_field))))
                if instance_map.get(row.get("id", row.get(pk_field))) is not None
                else str(row.get("id", row.get(pk_field), "")),
            )
            for row in raw_results
        ]

        normalized = dict(payload)
        normalized["results"] = results
        return normalized

    @staticmethod
    def _normalize_neighborhood_payload(
        payload: dict[str, object],
    ) -> dict[str, object]:
        raw_records = payload.get("records", [])
        records: list[dict[str, object]] = []

        if isinstance(raw_records, list):
            for raw_record in raw_records:
                if not isinstance(raw_record, dict):
                    continue

                raw_relations = raw_record.get("relations", {})
                relations: dict[str, dict[str, object]] = {}
                if isinstance(raw_relations, dict):
                    for relation_name, relation_payload in raw_relations.items():
                        if not isinstance(relation_name, str) or not isinstance(
                            relation_payload, dict
                        ):
                            continue

                        raw_pks = relation_payload.get("pks", [])
                        pks = (
                            [str(pk) for pk in raw_pks if pk is not None]
                            if isinstance(raw_pks, list)
                            else []
                        )
                        raw_count = relation_payload.get("count")
                        count = (
                            int(raw_count)
                            if isinstance(raw_count, int)
                            else len(pks)
                        )
                        filter_name = relation_payload.get(
                            "filter_name", relation_name
                        )
                        relations[relation_name] = {
                            "pks": pks,
                            "count": max(0, count),
                            "filter_name": str(filter_name),
                        }

                node_id = raw_record.get("nodeId", raw_record.get("node_id"))
                if node_id is None:
                    continue

                records.append(
                    {
                        "node_id": str(node_id),
                        "relations": relations,
                    }
                )

        return {
            "model": str(payload.get("model", "")),
            "records": records,
        }


class QueryRecordsView(SchemaVizQLabBaseView, QLabMixin):
    @extend_schema(
        summary="Query Model Records",
        description=(
            "Run a QLab-backed record query against an accessible model. "
            "Supports nested AND/OR/NOT filters and pagination."
        ),
        request=QueryRecordsRequestSerializer,
        responses={
            200: QueryRecordsResponseSerializer,
            400: QLabErrorResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def post(self, request):
        serializer = QueryRecordsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        app_label = validated["app_label"]
        model_name = validated["model_name"]
        resolved = self._resolve_model(app_label, model_name)
        if isinstance(resolved, Response):
            return resolved

        payload = {
            "model": model_name,
            "app_label": app_label,
            "select_fields": validated.get("select_fields")
            or self._default_select_fields(resolved.model),
            "filter_fields": validated.get("filter_fields"),
            "page": validated.get("page", 1),
        }
        if validated.get("page_size") is not None:
            payload["page_size"] = validated["page_size"]

        proxy_request = _ProxyRequest(request, payload)
        response = QLabMixin.post(self, proxy_request)
        if response.status_code != status.HTTP_200_OK:
            return response

        normalized = self._normalize_results_page(
            model=resolved.model,
            payload=response.data,
            raw_results=list(response.data.get("results", [])),
        )
        return Response(QueryRecordsResponseSerializer(normalized).data)


class QueryRecordView(SchemaVizQLabBaseView, QLabMixin):
    @extend_schema(
        summary="Query Single Record",
        description=(
            "Fetch a single accessible record by primary key. "
            "When `selectFields` is omitted the full record payload is returned."
        ),
        request=QueryRecordRequestSerializer,
        responses={
            200: QueryResultSerializer,
            400: QLabErrorResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def post(self, request):
        serializer = QueryRecordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        app_label = validated["app_label"]
        model_name = validated["model_name"]
        record_id = validated["id"]
        resolved = self._resolve_model(app_label, model_name)
        if isinstance(resolved, Response):
            return resolved

        if not validated.get("select_fields"):
            try:
                instance = resolved.model._default_manager.get(pk=record_id)
            except resolved.model.DoesNotExist:
                return self._error_response(
                    f"Record with pk={record_id} not found",
                    status.HTTP_404_NOT_FOUND,
                )

            serializer_class = DynamicModelSerializer.for_model(resolved.model)
            payload = QueryResultSerializer(
                {
                    "fields": serializer_class(instance).data,
                    "display_name": str(instance),
                }
            )
            return Response(payload.data)

        proxy_request = _ProxyRequest(
            request,
            {
                "model": model_name,
                "app_label": app_label,
                "select_fields": validated["select_fields"],
                "filter_fields": {
                    "and_operation": [
                        {
                            "field": resolved.model._meta.pk.name,
                            "op": "is",
                            "value": str(record_id),
                        }
                    ]
                },
                "page": 1,
                "page_size": 1,
            },
        )
        response = QLabMixin.post(self, proxy_request)
        if response.status_code != status.HTTP_200_OK:
            return response

        raw_results = list(response.data.get("results", []))
        if not raw_results:
            return self._error_response(
                f"Record with pk={record_id} not found",
                status.HTTP_404_NOT_FOUND,
            )

        normalized = self._normalize_results_page(
            model=resolved.model,
            payload=response.data,
            raw_results=raw_results,
        )
        return Response(QueryResultSerializer(normalized["results"][0]).data)


class QueryMetadataView(SchemaVizQLabBaseView, QLabMetadataMixin):
    @extend_schema(
        summary="Get Query Metadata",
        description=(
            "Return QLab metadata for an accessible model, including allowed lookups "
            "and operations for advanced record search UIs."
        ),
        request=QueryMetadataRequestSerializer,
        responses={
            200: QueryMetadataResponseSerializer,
            400: QLabErrorResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def post(self, request):
        serializer = QueryMetadataRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        app_label = validated["app_label"]
        model_name = validated["model_name"]
        resolved = self._resolve_model(app_label, model_name)
        if isinstance(resolved, Response):
            return resolved

        proxy_request = _ProxyRequest(
            request,
            {
                "model": model_name,
                "app_label": app_label,
            },
        )
        response = QLabMetadataMixin.metadata(self, proxy_request)
        if response.status_code != status.HTTP_200_OK:
            return response
        return Response(QueryMetadataResponseSerializer(response.data).data)


class QueryNeighborhoodView(SchemaVizQLabBaseView, NeighborhoodMixin):
    @extend_schema(
        summary="Resolve Record Neighborhood",
        description=(
            "Return all relation primary keys for a set of accessible records. "
            "Used to power relation-follow UIs without issuing repeated reverse-record queries."
        ),
        request=QueryNeighborhoodRequestSerializer,
        responses={
            200: QueryNeighborhoodResponseSerializer,
            400: QLabErrorResponseSerializer,
            403: ErrorResponseSerializer,
            404: ErrorResponseSerializer,
        },
        tags=["Query"],
    )
    def post(self, request):
        serializer = QueryNeighborhoodRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        app_label = validated["app_label"]
        model_name = validated["model_name"]
        resolved = self._resolve_model(app_label, model_name)
        if isinstance(resolved, Response):
            return resolved

        proxy_request = _ProxyRequest(
            request,
            {
                "model": model_name,
                "app_label": app_label,
                "node_pks": validated["node_pks"],
            },
        )
        response = NeighborhoodMixin.neighborhood(self, proxy_request)
        if response.status_code != status.HTTP_200_OK:
            return response

        normalized = self._normalize_neighborhood_payload(response.data)
        return Response(QueryNeighborhoodResponseSerializer(normalized).data)
