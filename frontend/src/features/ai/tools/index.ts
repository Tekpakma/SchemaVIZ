import {
  getModelDetails,
  getModelDetailsDef,
  getSchemaDigest,
  getSchemaDigestDef,
  listModels,
  listModelsDef,
} from './schemaTools'
import { validateDiagram, validateDiagramDef } from './recipeTools'

export type { AiToolContext } from './context'
export type { DiagramSpec } from './recipeTools'
export { diagramSpecSchema } from './recipeTools'

/** Tools with a server implementation, for `chat()` and the MCP server. */
export const serverTools = [
  listModels,
  getModelDetails,
  getSchemaDigest,
  validateDiagram,
]

/** Definitions without an implementation, for schema conversion and docs. */
export const serverToolDefs = [
  listModelsDef,
  getModelDetailsDef,
  getSchemaDigestDef,
  validateDiagramDef,
]
