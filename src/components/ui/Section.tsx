import type { PropsWithChildren, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export function Section({ title, action, className, children }: PropsWithChildren<{ title: string; action?: ReactNode; className?: string }>) {
  return (
    <section className={cn('py-2 md:py-3', className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-3">
        <h2 className="font-serif text-[1.7rem] leading-none text-stone-950 md:text-[1.95rem]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
