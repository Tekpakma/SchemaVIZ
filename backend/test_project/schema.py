import graphene
import infrastructure.schema


class Query(infrastructure.schema.Query, graphene.ObjectType):
    pass


schema = graphene.Schema(query=Query)
