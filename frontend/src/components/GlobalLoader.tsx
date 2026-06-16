/**
 * SchemaVIZ — Global Loader (Trace Pulse)
 *
 * Portable Suspense / Pending fallback for TanStack Router.
 * Pure CSS animation — no setInterval, no flicker on remount.
 *
 * Variants:
 *   "page"   → fixed overlay filling the viewport (route transitions)
 *   "inline" → fills parent container (panels, sheets, sidebars)
 *   "bare"   → animation only, no caption (tight spaces)
 */

import { cn } from '@/lib/utils'

const STYLE_ID = '__svz-loader-styles'

const KEYFRAMES = `
@keyframes svz-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
@keyframes svz-node-fill {
  0%, 24%   { background: var(--svz-paper); border-color: var(--svz-ink); }
  25%, 74%  { background: var(--svz-wash); border-color: var(--svz-accent); }
  75%, 100% { background: var(--svz-paper); border-color: var(--svz-ink); }
}
@keyframes svz-node-mark {
  0%, 24%   { background: var(--svz-mute); transform: scale(1); }
  25%, 74%  { background: var(--svz-accent); transform: scale(1.3); }
  75%, 100% { background: var(--svz-mute); transform: scale(1); }
}
@keyframes svz-link-fill {
  0%, 49%   { background: var(--svz-mute); }
  50%, 100% { background: var(--svz-accent); }
}
@media (prefers-reduced-motion: reduce) {
  .svz-loader * { animation-duration: 6s !important; animation-timing-function: linear !important; }
  .svz-loader .svz-bar > * { animation: none !important; opacity: 0.5; }
}
`

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = KEYFRAMES
  document.head.appendChild(el)
}

type GlobalLoaderVariant = 'page' | 'inline' | 'bare'

type GlobalLoaderProps = {
  className?: string
  label?: string
  nodes?: number
  speed?: number
  sub?: string
  variant?: GlobalLoaderVariant
}

export function GlobalLoader({
  className,
  label,
  nodes = 4,
  speed = 320,
  sub,
  variant = 'page',
}: GlobalLoaderProps) {
  injectStyles()

  const cycle = speed * nodes

  return (
    <output
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'svz-loader flex flex-col items-center justify-center gap-6',
        variant === 'page' && 'fixed inset-0 z-[9999] bg-background',
        variant === 'inline' && 'relative min-h-[200px] h-full w-full',
        className,
      )}
      style={
        {
          '--svz-accent': 'var(--primary)',
          '--svz-ink': 'var(--foreground)',
          '--svz-paper': 'var(--background)',
          '--svz-mute': 'var(--border)',
          '--svz-wash': 'var(--accent)',
        } as React.CSSProperties
      }
    >
      {variant === 'page' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border"
        />
      )}

      {/* Node row */}
      <div className="relative z-[1] flex items-center gap-3.5">
        {Array.from({ length: nodes }).map((_, i) => (
          <NodeWithLink
            key={i}
            cycle={cycle}
            delay={i * speed}
            isLast={i === nodes - 1}
          />
        ))}
      </div>

      {/* Sweep bar */}
      <div className="svz-bar relative z-[1] h-0.5 w-60 overflow-hidden rounded-full bg-border">
        <div
          className="absolute inset-0 w-2/5"
          style={{
            background:
              'linear-gradient(to right, transparent, var(--svz-accent), transparent)',
            animation: 'svz-sweep 900ms ease-in-out infinite',
          }}
        />
      </div>

      {/* Caption */}
      {variant !== 'bare' && (label || sub) && (
        <div className="relative z-[1] flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-px w-5 bg-primary" />
            SchemaVIZ
          </span>
          {label && (
            <div className="text-[13.5px] font-semibold tracking-tight text-foreground">
              {label}
            </div>
          )}
          {sub && (
            <div className="font-mono text-[11px] tracking-wide text-muted-foreground">
              {sub}
            </div>
          )}
        </div>
      )}

      {/* Screen-reader-only label */}
      <span className="sr-only">{label || 'Loading…'}</span>
    </output>
  )
}

function NodeWithLink({
  cycle,
  delay,
  isLast,
}: {
  cycle: number
  delay: number
  isLast: boolean
}) {
  return (
    <>
      <div
        className="grid size-[38px] place-items-center rounded-md border-[1.5px] shadow-[2.5px_2.5px_0_0_var(--svz-ink)]"
        style={{
          background: 'var(--svz-paper)',
          borderColor: 'var(--svz-ink)',
          animation: `svz-node-fill ${cycle}ms linear infinite`,
          animationDelay: `${delay}ms`,
        }}
      >
        <span
          className="size-2 rounded-[2px]"
          style={{
            background: 'var(--svz-mute)',
            animation: `svz-node-mark ${cycle}ms linear infinite`,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {!isLast && (
        <div
          className="h-[1.6px] w-3.5"
          style={{
            background: 'var(--svz-mute)',
            animation: `svz-link-fill ${cycle}ms linear infinite`,
            animationDelay: `${delay + cycle / (2 * 4)}ms`,
          }}
        />
      )}
    </>
  )
}

export function PageLoader(props: Omit<GlobalLoaderProps, 'variant'>) {
  return <GlobalLoader variant="page" {...props} />
}

export function InlineLoader(props: Omit<GlobalLoaderProps, 'variant'>) {
  return <GlobalLoader variant="inline" {...props} />
}

export function BareLoader(props: Omit<GlobalLoaderProps, 'variant'>) {
  return <GlobalLoader variant="bare" {...props} />
}
