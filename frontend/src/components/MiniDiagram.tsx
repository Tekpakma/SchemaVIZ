import type { TemplateHue } from '@/features/home/types'

const HUE_COLORS: Record<TemplateHue, string> = {
  pink: 'var(--brand)',
  green: 'var(--chart-2)',
  plum: 'var(--chart-5)',
}

interface MiniDiagramProps {
  hue: TemplateHue
  nodeCount?: number
  edgeCount?: number
  seed?: number
  className?: string
}

export function MiniDiagram({
  hue,
  nodeCount = 6,
  edgeCount = 6,
  seed = 1,
  className,
}: MiniDiagramProps) {
  const color = HUE_COLORS[hue]

  const positions = Array.from(
    { length: Math.min(nodeCount, 9) },
    (_, i) => ({
      x: 14 + (((i * 137 + seed * 73) % 100) / 100) * 168,
      y: 16 + (((i * 211 + seed * 41) % 100) / 100) * 100,
    }),
  )

  const links = Array.from({ length: Math.min(edgeCount, 9) }, (_, i) => {
    const a = i % positions.length
    const b = (i + 1 + (seed % 3)) % positions.length
    return [positions[a]!, positions[b]!] as const
  })

  const patternId = `grid-${hue}-${seed}`

  return (
    <svg viewBox="0 0 200 132" className={className}>
      <defs>
        <pattern
          id={patternId}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="0.6" fill="var(--foreground)" opacity="0.08" />
        </pattern>
      </defs>
      <rect width="200" height="132" fill={`url(#${patternId})`} />
      {links.map(([p, q], i) => (
        <path
          key={i}
          d={`M ${p.x} ${p.y} Q ${(p.x + q.x) / 2} ${p.y}, ${q.x} ${q.y}`}
          stroke={color}
          strokeWidth="1.2"
          fill="none"
          opacity="0.55"
        />
      ))}
      {positions.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x - 8}
            y={p.y - 5}
            width={16 + (i % 3) * 4}
            height="10"
            rx="2"
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeWidth="1"
          />
          <circle cx={p.x - 5} cy={p.y} r="1.4" fill={color} />
        </g>
      ))}
    </svg>
  )
}
