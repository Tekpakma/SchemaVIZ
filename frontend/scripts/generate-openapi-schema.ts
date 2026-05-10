import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const currentFile = fileURLToPath(import.meta.url)
const scriptsDir = path.dirname(currentFile)
const frontendDir = path.resolve(scriptsDir, '..')
const repoDir = path.resolve(frontendDir, '..')
const backendDir = path.join(repoDir, 'backend')
const openApiPath = path.join(frontendDir, 'src', 'api', 'openapi.json')

mkdirSync(path.dirname(openApiPath), { recursive: true })

const result = spawnSync(
  'uv',
  ['run', 'manage.py', 'spectacular', '--file', openApiPath],
  {
    cwd: backendDir,
    stdio: 'inherit',
  },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
