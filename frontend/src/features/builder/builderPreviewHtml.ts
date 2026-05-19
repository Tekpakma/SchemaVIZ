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
const FALLBACK_ACCENT = '#18181B'

function getSafeAccent(accent?: string) {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : FALLBACK_ACCENT
}

function builderPreviewNodeShellHtml(content: string, accent?: string) {
  const safeAccent = getSafeAccent(accent)
  return `
    <div style="font-family: ${NODE_FONT}; overflow: hidden; border-radius: 9px; border: 1px solid rgba(24, 24, 27, 0.18); background: rgba(255, 255, 255, 0.98);">
      <div style="height: 4px; background: ${safeAccent};"></div>
      ${content}
    </div>
  `
}

export function builderPreviewTemplateNodeHtml(
  textContentHtml: string,
  accent?: string,
) {
  return builderPreviewNodeShellHtml(textContentHtml, accent)
}

export function builderPreviewNodeHtml(
  title: string,
  subtitle: string,
  accent?: string,
) {
  return builderPreviewNodeShellHtml(
    `
    <div style="padding: 12px 14px 14px;">
      <div style="font-size: 13px; font-weight: 700; color: ${SCHEMA_NODE_TITLE_COLOR.light};">${escapeHtml(title)}</div>
      <div style="margin-top: 7px; font-size: 10px; color: ${SCHEMA_NODE_FIELD_COLOR.light};">${escapeHtml(subtitle)}</div>
    </div>
  `,
    accent,
  )
}

// ---------------------------------------------------------------------------
// Editable node HTML — no shell border/background (Konva surface provides those)
// ---------------------------------------------------------------------------

function editableAccentBar(accent?: string) {
  const safeAccent = getSafeAccent(accent)
  return `<div style="height: 4px; background: ${safeAccent};"></div>`
}

/**
 * HTML for editable preview nodes. Only renders the accent bar + text content.
 * The outer shape, background, and border come from the Konva RichTextNodeSurface.
 */
export function builderEditableNodeHtml(
  title: string,
  subtitle: string,
  accent?: string,
) {
  return `
    <div style="font-family: ${NODE_FONT}; overflow: hidden;">
      ${editableAccentBar(accent)}
      <div style="padding: 12px 14px 14px;">
        <div style="font-size: 13px; font-weight: 700; color: ${SCHEMA_NODE_TITLE_COLOR.light};">${escapeHtml(title)}</div>
        <div style="margin-top: 7px; font-size: 10px; color: ${SCHEMA_NODE_FIELD_COLOR.light};">${escapeHtml(subtitle)}</div>
      </div>
    </div>
  `
}

/**
 * HTML for editable template preview nodes with custom text content.
 */
export function builderEditableTemplateNodeHtml(
  textContentHtml: string,
  accent?: string,
) {
  return `
    <div style="font-family: ${NODE_FONT}; overflow: hidden;">
      ${editableAccentBar(accent)}
      ${textContentHtml}
    </div>
  `
}

export function builderPreviewGroupLabelHtml(label: string, accent?: string) {
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
