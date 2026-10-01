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
    <header className="relative grid gap-5 pb-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <span aria-hidden="true" className="h-px w-9 bg-amber-700" />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-900">{eyebrow}</p>
        </div>
        <h1 className={cn('page-heading text-stone-950', journalTitle && 'font-journal')}>{title}</h1>
        {description ? <div className="mt-3 max-w-3xl text-sm leading-6 text-stone-600 md:text-[15px]">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
    </header>
  )
}
