export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat-block min-w-0 border-l-2 pl-4">
      <dt className="text-xs font-semibold text-stone-500">{label}</dt>
      <dd className="mt-1.5">
        <span className="metric-number block break-words text-2xl font-semibold leading-tight text-stone-950">{value}</span>
        {detail ? <span className="mt-1 block text-xs leading-5 text-stone-600">{detail}</span> : null}
      </dd>
    </div>
  )
}
