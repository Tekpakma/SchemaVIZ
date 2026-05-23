import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical'
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection'

import { APPLY_INLINE_TEXT_STYLE_COMMAND } from './dataReference/commands'

export type TextSizePreset = 'small' | 'normal' | 'large' | 'veryLarge'

export const TEXT_SIZE_PRESETS: ReadonlyArray<{
  key: TextSizePreset
  css: string
}> = [
  { key: 'small', css: '10px' },
  { key: 'normal', css: '' },
  { key: 'large', css: '16px' },
  { key: 'veryLarge', css: '22px' },
]

export function cssToTextSizePreset(css: string): TextSizePreset {
  const trimmed = css.trim()
  if (trimmed === '10px') return 'small'
  if (trimmed === '16px') return 'large'
  if (trimmed === '22px') return 'veryLarge'
  return 'normal'
}

export function readSelectionTextSize(): TextSizePreset {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return 'normal'
  const value = $getSelectionStyleValueForProperty(
    selection,
    'font-size',
    '',
  )
  return cssToTextSizePreset(value)
}

export function applyTextSize(
  editor: LexicalEditor,
  preset: TextSizePreset,
): void {
  const css =
    TEXT_SIZE_PRESETS.find((p) => p.key === preset)?.css ?? ''
  editor.focus(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'font-size': css })
      }
    })
    editor.dispatchCommand(APPLY_INLINE_TEXT_STYLE_COMMAND, {
      'font-size': css,
    })
  })
}
