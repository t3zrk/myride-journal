import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppShell } from './layouts/AppShell'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const TripsPage = lazy(() => import('./pages/TripsPage').then((module) => ({ default: module.TripsPage })))
const TripFormPage = lazy(() => import('./pages/TripFormPage').then((module) => ({ default: module.TripFormPage })))
const TripDetailPage = lazy(() => import('./pages/TripDetailPage').then((module) => ({ default: module.TripDetailPage })))
const ReplayPage = lazy(() => import('./pages/ReplayPage').then((module) => ({ default: module.ReplayPage })))
const GaragePage = lazy(() => import('./pages/GaragePage').then((module) => ({ default: module.GaragePage })))
const MotorcycleDetailPage = lazy(() => import('./pages/MotorcycleDetailPage').then((module) => ({ default: module.MotorcycleDetailPage })))
const FuelPage = lazy(() => import('./pages/FuelPage').then((module) => ({ default: module.FuelPage })))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((module) => ({ default: module.ExpensesPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage').then((module) => ({ default: module.AchievementsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

export default function App() {
  return <AuthGate><AppShell><AppErrorBoundary><Suspense fallback={<div className="grid gap-4" aria-label="Loading page"><div className="h-20 animate-pulse rounded-md bg-stone-200/80" /><div className="surface-panel h-36 animate-pulse bg-white" /></div>}>
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/trips" element={<TripsPage />} />
      <Route path="/trips/new" element={<TripFormPage />} />
      <Route path="/trips/:tripId" element={<TripDetailPage />} />
      <Route path="/trips/:tripId/edit" element={<TripFormPage />} />
      <Route path="/trips/:tripId/replay" element={<ReplayPage />} />
      <Route path="/garage" element={<GaragePage />} />
      <Route path="/garage/:motorcycleId" element={<MotorcycleDetailPage />} />
      <Route path="/fuel" element={<FuelPage />} />
      <Route path="/expenses" element={<ExpensesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/achievements" element={<AchievementsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense></AppErrorBoundary></AppShell></AuthGate>
}
