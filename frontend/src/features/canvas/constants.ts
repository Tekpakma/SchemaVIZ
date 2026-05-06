import type { CanvasNode } from './model/types'

export const CANVAS_INITIAL_STAGE_SIZE = {
  width: 800,
  height: 600,
}

export const CANVAS_MIN_SCALE = 0.25
export const CANVAS_MAX_SCALE = 4
export const CANVAS_SCALE_STEP = 1.06

export const DEFAULT_CANVAS_NODE: CanvasNode = {
  id: 'node-1',
  x: 80,
  y: 80,
  width: 220,
  height: 120,
  lexicalJson: '',
  html: `
        <div style="font-family: sans-serif; padding: 10px;">
          <b style="color: #2563eb;">SERVER_01</b>
          <div style="font-size: 11px; margin-top: 4px;">CPU Usage</div>
          <div style="color: gray; font-size: 10px;">Value: 42%</div>
        </div>
      `,
  contentHeight: 0,
  version: 1,
}
