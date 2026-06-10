import { describe, expect, it } from 'vitest'

import { createStatelessExportRequestFromCanvas } from './export'
import type { CanvasExportSnapshot } from '@/store/canvasStore'
import { extractPlainTextFromHtml } from '@/utils/html'
import {
  CANVAS_BACKGROUND_FALLBACKS,
  CANVAS_EDGE_COLOR_FALLBACK,
  CANVAS_SURFACE_FALLBACKS,
} from './themeColors'

const snapshot = {
  nodesById: {
    'box-1': {
      id: 'box-1',
      kind: 'editable',
      shape: 'box',
      layoutMode: 'manual',
      x: 20,
      y: 40,
      width: 220,
      height: 120,
      lexicalJson: JSON.stringify({
        root: {
          type: 'root',
          children: [],
        },
      }),
      html: '<div>Canvas <b>Box</b><br/>Node</div>',
      contentHeight: 48,
      version: 1,
      appLabel: 'inventory',
      modelName: 'product',
      recordId: '42',
    },
    'group-1': {
      id: 'group-1',
      kind: 'group',
      shape: 'group',
      layoutMode: 'manual',
      x: 400,
      y: 80,
      width: 320,
      height: 220,
      lexicalJson: '',
      html: '<div>Group Label</div>',
      contentHeight: 0,
      version: 1,
    },
  },
  nodeOrder: ['box-1', 'group-1'],
  edgesById: {
    'edge-1': {
      id: 'edge-1',
      sourceNodeId: 'box-1',
      targetNodeId: 'group-1',
      kind: 'default',
    },
  },
  edgeOrder: ['edge-1'],
  viewport: {
    x: 10,
    y: 20,
    scale: 1.25,
  },
  flowDirection: 'LR',
  layoutOptions: {},
} satisfies CanvasExportSnapshot

describe('canvas export serializer', () => {
  it('extracts plain text from HTML with line breaks', () => {
    expect(
      extractPlainTextFromHtml('<div>Canvas <b>Box</b><br/>Node</div>'),
    ).toBe('Canvas Box\nNode')
  })

  it('creates a stateless export request from the current canvas snapshot', () => {
    const request = createStatelessExportRequestFromCanvas(snapshot, {
      resolvedTheme: 'light',
    })

    expect(request).toMatchObject({
      exportFormat: 'svg',
      fileName: 'canvas-export',
      mode: 'fit',
      background: '#ffffff',
      reactFlowState: {
        viewport: {
          x: 10,
          y: 20,
          zoom: 1.25,
        },
      },
    })

    expect(request.lexicalState).toEqual({
      'box-1': {
        root: {
          type: 'root',
          children: [],
        },
      },
    })

    expect(request.reactFlowState).toMatchObject({
      nodes: [
        {
          id: 'box-1',
          type: 'box',
          data: {
            shape: 'box',
            label: 'Canvas Box\nNode',
            appLabel: 'inventory',
            modelName: 'product',
            modelId: '42',
          },
          style: {
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderColor: 'transparent',
            borderRadius: 8,
            borderWidth: 0,
          },
        },
        {
          id: 'group-1',
          type: 'group',
          data: {
            shape: 'group',
            label: 'Group Label',
          },
          style: {
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderColor: '#3b82f6',
            borderRadius: 10,
            borderWidth: 1.5,
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'box-1',
          target: 'group-1',
          sourceHandle: 'box-1:port:RIGHT',
          targetHandle: 'group-1:port:LEFT',
          type: 'elk',
          style: {
            stroke: '#328f97',
            strokeWidth: 1.4,
          },
          data: {
            elkSections: [
              {
                startPoint: { x: 240, y: 160 },
                endPoint: { x: 400, y: 100 },
                bendPoints: [
                  { x: 320, y: 160 },
                  { x: 320, y: 100 },
                ],
              },
            ],
          },
        },
      ],
    })
  })

  it('serializes grouped child positions relative to the group for draw.io', () => {
    const groupedSnapshot = {
      ...snapshot,
      nodesById: {
        'group-1': snapshot.nodesById['group-1'],
        'box-2': {
          id: 'box-2',
          kind: 'editable',
          shape: 'box',
          parentGroupId: 'group-1',
          layoutMode: 'manual',
          x: 460,
          y: 150,
          width: 180,
          height: 90,
          lexicalJson: '',
          html: '<div>Grouped child</div>',
          contentHeight: 32,
          version: 1,
          appLabel: 'inventory',
          modelName: 'product',
        },
      },
      nodeOrder: ['group-1', 'box-2'],
      edgesById: {},
      edgeOrder: [],
    } satisfies CanvasExportSnapshot

    const request = createStatelessExportRequestFromCanvas(groupedSnapshot, {
      resolvedTheme: 'light',
      exportFormat: 'drawio',
    })

    expect(request.reactFlowState.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'box-2',
          parentId: 'group-1',
          parentNode: 'group-1',
          position: { x: 60, y: 70 },
          positionAbsolute: { x: 460, y: 150 },
        }),
      ]),
    )
  })

  it('supports runtime color and request option overrides', () => {
    const request = createStatelessExportRequestFromCanvas(snapshot, {
      resolvedTheme: 'dark',
      exportFormat: 'drawio',
      fileName: 'diagram',
      mode: 'current',
      background: 'transparent',
      width: 1024,
      height: 768,
      scaleFactor: 1.5,
      nodeSurfaceColor: '#101820',
      edgeColor: '#9ef0e8',
    })

    expect(request).toMatchObject({
      exportFormat: 'drawio',
      fileName: 'diagram',
      mode: 'current',
      background: 'transparent',
      width: 1024,
      height: 768,
      scaleFactor: 1.5,
    })

    expect(request.reactFlowState.nodes[0]).toMatchObject({
      id: 'box-1',
      style: {
        backgroundColor: '#101820',
      },
    })
    expect(request.reactFlowState.edges[0]).toMatchObject({
      id: 'edge-1',
      style: {
        stroke: '#9ef0e8',
      },
    })
  })

  it('propagates selected dark appearance and background into SVG export requests', () => {
    const request = createStatelessExportRequestFromCanvas(snapshot, {
      resolvedTheme: 'dark',
      exportFormat: 'svg',
      background: CANVAS_BACKGROUND_FALLBACKS.dark,
    })

    expect(request).toMatchObject({
      exportFormat: 'svg',
      background: CANVAS_BACKGROUND_FALLBACKS.dark,
    })
    expect(request.reactFlowState.nodes[0]).toMatchObject({
      style: {
        backgroundColor: CANVAS_SURFACE_FALLBACKS.dark,
      },
    })
    expect(request.reactFlowState.edges[0]).toMatchObject({
      style: {
        stroke: CANVAS_EDGE_COLOR_FALLBACK.dark,
      },
    })
  })

  it('propagates selected light appearance and transparent background into draw.io export requests', () => {
    const request = createStatelessExportRequestFromCanvas(snapshot, {
      resolvedTheme: 'light',
      exportFormat: 'drawio',
      background: 'transparent',
    })

    expect(request).toMatchObject({
      exportFormat: 'drawio',
      background: 'transparent',
    })
    expect(request.reactFlowState.nodes[0]).toMatchObject({
      style: {
        backgroundColor: CANVAS_SURFACE_FALLBACKS.light,
      },
    })
    expect(request.reactFlowState.edges[0]).toMatchObject({
      style: {
        stroke: CANVAS_EDGE_COLOR_FALLBACK.light,
      },
    })
  })
})
