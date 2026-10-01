import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant }

const styles: Record<Variant, string> = {
  primary: 'border-teal-900 bg-teal-900 text-white shadow-[0_5px_16px_rgb(14_94_90/0.16)] hover:-translate-y-px hover:border-teal-800 hover:bg-teal-800 hover:shadow-[0_8px_22px_rgb(14_94_90/0.2)]',
  secondary: 'border-stone-950 bg-stone-950 text-white shadow-sm hover:-translate-y-px hover:bg-stone-800',
  outline: 'border-stone-300 bg-white/75 text-stone-900 shadow-sm hover:-translate-y-px hover:border-teal-300 hover:bg-teal-50/80 hover:text-teal-950',
  ghost: 'border-transparent bg-transparent text-stone-700 hover:bg-stone-100/90 hover:text-stone-950',
  destructive: 'border-red-700 bg-red-700 text-white shadow-sm hover:-translate-y-px hover:border-red-800 hover:bg-red-800',
}

function buttonClassName(variant: Variant = 'primary', className?: string) {
  return cn(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 active:translate-y-0 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50',
    styles[variant], className,
  )
}

export function Button({ className, variant = 'primary', children, ...props }: PropsWithChildren<ButtonProps>) {
  return <button className={buttonClassName(variant, className)} {...props}>{children}</button>
}

interface ButtonLinkProps extends Omit<LinkProps, 'className'> { variant?: Variant; className?: string }

export function ButtonLink({ className, variant = 'primary', children, ...props }: PropsWithChildren<ButtonLinkProps>) {
  return <Link className={buttonClassName(variant, className)} {...props}>{children}</Link>
}

interface ExternalButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> { variant?: Variant }

export function ExternalButtonLink({ className, variant = 'primary', children, ...props }: PropsWithChildren<ExternalButtonLinkProps>) {
  return <a className={buttonClassName(variant, className)} {...props}>{children}</a>
}
