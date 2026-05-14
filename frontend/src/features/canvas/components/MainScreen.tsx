import { CanvasHelperLinesProvider } from '../hooks/useCanvasHelperLines'
import { CanvasSurface } from './CanvasSurface'

export function MainScreen() {
  return (
    <CanvasHelperLinesProvider>
      <CanvasSurface />
    </CanvasHelperLinesProvider>
  )
}
