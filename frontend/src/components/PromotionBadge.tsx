import { cn } from '@/lib/utils'
import type { PromotionLevel } from '@/features/home/types'

const BADGE_CONFIG = {
  featured: {
    label: 'Featured · org',
    icon: '★',
    className: 'bg-brand-muted text-brand',
  },
} as const

interface PromotionBadgeProps {
  promotion: PromotionLevel
  compact?: boolean
  className?: string
}

export function PromotionBadge({
  promotion,
  compact,
  className,
}: PromotionBadgeProps) {
  if (promotion === 'system' || promotion === 'personal') return null
  const config = BADGE_CONFIG[promotion]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-mono text-[10px] uppercase tracking-wider',
        compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5',
        config.className,
        className,
      )}
    >
      <span className="text-[11px] leading-none">{config.icon}</span>
      {!compact && config.label}
    </span>
  )
}
