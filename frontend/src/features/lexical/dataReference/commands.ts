import type { LexicalCommand } from 'lexical'
import { createCommand } from 'lexical'

export type InlineTextStylePatch = Record<string, string>

export const INSERT_DATA_REFERENCE_COMMAND: LexicalCommand<string> =
  createCommand()
export const APPLY_INLINE_TEXT_STYLE_COMMAND: LexicalCommand<InlineTextStylePatch> =
  createCommand()
