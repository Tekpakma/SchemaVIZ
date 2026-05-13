import { defineConfig } from 'orval'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const zodDir = path.join(configDir, 'src', 'api', 'generated', 'zod')
const zodNamedImport = "import { z as zod } from 'zod';"
const zodNamespaceImport = "import * as zod from 'zod';"

function rewriteGeneratedZodImports() {
  for (const entry of readdirSync(zodDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.zod.ts')) continue

    const filePath = path.join(zodDir, entry.name)
    const source = readFileSync(filePath, 'utf8')
    const nextSource = source.replace(zodNamedImport, zodNamespaceImport)

    if (nextSource !== source) {
      writeFileSync(filePath, nextSource)
    }
  }
}

export default defineConfig({
  schemaViz: {
    input: {
      target: './src/api/openapi.json',
    },
    output: {
      client: 'fetch',
      mode: 'single',
      target: './src/api/generated/schema-viz.ts',
      schemas: {
        path: './src/api/generated/zod',
        type: 'zod',
      },
      clean: true,
      override: {
        mutator: {
          path: './src/api/fetch.ts',
          name: 'schemaVizFetch',
        },
      },
    },
    hooks: {
      afterAllFilesWrite: rewriteGeneratedZodImports,
    },
  },
})
