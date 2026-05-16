import { useTranslation } from 'react-i18next'

interface PromoteStepProps {
  org: string
  visibility: string
  audience: string
}

export function PromoteStep({ org, visibility, audience }: PromoteStepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {/* TODO: Wire to promote API — validate org scope, check permissions */}
      <div className="flex flex-wrap gap-2">
        {org && (
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-[12.5px] text-foreground">
            {t('builder.promote.orgLabel', { org })}
          </span>
        )}
        {visibility && (
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-[12.5px] text-foreground">
            {t('builder.promote.visibilityLabel', { visibility })}
          </span>
        )}
        {audience && (
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-[12.5px] text-foreground">
            {t('builder.promote.audienceLabel', { audience })}
          </span>
        )}
      </div>
      {!org && !visibility && !audience && (
        <p className="text-[12.5px] text-muted-foreground">
          {t('builder.promote.empty')}
        </p>
      )}
    </div>
  )
}
