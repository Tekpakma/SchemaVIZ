import { forwardRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'

import SchemaVizSVG from '@/branding/favicon.svg?react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// AppLink – thin wrapper around TanStack Router's <Link> with sensible
// defaults (preload on intent, unstyled by default). Use this as the base
// for all internal navigation.
// ---------------------------------------------------------------------------

type AppLinkProps = Omit<LinkProps, 'ref'> & {
  className?: string
  children?: React.ReactNode
}

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  function AppLink({ className, children, ...props }, ref) {
    return (
      <Link ref={ref} className={className} preload="intent" {...props}>
        {children}
      </Link>
    )
  },
)

// ---------------------------------------------------------------------------
// HomeLink – navigates to "/". Wraps AppLink so the target is always
// type-safe and consistent.
// ---------------------------------------------------------------------------

type HomeLinkProps = {
  className?: string
  children?: React.ReactNode
}

export function HomeLink({ className, children }: HomeLinkProps) {
  return (
    <AppLink to="/" className={className}>
      {children}
    </AppLink>
  )
}

// ---------------------------------------------------------------------------
// BrandHomeLink – the SchemaVIZ logo as a link to the homepage.
// Drop-in replacement for the static BrandLogo.
// ---------------------------------------------------------------------------

type BrandHomeLinkProps = {
  className?: string
}

export function BrandHomeLink({ className }: BrandHomeLinkProps) {
  return (
    <HomeLink
      className={cn(
        'flex items-center gap-[7px] rounded-sm px-1 text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      <SchemaVizSVG className="size-5 shrink-0" aria-hidden="true" />
      <span className="text-[13.5px] font-medium tracking-tight">
        Schema<span className="font-bold">VIZ</span>
      </span>
    </HomeLink>
  )
}

// ---------------------------------------------------------------------------
// BuilderLink – navigates to the builder page. Optionally accepts a
// templateId to open a specific template for editing.
// Example: <BuilderLink templateId="abc">Edit</BuilderLink>
// ---------------------------------------------------------------------------

type BuilderLinkProps = {
  className?: string
  children?: React.ReactNode
  templateId?: string
}

export function BuilderLink({
  className,
  children,
  templateId,
}: BuilderLinkProps) {
  return (
    <AppLink
      to="/builder"
      search={templateId ? { templateId } : {}}
      className={className}
    >
      {children}
    </AppLink>
  )
}
