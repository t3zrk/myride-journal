import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  journalTitle?: boolean
}

export function PageHeader({ eyebrow, title, description, actions, journalTitle = false }: PageHeaderProps) {
  return (
    <header className="relative flex flex-col gap-4 border-b border-stone-200 pb-5 md:flex-row md:items-end md:justify-between md:pb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-0.5 w-7 bg-amber-600" />
          <p className="text-xs font-semibold text-teal-900">{eyebrow}</p>
        </div>
        <h1 className={cn('page-heading mt-1 text-stone-950', journalTitle && 'font-journal font-normal')}>{title}</h1>
        {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
      <span aria-hidden="true" className="absolute -bottom-px left-0 h-px w-20 bg-teal-800" />
    </header>
  )
}
