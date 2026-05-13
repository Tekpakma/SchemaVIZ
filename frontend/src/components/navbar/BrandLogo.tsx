import SchemaVizSVG from '@/branding/favicon.svg?react'

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2 text-foreground">
      <div className="flex items-center gap-[7px] px-1">
        <SchemaVizSVG className="size-5 shrink-0" aria-hidden="true" />
        <span className="text-[13.5px] font-medium tracking-tight">
          Schema<span className="font-bold">VIZ</span>
        </span>
      </div>
    </div>
  )
}
