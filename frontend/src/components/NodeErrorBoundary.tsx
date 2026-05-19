import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type NodeErrorBoundaryProps = {
  children: ReactNode
  /** Optional fallback UI. Defaults to null (silently swallow). */
  fallback?: ReactNode
  /** Called when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

type NodeErrorBoundaryState = {
  hasError: boolean
}

/**
 * Lightweight error boundary for canvas node overlays.
 *
 * Catches render errors in children (e.g. Lexical editor, data reference
 * resolution) and displays either the provided fallback or nothing — preventing
 * the entire canvas from crashing.
 */
export class NodeErrorBoundary extends Component<
  NodeErrorBoundaryProps,
  NodeErrorBoundaryState
> {
  constructor(props: NodeErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): NodeErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)
    console.error('[NodeErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
