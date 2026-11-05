import { ArrowLeft, CalendarClock, Check, CloudCheck, Loader2, Lock, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState, Loading } from '@/components/common/Page'
import { FormRenderer } from '@/components/features/FormRenderer'
import { StreakFlame } from '@/components/features/Growth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { api, ApiError, isAbortError, useAbortScope, useApi } from '@/lib/api'
import type { AnswerSnapshot, Question, Session } from '@/lib/types'
import { fmtDate, fmtDateTime, relative } from '@/lib/utils'

interface Current {
  form: { id: string; title: string; description: string; frequency: string; questions: (Question & { id: string })[] }
  periodStart: string
  dueAt: string
  submission: { id: string; status: 'DRAFT' | 'SUBMITTED'; answers: AnswerSnapshot[]; updatedAt: string; submittedAt: string | null } | null
}

interface SubmitResult {
  weeklyStreak: { current: number; best: number }
  dailyStreak: { current: number; best: number }
  nextSession: Session | null
}

const isAnswered = (v: unknown) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length))

export default function FormFill() {
  const { formId } = useParams()
  const { data, error } = useApi<Current>(`/client/forms/${formId}/current`, [formId])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<SubmitResult | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const scope = useAbortScope()
  const navigate = useNavigate()

  useEffect(() => {
    if (!data) return
    setValues(Object.fromEntries((data.submission?.answers ?? []).filter((a) => a.value !== null).map((a) => [a.questionId, a.value])))
    setSavedAt(data.submission?.status === 'DRAFT' ? data.submission.updatedAt : null)
  }, [data])

  const saveDraft = useCallback(
    async (vals: Record<string, unknown>, silent = true) => {
      setSaving(true)
      try {
        const s = await api<{ updatedAt: string }>(`/client/forms/${formId}/draft`, { method: 'PUT', json: { answers: vals } })
        setSavedAt(s.updatedAt)
        if (!silent) toast.success('Draft saved')
      } catch (e) {
        if (!silent) toast.error((e as Error).message)
      } finally {
        setSaving(false)
      }
    },
    [formId],
  )

  function change(id: string, v: unknown) {
    setValues((prev) => {
      const next = { ...prev, [id]: v }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => saveDraft(next), 1500)
      return next
    })
    setMissing((m) => {
      if (!m.has(id)) return m
      const n = new Set(m)
      n.delete(id)
      return n
    })
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function submit() {
    if (!data) return
    const miss = new Set(data.form.questions.filter((q) => q.required && !isAnswered(values[q.id])).map((q) => q.id))
    setMissing(miss)
    if (miss.size) {
      document.getElementById(`q-${[...miss][0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error(`${miss.size} required question${miss.size === 1 ? '' : 's'} left`)
      return
    }
    window.clearTimeout(timer.current)
    setSubmitting(true)
    try {
      const r = await api<SubmitResult>(`/client/forms/${formId}/submit`, { method: 'POST', json: { answers: values }, signal: scope.signal() })
      setResult(r)
      window.scrollTo({ top: 0 })
    } catch (e) {
      if (isAbortError(e)) return // navigated away; the server still saves the reflection
      toast.error(e instanceof ApiError ? e.message : 'Could not submit')
    }
    setSubmitting(false)
  }

  if (error) return <ErrorState message={error} />
  if (!data) return <Loading />

  if (result) {
    const isWeekly = data.form.frequency === 'WEEKLY'
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success text-white shadow-lg animate-pop">
          <Check className="size-8" strokeWidth={3} />
        </span>
        <h1 className="mt-6 font-serif text-[32px] leading-tight">Reflection submitted.</h1>
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
          Naming what happened is how patterns become visible. Thank you for taking the time to be honest with yourself this {data.form.frequency === 'DAILY' ? 'day' : data.form.frequency === 'WEEKLY' ? 'week' : 'month'}.
        </p>
        <Card className="mt-8 w-full p-5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <StreakFlame days={result.dailyStreak.current} size="lg" />
            <div className="text-right text-[12.5px] text-muted-foreground">
              {isWeekly ? `Weekly reviews: ${result.weeklyStreak.current} weeks in a row` : `Best streak: ${result.dailyStreak.best} days`}
            </div>
          </div>
          {result.nextSession ? (
            <div className="mt-5 flex items-start gap-2.5 border-t pt-4 text-[13px]">
              <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
              <span>
                Your coach will review this before your next session — <b className="font-medium">{result.nextSession.topic}</b>, {fmtDateTime(result.nextSession.scheduledAt)}.
              </span>
            </div>
          ) : null}
          <div className="mt-4 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Lock className="size-3" /> Your reflections are shared only with your coach.
          </div>
        </Card>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={() => navigate('/client/growth')}>
            View growth journey
          </Button>
          <Button onClick={() => navigate('/client')}>Back to dashboard</Button>
        </div>
      </div>
    )
  }

  const submitted = data.submission?.status === 'SUBMITTED'
  const answered = data.form.questions.filter((q) => isAnswered(values[q.id])).length
  const pct = Math.round((answered / Math.max(1, data.form.questions.length)) * 100)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-14 z-10 -mx-4 mb-8 border-b bg-background/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center gap-3">
          <Link to="/client" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <Progress value={submitted ? 100 : pct} />
          </div>
          <span className="w-24 text-right text-[12px] tabular-nums text-muted-foreground">
            {submitted ? 'Submitted' : `${answered}/${data.form.questions.length} answered`}
          </span>
        </div>
      </div>

      <div className="mb-10">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {fmtDate(data.periodStart, { month: 'long', day: 'numeric' })} · due {fmtDate(data.dueAt, { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <h1 className="mt-1 font-serif text-[34px] leading-tight">{data.form.title}</h1>
        {data.form.description ? <p className="mt-2 text-[14.5px] text-muted-foreground">{data.form.description}</p> : null}
      </div>

      <FormRenderer questions={data.form.questions} values={values} onChange={change} disabled={submitted} missing={missing} />

      {!submitted ? (
        <div className="sticky bottom-0 -mx-4 mt-12 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : savedAt ? <CloudCheck className="size-3.5" /> : null}
            {saving ? 'Saving…' : savedAt ? `Draft saved ${relative(savedAt)}` : 'Autosaves as you write'}
          </span>
          <Button variant="outline" className="ml-auto" onClick={() => saveDraft(values, false)}>
            Save draft
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />} Submit
          </Button>
        </div>
      ) : (
        <p className="mt-10 text-center text-[13px] text-muted-foreground">Submitted {relative(data.submission?.submittedAt)}. A new one opens next period.</p>
      )}
    </div>
  )
}
