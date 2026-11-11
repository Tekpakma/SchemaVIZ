import type { StartAuthSource } from './sources'

/** A plain, writable source for tests that only need a valid auth context. */
export const TEST_SOURCE: StartAuthSource = {
  id: 'default',
  label: 'Test backend',
  backendBaseUrl: 'http://localhost:8000/schema-viz',
  readOnly: false,
}
