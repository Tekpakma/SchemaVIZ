/**
 * System prompt for the in-app assistant. The current diagram is appended per
 * request so the model never has to ask what is on the canvas.
 */

export type DiagramSnapshot = {
  title: string
  rootModel: string | null
  models: Array<string>
  edges: Array<{ from: string; to: string; via: string }>
  layoutDirection: string
  activeRecord: { id: string; label: string } | null
}

const BASE_PROMPT = `You are the diagram assistant inside SchemaVIZ, a tool that draws diagrams of a Django project's data: models, their relationships and the real records behind them.

The user is looking at the diagram builder. Your job is to turn what they ask for into a diagram on their canvas.

How to work:
1. Model ids have the form "app_label.ModelName". Never guess one; use listModels or getSchemaDigest.
2. For "draw my whole landscape / everything around X" start with suggestDiagram — it walks the schema for you. For a targeted diagram, use getModelDetails to get exact relationship names and build the steps yourself.
3. Always run validateDiagram before applyDiagramSpec and fix every error it reports.
4. When the user names a concrete thing ("the Retail business group"), resolve it with findRecords and then call setRootRecord so the canvas shows live data. If several records match, ask which one.
5. Prefer editing the current diagram (merge, removeModels, setLayoutDirection) over rebuilding it from scratch.
6. After changing the canvas, summarise in one or two sentences what is now shown and mention noteworthy things you left out (for example relationships skipped because a model was already reached). Do not repeat the raw specification.

Answer in the user's language. Be concise; the canvas is the answer, your text is the caption.`

function describeSnapshot(snapshot: DiagramSnapshot): string {
  if (snapshot.models.length === 0) {
    return 'Current canvas: empty (no models yet).'
  }

  const edges = snapshot.edges.length
    ? snapshot.edges
        .map((edge) => `  - ${edge.from} --${edge.via}--> ${edge.to}`)
        .join('\n')
    : '  (none)'
  const record = snapshot.activeRecord
    ? `${snapshot.activeRecord.label} (id ${snapshot.activeRecord.id})`
    : 'none (structure preview)'

  return [
    `Current canvas: "${snapshot.title}"`,
    `Root model: ${snapshot.rootModel ?? 'none'}`,
    `Models (${snapshot.models.length}): ${snapshot.models.join(', ')}`,
    `Relationships:\n${edges}`,
    `Layout direction: ${snapshot.layoutDirection}`,
    `Live record: ${record}`,
  ].join('\n')
}

export function buildAssistantSystemPrompts(
  snapshot: DiagramSnapshot | null,
): Array<string> {
  return snapshot ? [BASE_PROMPT, describeSnapshot(snapshot)] : [BASE_PROMPT]
}
