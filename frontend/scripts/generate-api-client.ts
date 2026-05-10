import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const currentFile = fileURLToPath(import.meta.url)
const scriptsDir = path.dirname(currentFile)
const frontendDir = path.resolve(scriptsDir, '..')

const commands = [
  {
    command: 'bun',
    args: ['./scripts/generate-openapi-schema.ts'],
  },
  {
    command: 'bunx',
    args: ['--bun', 'orval', '--config', 'orval.config.ts'],
  },
]

for (const { command, args } of commands) {
  const result = spawnSync(command, args, {
    cwd: frontendDir,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
