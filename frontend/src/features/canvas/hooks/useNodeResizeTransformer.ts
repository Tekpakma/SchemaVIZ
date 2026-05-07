import { useCallback, useEffect, useRef } from 'react'
import type Konva from 'konva'

export type NodeResizeFrame = {
  x: number
  y: number
  width: number
  height: number
}

type TransformerBox = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type NodeResizeTransformerOptions = {
  isEnabled: boolean
  frame: NodeResizeFrame
  minSize: {
    width: number
    height: number
  }
  onResizeEnd: (frame: NodeResizeFrame) => void
}

/**
 * Wires a Konva Transformer to a node and converts transform scale into a frame.
 * Konva keeps width/height unchanged while resizing, so callers receive real
 * dimensions on transform end and can persist them in app state.
 */
export function useNodeResizeTransformer({
  isEnabled,
  frame,
  minSize,
  onResizeEnd,
}: NodeResizeTransformerOptions) {
  const nodeRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!isEnabled || !nodeRef.current || !transformerRef.current) return

    transformerRef.current.nodes([nodeRef.current])
    transformerRef.current.forceUpdate()
    transformerRef.current.getLayer()?.batchDraw()
  }, [frame, isEnabled])

  const handleTransformEnd = useCallback(() => {
    const target = nodeRef.current
    if (!target) return

    const nextFrame = {
      x: Math.round(target.x()),
      y: Math.round(target.y()),
      width: Math.round(frame.width * target.scaleX()),
      height: Math.round(frame.height * target.scaleY()),
    }

    target.scaleX(1)
    target.scaleY(1)

    onResizeEnd(nextFrame)
  }, [frame.height, frame.width, onResizeEnd])

  const boundBoxFunc = useCallback(
    (oldBox: TransformerBox, newBox: TransformerBox) => {
      if (
        Math.abs(newBox.width) < minSize.width ||
        Math.abs(newBox.height) < minSize.height
      ) {
        return oldBox
      }

      return newBox
    },
    [minSize.height, minSize.width],
  )

  return {
    nodeRef,
    transformerRef,
    handleTransformEnd,
    transformerProps: {
      flipEnabled: false,
      rotateEnabled: false,
      boundBoxFunc,
    },
  }
}
