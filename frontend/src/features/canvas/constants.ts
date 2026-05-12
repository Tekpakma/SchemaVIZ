import type { CanvasEdge, CanvasNode } from './model/types'
import {
  DEFAULT_CANVAS_NODE_SHAPE,
  DEFAULT_CANVAS_NODE_SHAPE_NAME,
} from './nodeShapes'

export const CANVAS_INITIAL_STAGE_SIZE = {
  width: 800,
  height: 600,
}

export const CANVAS_MIN_SCALE = 0.25
export const CANVAS_MAX_SCALE = 4
export const CANVAS_SCALE_STEP = 1.06
export const CANVAS_HELPER_LINE_SNAP_RADIUS = 6
export const CANVAS_HELPER_LINE_MAX_CANDIDATE_DISTANCE = 800

export const DEFAULT_CANVAS_NODES: CanvasNode[] = [
  {
    id: 'node-1',
    shape: DEFAULT_CANVAS_NODE_SHAPE_NAME,
    layoutMode: 'manual',
    appLabel: 'infrastructure',
    modelName: 'server',
    recordId: '2',
    x: 80,
    y: 80,
    width: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.width,
    height: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.height,
    lexicalJson: '',
    html: `
        <div style="font-family: sans-serif; padding: 10px;">
          <b style="color: #2563eb;">{{hostname}}</b>
          <div style="font-size: 11px; margin-top: 4px;">Status: {{status}}</div>
          <div style="color: gray; font-size: 10px;">IP: {{ip_address}}</div>
          <div style="color: gray; font-size: 10px;">Type: {{instance_type}}</div>
          <div style="color: gray; font-size: 10px;">Env: {{environment.name}}</div>
        </div>
      `,
    contentHeight: 0,
    version: 1,
  },
  {
    id: 'node-2',
    shape: DEFAULT_CANVAS_NODE_SHAPE_NAME,
    layoutMode: 'manual',
    appLabel: 'infrastructure',
    modelName: 'server',
    recordId: '3',
    x: 300,
    y: 200,
    width: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.width,
    height: DEFAULT_CANVAS_NODE_SHAPE.defaultSize.height,
    lexicalJson: '',
    html: `
        <div style="font-family: sans-serif; padding: 10px;">
          <b style="color: #16a34a;">{{hostname}}</b>
          <div style="font-size: 11px; margin-top: 4px;">Status: {{status}}</div>
          <div style="color: gray; font-size: 10px;">IP: {{ip_address}}</div>
          <div style="color: gray; font-size: 10px;">Subnet: {{subnet.cidr_block}}</div>
        </div>
      `,
    contentHeight: 0,
    version: 1,
  },
]

export const DEFAULT_CANVAS_EDGES: CanvasEdge[] = [
  {
    id: 'edge-1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    kind: 'default',
    sourceLabel: 'reads',
  },
]

export const DEFAULT_CANVAS_NODE = DEFAULT_CANVAS_NODES[0] as CanvasNode
