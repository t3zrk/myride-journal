import type { PropsWithChildren, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export function Section({ title, action, className, children }: PropsWithChildren<{ title: string; action?: ReactNode; className?: string }>) {
  return (
    <section className={cn('py-4 md:py-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-semibold leading-tight text-stone-950 md:text-2xl"><span aria-hidden="true" className="h-5 w-1 rounded-sm bg-amber-500" />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
