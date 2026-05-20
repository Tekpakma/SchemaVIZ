import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: 'bun',
      // elkjs/lib/elk-worker.min.js is loaded via require.resolve() at runtime
      // for the Web Worker. Full-trace copies the package into .output/node_modules/.
      traceDeps: ['elkjs*'],
    }),
    viteReact(),
    svgr(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
})

export default config
