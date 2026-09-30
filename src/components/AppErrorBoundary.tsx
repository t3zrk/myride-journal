import { Component } from 'react'
import type { PropsWithChildren } from 'react'
import { Button } from './ui/Button'

export class AppErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <section role="alert" className="surface-panel grid max-w-xl gap-4 border-l-4 border-l-red-700 bg-red-50/70 p-5"><h1 className="text-2xl font-semibold text-stone-950">Page could not be opened</h1><p className="text-sm text-stone-700">Your journal data remains on this device. Reload to try this page again.</p><Button className="w-fit" onClick={() => window.location.reload()}>Reload page</Button></section>
    return this.props.children
  }
}
