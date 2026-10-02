import { cn } from '@/lib/utils'

export interface ChartSegment {
  key: string
  label: string
  value: number
  /** CSS color (theme var) used for the segment and its legend dot. */
  color: string
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 152,
}: {
  segments: ChartSegment[]
  centerValue: string
  centerLabel: string
  size?: number
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const radius = 46
  const strokeWidth = 16
  const circumference = 2 * Math.PI * radius

  const active = segments.filter((segment) => segment.value > 0)
  const offsets = active.reduce<number[]>((acc, segment) => {
    const previous = acc.at(-1) ?? 0
    acc.push(previous + segment.value / total)
    return acc
  }, [])
  const arcs = active.map((segment, index) => {
    const fraction = segment.value / total
    const arc = (
      <circle
        key={segment.key}
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={segment.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${fraction * circumference} ${circumference - fraction * circumference}`}
        strokeDashoffset={-(offsets[index] - fraction) * circumference}
        transform="rotate(-90 60 60)"
      >
        <title>{`${segment.label}: ${segment.value}`}</title>
      </circle>
    )
    return arc
  })

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 120 120"
        className="size-full"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {arcs}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl leading-none font-bold">{centerValue}</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {centerLabel}
        </span>
      </div>
    </div>
  )
}

export function ChartLegend({
  segments,
  total,
}: {
  segments: ChartSegment[]
  total: number
}) {
  if (total <= 0) return null
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
      {segments.map((segment) => (
        <li key={segment.key} className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: segment.color }}
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {segment.label}
          </span>
          <span className="font-semibold tabular-nums">{segment.value}</span>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {percentage(segment.value, total)}%
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SegmentedBar({ segments }: { segments: ChartSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return null
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      {segments.map((segment) =>
        segment.value > 0 ? (
          <div
            key={segment.key}
            className="h-full"
            style={{
              width: `${percentage(segment.value, total)}%`,
              backgroundColor: segment.color,
            }}
            title={`${segment.label}: ${segment.value}`}
          />
        ) : null,
      )}
    </div>
  )
}

export function MonthBarChart({
  data,
}: {
  data: Array<{ key: string; label: string; count: number }>
}) {
  const max = Math.max(1, ...data.map((month) => month.count))
  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" aria-hidden="true">
        {data.map((month) => (
          <div
            key={month.key}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-[0.65rem] leading-none text-muted-foreground">
              {month.count > 0 ? month.count : ''}
            </span>
            <div
              title={`${month.label}: ${month.count}`}
              className={cn(
                'w-full rounded-t',
                month.count > 0
                  ? 'bg-primary/70 group-hover:bg-primary'
                  : 'h-1 bg-muted',
              )}
              style={
                month.count > 0
                  ? { height: `${(month.count / max) * 100}%` }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden="true">
        {data.map((month) => (
          <span
            key={month.key}
            className="min-w-0 flex-1 truncate text-center text-[0.6rem] text-muted-foreground"
          >
            {month.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}
