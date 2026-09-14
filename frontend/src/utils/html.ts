export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

export function extractPlainTextFromHtml(value: string) {
  const normalized = decodeHtmlEntities(
    value
      // Inline stylesheets/scripts carry no visible text.
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|h[1-6]|li|tr|section)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' '),
  )

  return normalized
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.replace(/\s+/g, ' ').trim()
      return trimmed ? [trimmed] : []
    })
    .join('\n')
}
