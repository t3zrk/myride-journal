export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="stat-block min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">{label}</dt>
      <dd className="mt-2">
        <span className="metric-number block break-words text-[1.7rem] font-semibold leading-none text-stone-950">{value}</span>
        {detail ? <span className="mt-2 block text-xs leading-5 text-stone-600">{detail}</span> : null}
      </dd>
    </div>
  )
}
