interface StyleStepProps {
  swatches: string[]
}

export function StyleStep({ swatches }: StyleStepProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* TODO: Wire to setSwatch action — open color picker per swatch */}
      {swatches.map((color, i) => (
        <div key={i} className="flex items-center gap-3">
          <span
            className="size-7 shrink-0 rounded-md border border-border shadow-sm"
            style={{ background: color }}
          />
          <code className="text-[12px] text-muted-foreground">{color}</code>
        </div>
      ))}
    </div>
  )
}
