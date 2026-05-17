import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { handleStartAuthRequest, proxySchemaVizRequest } from './serverAuth/startAuth'

export default createServerEntry({
  async fetch(request) {
    const authResponse = await handleStartAuthRequest(request)
    if (authResponse) return authResponse

    const proxyResponse = await proxySchemaVizRequest(request)
    if (proxyResponse) return proxyResponse

    return handler.fetch(request)
  },
})
