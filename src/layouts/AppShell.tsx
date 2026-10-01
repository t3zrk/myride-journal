import { Bike, CircleDollarSign, Fuel, Gauge, Menu, Settings, UserRound, Warehouse, X } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { SyncIndicator } from '../components/SyncIndicator'
import { ActiveTripTracker } from '../components/ActiveTripTracker'
import { Button } from '../components/ui/Button'
import { useUiStore } from '../stores/uiStore'
import { cn } from '../utils/cn'

const mobileNavItems = [
  { to: '/', label: 'Today', icon: Gauge },
  { to: '/trips', label: 'Trips', icon: Bike },
  { to: '/garage', label: 'Garage', icon: Warehouse },
  { to: '/expenses', label: 'Costs', icon: CircleDollarSign },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

const desktopNavItems = [
  { to: '/', label: 'Overview', icon: Gauge },
  { to: '/trips', label: 'Trips', icon: Bike },
  { to: '/garage', label: 'Garage', icon: Warehouse },
  { to: '/fuel', label: 'Fuel', icon: Fuel },
  { to: '/expenses', label: 'Expenses', icon: CircleDollarSign },
  { to: '/profile', label: 'Rider profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function pageLabel(pathname: string) {
  if (pathname === '/') return 'Overview'
  if (pathname.startsWith('/trips')) return pathname.includes('/replay') ? 'Journey replay' : 'Journeys'
  if (pathname.startsWith('/garage')) return 'Garage'
  if (pathname.startsWith('/fuel')) return 'Fuel journal'
  if (pathname.startsWith('/expenses')) return 'Riding costs'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/achievements')) return 'Milestones'
  if (pathname.startsWith('/profile')) return 'Rider profile'
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
          'fixed inset-y-0 left-0 z-40 flex w-[15rem] flex-col overflow-y-auto border-r border-white/10 bg-[#102d2a] px-4 py-5 text-white shadow-2xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary navigation"
      >
        <div className="flex items-start justify-between gap-4 px-1">
          <NavLink to="/" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-amber-300"><Bike size={20} aria-hidden="true" /></span>
            <span>
              <span className="font-journal block text-[1.85rem] leading-none text-white">MyRide</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100/70">Personal road journal</span>
            </span>
          </NavLink>
          <Button variant="ghost" className="h-10 min-h-10 px-2 text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={20} />
          </Button>
        </div>

        <div className="mt-8 h-px bg-white/10" />
        <p className="mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-100/60">Journal</p>
        <nav className="mt-2 grid gap-1" aria-label="Main pages">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-teal-50/65 transition duration-150 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300',
                isActive && 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]',
              )}
            >
              <item.icon className="opacity-70 transition group-hover:opacity-100" size={18} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-8">
          <div className="border-t border-white/10 pt-5">
            <p className="font-serif text-lg leading-snug text-white">Ride first.<br />The journal follows.</p>
            <p className="mt-3 text-xs leading-5 text-teal-100/55">Trips, fuel, maintenance and costs stay connected to the motorcycle that created them.</p>
          </div>
        </div>
      </aside>

      {sidebarOpen ? <button className="fixed inset-0 z-30 bg-stone-950/35 backdrop-blur-[2px] lg:hidden" aria-label="Close menu" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="lg:pl-[15rem]">
        <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-stone-200/80 bg-[#faf8f5]/90 px-4 backdrop-blur-xl md:px-7 lg:px-9">
          <Button variant="ghost" className="h-10 min-h-10 px-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={21} />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.15em] text-stone-500">MyRide / <span className="text-stone-800">{pageLabel(pathname)}</span></p>
          </div>
          <SyncIndicator />
        </header>

        <ActiveTripTracker />

        <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-[90rem] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 md:px-7 md:pt-8 lg:px-9 lg:pb-14 lg:pt-9">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-[#fffdf9]/94 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgb(26_24_23/0.07)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn(
                'relative flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-stone-600 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800',
                isActive && 'text-teal-900 after:absolute after:inset-x-5 after:top-0 after:h-0.5 after:rounded-full after:bg-teal-900',
              )}
            >
              <item.icon size={19} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
