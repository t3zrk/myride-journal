import { Bike, CircleDollarSign, Fuel, Gauge, Menu, Settings, UserRound, Warehouse, X } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { SyncIndicator } from '../components/SyncIndicator'
import { ActiveTripTracker } from '../components/ActiveTripTracker'
import { Button } from '../components/ui/Button'
import { useUiStore } from '../stores/uiStore'
import { cn } from '../utils/cn'

const mobileNavItems = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/trips', label: 'Trips', icon: Bike },
  { to: '/garage', label: 'Garage', icon: Warehouse },
  { to: '/expenses', label: 'Expenses', icon: CircleDollarSign },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

const desktopNavItems = [
  ...mobileNavItems.slice(0, 3),
  { to: '/fuel', label: 'Fuel', icon: Fuel },
  mobileNavItems[3],
  mobileNavItems[4],
  { to: '/settings', label: 'Settings', icon: Settings },
]

function pageLabel(pathname: string) {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/trips')) return pathname.includes('/replay') ? 'Journey replay' : 'Trips'
  if (pathname.startsWith('/garage')) return 'Garage'
  if (pathname.startsWith('/fuel')) return 'Fuel journal'
  if (pathname.startsWith('/expenses')) return 'Expenses'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/achievements')) return 'Milestones'
  if (pathname.startsWith('/profile')) return 'Profile'
  return 'MyRide'
}

export function AppShell({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)

  return (
    <div className="min-h-svh bg-stone-50 text-stone-950">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-teal-950 bg-[#12342e] px-4 py-5 text-white shadow-xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary navigation"
      >
        <div className="flex items-start justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-amber-400 text-stone-950 shadow-sm"><Bike size={21} aria-hidden="true" /></span>
            <span>
              <span className="block font-journal text-3xl leading-none text-white">MyRide</span>
              <span className="mt-1 block text-xs font-semibold text-teal-100">Riding journal</span>
            </span>
          </NavLink>
          <Button variant="ghost" className="h-10 min-h-10 px-2 text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={20} />
          </Button>
        </div>

        <nav className="mt-8 grid gap-1" aria-label="Main pages">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-sm font-semibold text-teal-50/80 transition duration-150 hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                  isActive && 'border-amber-400 bg-white/10 text-white shadow-sm hover:bg-white/10 hover:text-white',
                )
              }
            >
              <item.icon size={19} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/15 pt-5 text-sm leading-6 text-teal-100/75">
          <p className="font-semibold text-white">The rider records what happened.</p>
          <p>MyRide does the calculations.</p>
        </div>
      </aside>

      {sidebarOpen ? <button className="fixed inset-0 z-30 bg-stone-950/30 lg:hidden" aria-label="Close menu" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-stone-200 bg-white/92 px-4 shadow-[0_1px_3px_rgb(16_22_20/0.04)] backdrop-blur md:px-8">
          <Button variant="ghost" className="h-10 min-h-10 px-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={21} />
          </Button>
          <p className="truncate text-sm font-semibold text-stone-700 lg:text-stone-600">{pageLabel(pathname)}</p>
          <SyncIndicator />
        </header>

        <ActiveTripTracker />

        <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pt-7 lg:pb-12">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(16_22_20/0.08)] backdrop-blur lg:hidden" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-stone-600 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800',
                  isActive && 'bg-teal-50/80 text-teal-900 after:absolute after:inset-x-4 after:top-0 after:h-0.5 after:bg-amber-500',
                )
              }
            >
              <item.icon size={20} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
