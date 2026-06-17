import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { readFileSync } from 'node:fs'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
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
      // Cache headers tuned so a stale HTML doc (e.g. an open tab from before a
      // deploy) can still resolve its hashed CSS/JS out of the browser cache
      // instead of hitting the new build's missing-old-hash 404.
      //
      //  * /assets/**   — Vite-emitted, content-hashed, safe to cache forever.
      //  * /*.svg|ico|png|webmanifest|json — public/ static, short cache so
      //    branding/manifest tweaks roll out without a hard refresh.
      //  * /**          — SSR HTML; revalidate every nav so users always pick
      //    up the latest asset hashes after a deploy.
      routeRules: {
        '/assets/**': {
          headers: {
            'cache-control': 'public, max-age=31536000, immutable',
          },
        },
        '/favicon.svg': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/favicon.ico': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/logo192.png': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/logo512.png': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/manifest.json': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/robots.txt': {
          headers: { 'cache-control': 'public, max-age=86400' },
        },
        '/**': {
          headers: { 'cache-control': 'no-cache' },
        },
      },
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
