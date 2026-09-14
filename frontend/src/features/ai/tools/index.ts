import {
  getModelDetails,
  getModelDetailsDef,
  getSchemaDigest,
  getSchemaDigestDef,
  listModels,
  listModelsDef,
} from './schemaTools'
import {
  createDiagram,
  createDiagramDef,
  publishDiagram,
  publishDiagramDef,
  validateDiagram,
  validateDiagramDef,
} from './recipeTools'
import {
  findRecords,
  findRecordsDef,
  getRecord,
  getRecordDef,
} from './recordTools'
import { suggestDiagram, suggestDiagramDef } from './landscapeTools'
import { drawDiagram, drawDiagramDef } from './drawTools'

export type { AiToolContext } from './context'
export type { DiagramSpec } from './recipeTools'
export { diagramSpecSchema } from './recipeTools'
export { builderToolDefs } from './builderToolDefs'

/** Tools with a server implementation, for `chat()` and the MCP server. */
export const serverTools = [
  drawDiagram,
  listModels,
  getModelDetails,
  getSchemaDigest,
  findRecords,
  getRecord,
  suggestDiagram,
  validateDiagram,
  createDiagram,
  publishDiagram,
]

/**
 * Read-only subset for the in-app assistant: the canvas itself renders the
 * diagram, and publishing stays a deliberate user action.
 */
export const assistantServerTools = [
  listModels,
  getModelDetails,
  getSchemaDigest,
  findRecords,
  getRecord,
  suggestDiagram,
  validateDiagram,
]

/** Definitions without an implementation, for schema conversion and docs. */
export const serverToolDefs = [
  drawDiagramDef,
  listModelsDef,
  getModelDetailsDef,
  getSchemaDigestDef,
  findRecordsDef,
  getRecordDef,
  suggestDiagramDef,
  validateDiagramDef,
  createDiagramDef,
  publishDiagramDef,
]
