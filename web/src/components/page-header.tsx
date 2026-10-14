import type { ReactNode } from "react"

export function PageHeader({
  title,
  actions,
}: {
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-2">
      <div className="min-w-0 flex-1 text-lg font-medium">{title}</div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  )
}
