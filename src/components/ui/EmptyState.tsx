import type { PropsWithChildren } from 'react'

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="surface-panel px-5 py-10 text-center md:px-10 md:py-12">
      <div aria-hidden="true" className="mx-auto mb-5 grid size-10 place-items-center rounded-full border border-teal-200 bg-teal-50">
        <span className="size-2 rotate-45 bg-teal-900" />
      </div>
      <h2 className="empty-state-title font-serif text-2xl text-stone-950">{title}</h2>
      <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">{children}</div>
    </section>
  )
}
