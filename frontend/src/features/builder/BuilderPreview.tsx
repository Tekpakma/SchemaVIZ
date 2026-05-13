const COLUMNS = [60, 260, 460, 660] as const
const ROWS = [80, 180, 280, 380] as const
const LAYER_COLORS = ['var(--brand)', 'var(--chart-2)', 'var(--chart-5)', 'var(--foreground)']

export function BuilderPreview() {
  return (
    <svg viewBox="0 0 800 460" className="h-full w-full">
      <defs>
        <pattern
          id="b-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="2"
            cy="2"
            r="1"
            fill="var(--foreground)"
            opacity="0.08"
          />
        </pattern>
      </defs>
      <rect width="800" height="460" fill="url(#b-grid)" />

      <g
        fontFamily="var(--font-mono)"
        fontSize="9"
        fill="var(--muted-foreground)"
        letterSpacing="0.18em"
      >
        {COLUMNS.map((cx, i) => (
          <text key={i} x={cx} y="36">
            LAYER {i + 1}
          </text>
        ))}
      </g>

      {COLUMNS.map((cx, ci) =>
        ROWS.map((cy, ri) => (
          <g key={`${ci}-${ri}`} transform={`translate(${cx} ${cy})`}>
            <rect
              width="120"
              height="60"
              rx="8"
              fill="var(--card)"
              stroke="var(--foreground)"
              strokeWidth="1.5"
            />
            <rect
              x="0"
              y="0"
              width="3"
              height="60"
              rx="1.5"
              fill={LAYER_COLORS[ci]}
            />
            <circle cx="14" cy="14" r="3" fill={LAYER_COLORS[ci]} />
            <text
              x="22"
              y="17"
              fontFamily="var(--font-mono)"
              fontSize="6.5"
              letterSpacing="0.14em"
              fill="var(--muted-foreground)"
            >
              NODE
            </text>
            <text
              x="10"
              y="38"
              fontFamily="var(--font-sans)"
              fontSize="11"
              fontWeight="600"
              fill="var(--foreground)"
            >
              node_{ci}_{ri}
            </text>
          </g>
        )),
      )}

      {([
        [180, 260],
        [260, 460],
        [460, 660],
      ] as const).map(([x1, x2], i) =>
        ROWS.map((y, ri) => (
          <path
            key={`${i}-${ri}`}
            d={`M ${x1} ${y + 30} C ${(x1 + x2) / 2} ${y + 30}, ${(x1 + x2) / 2} ${y + 30}, ${x2} ${y + 30}`}
            stroke={LAYER_COLORS[i]}
            strokeWidth="1.3"
            fill="none"
            opacity="0.6"
          />
        )),
      )}
    </svg>
  )
}
