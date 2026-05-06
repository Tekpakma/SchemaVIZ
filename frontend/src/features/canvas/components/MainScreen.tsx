import { useEffect, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import { RichTextNode } from './RichTextNode'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { LexicalOverlayWrapper } from '@/features/lexical/LexicalOverlay'

export function MainScreen() {
  const [size, setSize] = useState({ width: 800, height: 600 })

  const nodeIds = useCanvasNodeIds()
  const { addNode } = useCanvasActions()

  useEffect(() => {
    const update = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    update()
    window.addEventListener('resize', update)

    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (nodeIds.length > 0) return

    addNode({
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
    })
  }, [addNode, nodeIds.length])

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Stage width={size.width} height={size.height}>
        <Layer>
          {nodeIds.map((id) => (
            <RichTextNode key={id} nodeId={id} />
          ))}
        </Layer>
      </Stage>
      {<LexicalOverlayWrapper />}
    </div>
  )
}
