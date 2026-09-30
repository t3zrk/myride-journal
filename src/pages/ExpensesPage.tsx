import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useExpenses, useInvalidateMyRide, useMotorcycles, useSettings, useTrips } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import type { ExpenseLog } from '../types/myride'
import { formatDate, formatMoney, toLocalDateTimeInput } from '../utils/record'

const colors = ['#0F5B5F', '#157F85', '#B45309', '#57534E', '#166534', '#A16207', '#991B1B']

function chartSummary(title: string, items: Array<{ name: string; value: number }>) {
  return `${title}: ${items.map((item) => `${item.name}, ${formatMoney(item.value)}`).join('; ')}`
}

export function ExpensesPage() {
  const { data: expenses = [] } = useExpenses()
  const { data: trips = [] } = useTrips()
  const { data: motorcycles = [] } = useMotorcycles()
  const { data: settings } = useSettings()
  const invalidate = useInvalidateMyRide()
  const [editingId, setEditingId] = useState<string>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: '', category: 'food', date: toLocalDateTimeInput(), tripId: '', motorcycleId: '', paymentMethod: 'UPI', notes: '' })

  const byCategory = useMemo(() => {
    const grouped = new Map<string, number>()
    expenses.forEach((expense) => grouped.set(expense.category, (grouped.get(expense.category) ?? 0) + expense.amount))
    return [...grouped.entries()].map(([name, value]) => ({ name, value }))
  }, [expenses])

  const yearly = useMemo(() => {
    const grouped = new Map<string, number>()
    expenses.forEach((expense) => {
      const year = new Date(expense.date).getFullYear().toString()
      grouped.set(year, (grouped.get(year) ?? 0) + expense.amount)
    })
    return [...grouped.entries()].map(([year, amount]) => ({ year, amount }))
  }, [expenses])

  const byPayment = useMemo(() => {
    const grouped = new Map<string, number>()
    expenses.forEach((expense) => grouped.set(expense.paymentMethod, (grouped.get(expense.paymentMethod) ?? 0) + expense.amount))
    return [...grouped.entries()].map(([name, value]) => ({ name, value }))
  }, [expenses])

  const byTrip = useMemo(() => trips.map((trip) => ({ name: trip.title, amount: expenses.filter((expense) => expense.tripId === trip.id).reduce((sum, expense) => sum + expense.amount, 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8), [expenses, trips])

  function editExpense(expense: ExpenseLog) {
    setError('')
    setEditingId(expense.id)
    setForm({ amount: String(expense.amount), category: expense.category, date: toLocalDateTimeInput(expense.date), tripId: expense.tripId ?? '', motorcycleId: expense.motorcycleId ?? '', paymentMethod: expense.paymentMethod, notes: expense.notes ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function addExpense(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount greater than zero.'); return }
    const trip = trips.find((item) => item.id === form.tripId)
    if (form.tripId && !trip) { setError('The selected trip no longer exists.'); return }
    if (trip?.motorcycleId && form.motorcycleId && trip.motorcycleId !== form.motorcycleId) { setError('The selected motorcycle does not match this trip.'); return }
    setSaving(true)
    try {
      const date = new Date(form.date)
      if (Number.isNaN(date.getTime())) throw new Error('Enter a valid expense date and time.')
      const payload = {
        amount,
        currency: settings?.currency ?? 'INR',
        date: date.toISOString(),
        category: form.category as ExpenseLog['category'],
        tripId: form.tripId || undefined,
        motorcycleId: form.motorcycleId || trip?.motorcycleId || undefined,
        paymentMethod: form.paymentMethod as ExpenseLog['paymentMethod'],
        notes: form.notes.trim(),
      }
      if (editingId) await repository.expenses.update(editingId, payload)
      else await repository.expenses.create(payload)
      setEditingId(undefined)
      setForm({ amount: '', category: 'food', date: toLocalDateTimeInput(), tripId: '', motorcycleId: '', paymentMethod: 'UPI', notes: '' })
      await invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function removeExpense(expense: ExpenseLog) {
    if (!window.confirm(`Delete this ${formatMoney(expense.amount)} expense?`)) return
    setError('')
    try {
      await repository.expenses.remove(expense.id)
      await invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense could not be deleted.')
    }
  }

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow="Expenses" title="Riding Costs" />

      <dl className="surface-panel grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total spent" value={formatMoney(total)} />
        <Stat label="Fuel" value={formatMoney(byCategory.find((item) => item.name === 'fuel')?.value ?? 0)} />
        <Stat label="Maintenance" value={formatMoney(byCategory.find((item) => item.name === 'maintenance')?.value ?? 0)} />
        <Stat label="Records" value={`${expenses.length}`} />
      </dl>

      <Section title={editingId ? 'Edit Expense' : 'Add Expense'}>
        <form onSubmit={addExpense} className="surface-panel grid gap-4 p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Amount"><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Date and time"><Input required type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{['fuel','stay','food','tea','snacks','tolls','parking','maintenance','accessories','repairs','other'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Payment method"><Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{['UPI','Cash','Card','Other'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Trip"><Select value={form.tripId} onChange={(e) => setForm({ ...form, tripId: e.target.value })}><option value="">No trip</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</Select></Field>
            <Field label="Motorcycle"><Select value={form.motorcycleId} onChange={(e) => setForm({ ...form, motorcycleId: e.target.value })}><option value="">No motorcycle</option>{motorcycles.map((motorcycle) => <option key={motorcycle.id} value={motorcycle.id}>{motorcycle.nickname || motorcycle.model}</option>)}</Select></Field>
            <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add expense'}</Button>{editingId ? <Button type="button" variant="outline" disabled={saving} onClick={() => { setEditingId(undefined); setError(''); setForm({ amount: '', category: 'food', date: toLocalDateTimeInput(), tripId: '', motorcycleId: '', paymentMethod: 'UPI', notes: '' }) }}>Cancel</Button> : null}</div>
        </form>
      </Section>

      {expenses.length === 0 ? (
        <EmptyState title="NO EXPENSES">Fuel, stay, food, tolls, parking, maintenance, and other riding expenses will appear here once logged.</EmptyState>
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          <Section title="Category Breakdown">
            <div className="surface-panel h-80 p-4" role="img" aria-label={chartSummary('Expense category breakdown', byCategory)}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={110} label>
                    {byCategory.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Section>
          <Section title="Yearly Spend">
            <div className="surface-panel h-80 p-4" role="img" aria-label={chartSummary('Yearly expense totals', yearly.map((item) => ({ name: item.year, value: item.amount })))}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Bar dataKey="amount" fill="#0F5B5F" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
          <Section title="Payment Methods"><div className="surface-panel h-72 p-4" role="img" aria-label={chartSummary('Expense payment methods', byPayment)}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byPayment} dataKey="value" nameKey="name" outerRadius={90} label>{byPayment.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer></div></Section>
          <Section title="Trip Spend"><div className="surface-panel h-72 p-4" {...(byTrip.length ? { role: 'img', 'aria-label': chartSummary('Trip expense totals', byTrip.map((item) => ({ name: item.name, value: item.amount }))) } : {})}>{byTrip.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byTrip}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" hide /><YAxis /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="amount" fill="#B45309" /></BarChart></ResponsiveContainer> : <p className="text-stone-600">Assign expenses to trips to compare journey costs.</p>}</div></Section>
        </section>
      )}
      <Section title="Expense History">{expenses.length ? <div className="grid gap-2">{[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => <article key={expense.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3"><div><p className="font-semibold">{formatMoney(expense.amount, expense.currency)} | {expense.category}</p><p className="text-sm text-stone-600">{formatDate(expense.date, true)} | {expense.paymentMethod} | {trips.find((trip) => trip.id === expense.tripId)?.title || 'No trip'}</p></div><div className="flex gap-2"><Button variant="ghost" aria-label={`Edit ${expense.category} expense`} onClick={() => editExpense(expense)}><Pencil size={18} /></Button><Button variant="ghost" aria-label={`Delete ${expense.category} expense`} onClick={() => removeExpense(expense)}><Trash2 size={18} /></Button></div></article>)}</div> : <p className="text-stone-600">No expenses recorded.</p>}</Section>
    </div>
  )
}
