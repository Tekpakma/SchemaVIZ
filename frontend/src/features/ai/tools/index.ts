import {
  getModelDetails,
  getModelDetailsDef,
  getSchemaDigest,
  getSchemaDigestDef,
  listModels,
  listModelsDef,
} from './schemaTools'

export type { AiToolContext } from './context'

/** Tools with a server implementation, for `chat()` and the MCP server. */
export const serverTools = [listModels, getModelDetails, getSchemaDigest]

/** Definitions without an implementation, for schema conversion and docs. */
export const schemaToolDefs = [
  listModelsDef,
  getModelDetailsDef,
  getSchemaDigestDef,
]
