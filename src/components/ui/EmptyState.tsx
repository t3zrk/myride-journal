import type { PropsWithChildren } from 'react'

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="rounded-md border border-stone-200 bg-white px-5 py-8 text-center shadow-[inset_0_3px_0_#d7eee8,0_8px_24px_rgb(16_22_20/0.025)] md:px-8 md:py-10">
      <div aria-hidden="true" className="mx-auto mb-4 flex w-24 items-center gap-2"><span className="h-px flex-1 bg-amber-300" /><span className="size-2 rotate-45 border border-teal-800 bg-teal-50" /><span className="h-px flex-1 bg-teal-200" /></div>
      <h2 className="empty-state-title text-xl font-semibold text-stone-950">{title}</h2>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">{children}</div>
    </section>
  )
}
