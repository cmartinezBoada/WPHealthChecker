export type Status = 'ok' | 'warning' | 'critical'

type StatusCardProps = {
  name: string
  value: string
  status: Status
}

const STATUS_STYLES: Record<Status, { label: string; badge: string; dot: string }> = {
  ok: { label: 'Good', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  warning: { label: 'Attention', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  critical: { label: 'Critical', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
}

function StatusCard({ name, value, status }: StatusCardProps) {
  const { label, badge, dot } = STATUS_STYLES[status]

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-slate-900">{name}</h3>
        <p className="text-sm text-slate-500">{value}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
    </div>
  )
}

export default StatusCard
