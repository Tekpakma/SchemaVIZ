from rest_framework import serializers


class QLabErrorItemSerializer(serializers.Serializer):
    loc = serializers.ListField(child=serializers.CharField())
    msg = serializers.CharField()
    type = serializers.CharField()
    code = serializers.CharField()


class QLabErrorResponseSerializer(serializers.Serializer):
    errors = QLabErrorItemSerializer(many=True)


class QueryMetadataRequestSerializer(serializers.Serializer):
    app_label = serializers.CharField(max_length=100)
    model_name = serializers.CharField(max_length=100)


class QueryRecordsRequestSerializer(QueryMetadataRequestSerializer):
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        max_length=200,
    )
    select_fields = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )
    filter_fields = serializers.JSONField(required=False)
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(required=False, min_value=1)


class QueryRecordRequestSerializer(QueryMetadataRequestSerializer):
    id = serializers.CharField()
    select_fields = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )


class QueryNeighborhoodRequestSerializer(QueryMetadataRequestSerializer):
    node_pks = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False,
    )


class QueryResultSerializer(serializers.Serializer):
    fields = serializers.DictField()
    display_name = serializers.CharField()


class QueryRecordsResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    next = serializers.IntegerField(allow_null=True)
    previous = serializers.IntegerField(allow_null=True)
    results = QueryResultSerializer(many=True)


class QLabFieldMetadataSerializer(serializers.Serializer):
    name = serializers.CharField()
    type = serializers.CharField()
    label = serializers.CharField()
    required = serializers.BooleanField()
    primary_key = serializers.BooleanField(required=False, default=False)
    allowed_operations = serializers.ListField(
        child=serializers.CharField(),
    )
    related_model = serializers.CharField(
        required=False,
        allow_null=True,
    )
    filter_name = serializers.CharField(
        required=False,
        allow_null=True,
    )
    max_length = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    choices = serializers.ListField(required=False, allow_null=True)


class QueryMetadataResponseSerializer(serializers.Serializer):
    model_name = serializers.CharField()
    app_label = serializers.CharField()
    primary_key_field = serializers.CharField()
    fields = QLabFieldMetadataSerializer(many=True)
    all_lookups = serializers.ListField(
        child=serializers.CharField(),
    )


class QueryNeighborhoodRelationSerializer(serializers.Serializer):
    pks = serializers.ListField(child=serializers.CharField())
    count = serializers.IntegerField(min_value=0)
    filter_name = serializers.CharField()


class QueryNeighborhoodRecordSerializer(serializers.Serializer):
    node_id = serializers.CharField()
    relations = serializers.DictField(child=serializers.DictField())


class QueryNeighborhoodResponseSerializer(serializers.Serializer):
    model = serializers.CharField()
    records = QueryNeighborhoodRecordSerializer(many=True)
