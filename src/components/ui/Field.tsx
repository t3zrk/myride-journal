import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

interface FieldProps {
  label: string
  error?: string
}

export function Field({ label, error, children }: PropsWithChildren<FieldProps>) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-800">
      <span className="leading-5">{label}</span>
      {children}
      {error ? <span className="text-sm font-normal text-red-700">{error}</span> : null}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('min-h-11 min-w-0 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base text-stone-950 shadow-[inset_0_1px_1px_rgb(16_22_20/0.025)] outline-none transition duration-150 hover:border-stone-400 focus:border-teal-800 focus:shadow-[0_0_0_3px_rgb(17_105_93/0.1)] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('min-h-28 min-w-0 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-base text-stone-950 shadow-[inset_0_1px_1px_rgb(16_22_20/0.025)] outline-none transition duration-150 hover:border-stone-400 focus:border-teal-800 focus:shadow-[0_0_0_3px_rgb(17_105_93/0.1)] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn('min-h-11 min-w-0 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base text-stone-950 shadow-[inset_0_1px_1px_rgb(16_22_20/0.025)] outline-none transition duration-150 hover:border-stone-400 focus:border-teal-800 focus:shadow-[0_0_0_3px_rgb(17_105_93/0.1)] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500', props.className)} />
}
