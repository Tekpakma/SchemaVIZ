import { defineConfig } from 'orval'

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
  },
})
