export class GenerationTemplateNotFoundError extends Error {
  constructor(readonly templateId: string) {
    super(`Generation template not found: ${templateId}`)
    this.name = 'GenerationTemplateNotFoundError'
  }
}

export function isGenerationTemplateNotFoundError(
  error: unknown,
): error is GenerationTemplateNotFoundError {
  return error instanceof GenerationTemplateNotFoundError
}
