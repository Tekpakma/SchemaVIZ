/**
 * Shared HTML builders for builder preview nodes and group labels.
 * Used by both the structural preview (builderPreviewLayout) and
 * the generation preview (generationPreviewGraph).
 */

import {
  SCHEMA_NODE_FIELD_COLOR,
  SCHEMA_NODE_TITLE_COLOR,
} from '@/features/canvas/themeColors'
import { escapeHtml } from '@/utils/html'

const NODE_FONT = 'Inter, system-ui, sans-serif'
const GROUP_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function builderPreviewNodeHtml(title: string, subtitle: string) {
  return `
    <div style="font-family: ${NODE_FONT}; padding: 14px 16px;">
      <div style="font-size: 13px; font-weight: 700; color: ${SCHEMA_NODE_TITLE_COLOR.light};">${escapeHtml(title)}</div>
      <div style="margin-top: 7px; font-size: 10px; color: ${SCHEMA_NODE_FIELD_COLOR.light};">${escapeHtml(subtitle)}</div>
    </div>
  `
}

export function builderPreviewGroupLabelHtml(
  label: string,
  accent?: string,
) {
  const stripe = accent
    ? `<div style="width: 3px; height: 12px; border-radius: 2px; background: ${accent}; opacity: 0.7;"></div>`
    : ''

  return `
    <div style="font-family: ${GROUP_FONT}; padding: 8px 12px; display: flex; align-items: center; gap: 8px;">
      ${stripe}
      <span style="font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.5;">${escapeHtml(label)}</span>
    </div>
  `
}
