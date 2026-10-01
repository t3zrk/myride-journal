import type { InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

interface FieldProps { label: ReactNode; error?: string }

export function Field({ label, error, children }: PropsWithChildren<FieldProps>) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-stone-700">
      <span className="leading-5">{label}</span>
      {children}
      {error ? <span className="text-sm font-normal text-red-700">{error}</span> : null}
    </label>
  )
}

const control = 'min-h-11 min-w-0 w-full rounded-xl border border-stone-300 bg-white/85 px-3.5 py-2 text-base text-stone-950 shadow-[inset_0_1px_1px_rgb(26_24_23/0.02)] outline-none transition duration-150 hover:border-stone-400 focus:border-teal-800 focus:bg-white focus:shadow-[0_0_0_3px_rgb(14_94_90/0.1)] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, 'min-h-28 resize-y', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, props.className)} />
}
