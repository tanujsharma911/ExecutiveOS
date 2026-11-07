import { BookOpenCheck, CalendarDays, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/common/Page'
import { GrowthView } from '@/components/features/Growth'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress, Skeleton } from '@/components/ui/misc'
import { useApi } from '@/lib/api'
import { fmtDate } from '@/lib/utils'

interface ProgramInfo {
  startDate: string
  program: { name: string; description: string; durationWeeks: number; focusAreas: string[] } | null
  coach: { name: string; title: string | null }
}

/** The client's coaching program: name, progress through it, coach and focus areas. */
function ProgramBanner() {
  const { data } = useApi<ProgramInfo>('/client/profile')
  if (!data) {
    return (
      <Card className="grid gap-3 p-5" aria-busy="true">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-3 w-full max-w-xl" />
        <Skeleton className="h-1.5 w-full" />
      </Card>
    )
  }
  const { program, coach, startDate } = data
  if (!program) {
    return (
      <Card className="flex items-center gap-3 p-5 text-[13px] text-muted-foreground">
        <BookOpenCheck className="size-4 shrink-0" /> You're not enrolled in a coaching program yet. {coach.name} will add you to one.
      </Card>
    )
  }
  const week = Math.min(program.durationWeeks, Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / (7 * 86_400_000))))
  const end = new Date(new Date(startDate).getTime() + program.durationWeeks * 7 * 86_400_000)
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpenCheck className="size-3.5" /> Your coaching program
          </div>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight">{program.name}</h2>
          {program.description ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{program.description}</p> : null}
        </div>
        <div className="grid shrink-0 gap-1.5 text-[12.5px] text-muted-foreground md:text-right">
          <span className="flex items-center gap-1.5 md:justify-end">
            <UserRound className="size-3.5" /> {coach.name}
            {coach.title ? `, ${coach.title}` : ''}
          </span>
          <span className="flex items-center gap-1.5 md:justify-end">
            <CalendarDays className="size-3.5" /> {fmtDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })} – {fmtDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex justify-between text-[12.5px]">
          <span className="font-medium">
            Week {week} of {program.durationWeeks}
          </span>
          <span className="tabular-nums text-muted-foreground">{Math.round((week / program.durationWeeks) * 100)}%</span>
        </div>
        <Progress value={(week / program.durationWeeks) * 100} tone="ai" />
      </div>
      {program.focusAreas.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">Focus areas:</span>
          {program.focusAreas.map((f) => (
            <Badge key={f} variant="outline">
              {f}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

export default function ClientGrowth() {
  return (
    <div>
      <PageHeader title="My Growth Journey" description="How your leadership focus, energy and follow-through have evolved since you started coaching." />
      <GrowthView path="/client/growth" activityPath="/client/activity" banner={<ProgramBanner />} />
    </div>
  )
}
