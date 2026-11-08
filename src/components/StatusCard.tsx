import type { ReactNode } from 'react'

export type Status = 'ok' | 'warning' | 'critical' | 'warning'

export type HealthDetail = {
  label: string
  status: Status
}

export type HealthItem = {
  name: string
  value: string
  status: Status
  details?: HealthDetail[]
}

const STATUS_STYLES: Record<Status, { label: string; badge: string; dot: string }> = {
  ok: { label: 'Good', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  warning: { label: 'Attention', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  critical: { label: 'Critical', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
}

type StatusCardProps = HealthItem & {
  // Contenu supplémentaire sous la valeur, ex. un bouton d'action
  children?: ReactNode
}

function StatusCard({ name, value, status, details = [], children }: StatusCardProps) {
  const { label, badge, dot } = STATUS_STYLES[status]

  return (
    <div
      className={`flex justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
        details.length > 0 || children ? 'items-start' : 'items-center'
      }`}
    >
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-slate-900">{name}</h3>
        <p className="text-sm text-slate-500">{value}</p>
        {children}
        {details.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {details.map((detail) => (
              <li
                key={detail.label}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLES[detail.status].dot}`} />
                <span className="truncate">{detail.label}</span>
              </li>
            ))}
          </ul>
        )}
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
