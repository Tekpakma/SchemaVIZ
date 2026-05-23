import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { ALargeSmallIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  TEXT_SIZE_PRESETS,
  type TextSizePreset,
} from './textSizePresets'

type TextSizeDropdownProps = {
  activePreset: TextSizePreset
  controlClass: string
  iconClass: string
  onSelect: (preset: TextSizePreset) => void
}

export function TextSizeDropdown({
  activePreset,
  controlClass,
  iconClass,
  onSelect,
}: TextSizeDropdownProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      setOpen((prev) => !prev)
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    function handleClick(event: globalThis.MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const isNonDefault = activePreset !== 'normal'
  const label = t('builder.inlineToolbar.textSize')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(controlClass, isNonDefault && 'bg-accent text-foreground')}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={label}
        onMouseDown={toggle}
      >
        <ALargeSmallIcon className={iconClass} aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-1 min-w-28 overflow-hidden rounded-md border border-border bg-background/95 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
        >
          {TEXT_SIZE_PRESETS.map(({ key }) => {
            const isActive = key === activePreset
            return (
              <li
                key={key}
                role="option"
                aria-selected={isActive}
                className={cn(
                  'flex cursor-pointer items-center px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent',
                  isActive && 'bg-accent font-medium',
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(key)
                  setOpen(false)
                }}
              >
                {t(`builder.inlineToolbar.textSize_${key}`)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
