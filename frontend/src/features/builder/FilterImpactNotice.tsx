import { AlertTriangleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { GenerationRunResponse } from './generationPreviewQuery'
import { getFilterImpactItems } from './generationDiagnostics'

type FilterImpactNoticeProps = {
  className?: string
  response: GenerationRunResponse | null | undefined
}

export function FilterImpactNotice({
  className,
  response,
}: FilterImpactNoticeProps) {
  const { t } = useTranslation()
  const impacts = getFilterImpactItems(response)
  if (impacts.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/8 px-4 py-2 text-[12px] leading-relaxed text-amber-950 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-100',
        className,
      )}
      role="status"
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {t('filterImpact.summary', {
          count: impacts.length,
        })}
      </span>
    </div>
  )
}
