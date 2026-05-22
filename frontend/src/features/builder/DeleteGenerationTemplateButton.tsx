import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { GenerationTemplateRead } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteGenerationTemplate } from './generationTemplateMutations'

type DeleteGenerationTemplateButtonProps = {
  template: GenerationTemplateRead
}

export function DeleteGenerationTemplateButton({
  template,
}: DeleteGenerationTemplateButtonProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteGenerationTemplate(template.id),
    onSuccess: async () => {
      setOpen(false)
      queryClient.removeQueries({ queryKey: ['shared-generation'] })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['generation-template'] }),
        queryClient.invalidateQueries({ queryKey: ['home', 'quick-access'] }),
      ])
      void navigate({ to: '/' })
    },
  })

  if (!template.ownedByCurrentUser) return null

  const isDeleting = deleteMutation.isPending

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        {t('generate.delete.open')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('generate.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('generate.delete.description', { name: template.name })}
            </DialogDescription>
          </DialogHeader>

          {deleteMutation.isError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : t('generate.delete.error')}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                {t('generate.delete.cancel')}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteMutation.mutate()}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {isDeleting
                ? t('generate.delete.deleting')
                : t('generate.delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
