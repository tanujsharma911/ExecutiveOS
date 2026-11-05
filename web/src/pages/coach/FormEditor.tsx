import { ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, GripVertical, PencilLine, Plus, Save, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loading } from '@/components/common/Page'
import { FormRenderer, QUESTION_TYPES } from '@/components/features/FormRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Popover, PopoverContent, PopoverTrigger, Switch } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, isAbortError, useAbortScope, useApi } from '@/lib/api'
import type { ClientRow, Form, Frequency, Question, QuestionType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EMOTION_LABELS } from './formConstants'
import { SuggestionCard, type Suggestion } from './Forms'

type EditQ = Question & { _key: string; rationale?: string }
const FREQS: { value: Frequency; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One-time' },
]

let keySeq = 0
const k = () => `q${Date.now()}_${keySeq++}`
const blank = (type: QuestionType): EditQ => ({
  _key: k(),
  type,
  label: '',
  helpText: '',
  required: false,
  options: type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' ? ['Option 1', 'Option 2'] : type === 'EMOTION' ? EMOTION_LABELS : [],
  metricKey: type === 'EMOTION' ? 'emotion' : type === 'GOAL_PROGRESS' ? 'goalProgress' : null,
})

interface Generated {
  title: string
  description: string
  frequency: Frequency
  questions: (Question & { rationale?: string })[]
}

export default function FormEditor() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const gen = (location.state as { generated?: Generated; prompt?: string } | null)?.generated
  const existing = useApi<Form>(id ? `/forms/${id}` : null, [id])
  const clients = useApi<ClientRow[]>('/coach/clients')
  const suggestions = useApi<Suggestion[]>('/coach/suggestions')

  const [title, setTitle] = useState('Untitled form')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('WEEKLY')
  const [status, setStatus] = useState<Form['status']>('DRAFT')
  const [questions, setQuestions] = useState<EditQ[]>([])
  const [clientIds, setClientIds] = useState<string[]>([])
  const [aiGenerated, setAiGenerated] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [preview, setPreview] = useState<Record<string, unknown>>({})
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [generating, setGenerating] = useState(false)
  const scope = useAbortScope()

  useEffect(() => {
    if (existing.data) {
      const f = existing.data
      setTitle(f.title)
      setDescription(f.description)
      setFrequency(f.frequency)
      setStatus(f.status)
      setAiGenerated(f.aiGenerated)
      setQuestions(f.questions.map((q) => ({ ...q, _key: q.id ?? k() })))
      setClientIds(f.assignments.map((a) => a.clientId))
      setDirty(false)
    }
  }, [existing.data])

  useEffect(() => {
    if (gen && !id) applyGenerated(gen, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyGenerated(g: Generated, replace: boolean) {
    if (replace) {
      setTitle(g.title)
      setDescription(g.description)
      setFrequency(g.frequency)
    }
    const qs = g.questions.map((q) => ({ ...q, helpText: q.helpText ?? '', options: q.options ?? [], _key: k() }))
    setQuestions((cur) => (replace ? qs : [...cur, ...qs]))
    setAiGenerated(true)
    setDirty(true)
  }

  const update = (key: string, patch: Partial<EditQ>) => {
    setQuestions((qs) => qs.map((q) => (q._key === key ? { ...q, ...patch } : q)))
    setDirty(true)
  }
  const move = (i: number, d: -1 | 1) => {
    setQuestions((qs) => {
      const n = [...qs]
      const j = i + d
      if (j < 0 || j >= n.length) return qs
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setDirty(true)
  }
  const relevantSuggestions = useMemo(() => (suggestions.data ?? []).filter((s) => clientIds.includes(s.clientId) && !questions.some((q) => q.label === s.question)), [suggestions.data, clientIds, questions])

  async function save(nextStatus?: Form['status']) {
    if (!title.trim()) return toast.error('Give the form a title')
    if (questions.some((q) => !q.label.trim())) return toast.error('Every question needs a label')
    setBusy(true)
    try {
      const json = {
        title,
        description,
        frequency,
        status: nextStatus ?? status,
        aiGenerated,
        clientIds,
        questions: questions.map(({ _key, rationale: _r, ...q }) => ({ ...q, helpText: q.helpText || null })),
      }
      const f = id ? await api<Form>(`/forms/${id}`, { method: 'PUT', json }) : await api<Form>('/forms', { method: 'POST', json })
      setStatus(f.status)
      setDirty(false)
      toast.success(nextStatus === 'PUBLISHED' ? `Published and assigned to ${clientIds.length} client${clientIds.length === 1 ? '' : 's'}` : 'Form saved')
      if (!id) navigate(`/coach/forms/${f.id}`, { replace: true })
      else existing.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (id && !existing.data) return <Loading />

  return (
    <div>
      <Link to="/coach/forms" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Form Builder
      </Link>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Badge variant={status === 'PUBLISHED' ? 'success' : 'warning'}>{status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
          {aiGenerated ? (
            <Badge variant="ai">
              <Sparkles /> AI-assisted
            </Badge>
          ) : null}
          {dirty ? <span className="text-[12px] text-muted-foreground">Unsaved changes</span> : null}
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: <span className="flex items-center gap-1.5"><PencilLine className="size-3.5" /> Edit</span> },
              { value: 'preview', label: <span className="flex items-center gap-1.5"><Eye className="size-3.5" /> Preview</span> },
            ]}
          />
          <Button variant="outline" onClick={() => save()} disabled={busy}>
            <Save /> Save draft
          </Button>
          <Button onClick={() => save('PUBLISHED')} disabled={busy || !questions.length}>
            <Send /> {status === 'PUBLISHED' ? 'Update & publish' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {mode === 'preview' ? (
            <Card className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
              <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Preview · {FREQS.find((f) => f.value === frequency)?.label}</div>
              <h1 className="font-serif text-[30px] leading-tight">{title}</h1>
              {description ? <p className="mt-2 text-[14px] text-muted-foreground">{description}</p> : null}
              <div className="mt-8">
                <FormRenderer questions={questions.map((q) => ({ ...q, id: q._key }))} values={preview} onChange={(key, v) => setPreview((p) => ({ ...p, [key]: v }))} />
              </div>
            </Card>
          ) : (
            <div className="grid gap-3">
              <Card className="p-5">
                <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="h-auto border-0 px-0 font-serif text-[26px] shadow-none focus-visible:ring-0" placeholder="Form title" />
                <Textarea value={description} onChange={(e) => (setDescription(e.target.value), setDirty(true))} className="mt-1 min-h-0 border-0 px-0 text-[14px] text-muted-foreground shadow-none focus-visible:ring-0" rows={2} placeholder="Describe the purpose of this form for your client…" />
              </Card>

              {questions.map((q, i) => (
                <Card key={q._key} className="group p-4 animate-rise">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center gap-0.5 pt-1 text-muted-foreground">
                      <GripVertical className="size-4 opacity-40" />
                      <button className="rounded p-0.5 hover:bg-muted disabled:opacity-30 cursor-pointer" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button className="rounded p-0.5 hover:bg-muted disabled:opacity-30 cursor-pointer" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <span className="pt-2 text-[12px] font-medium tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                        <Input value={q.label} onChange={(e) => update(q._key, { label: e.target.value })} placeholder="Question" className="flex-1 text-[14px] font-medium" />
                        <NativeSelect value={q.type} onChange={(e) => update(q._key, { ...blank(e.target.value as QuestionType), _key: q._key, label: q.label, required: q.required })} className="sm:w-48">
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <Input value={q.helpText ?? ''} onChange={(e) => update(q._key, { helpText: e.target.value })} placeholder="Help text (optional)" className="h-8 text-[12.5px]" />
                      {q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' ? (
                        <div className="grid gap-1.5">
                          {q.options.map((o, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <span className={cn('size-3.5 border border-input', q.type === 'MULTIPLE_CHOICE' ? 'rounded' : 'rounded-full')} />
                              <Input value={o} onChange={(e) => update(q._key, { options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)) })} className="h-8 flex-1 text-[13px]" />
                              <button className="rounded p-1 text-muted-foreground hover:bg-muted cursor-pointer" onClick={() => update(q._key, { options: q.options.filter((_, xi) => xi !== oi) })} aria-label="Remove option">
                                <X className="size-3.5" />
                              </button>
                            </div>
                          ))}
                          <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => update(q._key, { options: [...q.options, `Option ${q.options.length + 1}`] })}>
                            <Plus /> Add option
                          </Button>
                        </div>
                      ) : null}
                      {q.type === 'RATING' ? (
                        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                          Track as trend:
                          <NativeSelect value={q.metricKey ?? ''} onChange={(e) => update(q._key, { metricKey: e.target.value || null })} className="h-8 w-48 text-[12.5px]">
                            <option value="">— none —</option>
                            <option value="confidence">Leadership confidence</option>
                            <option value="team">Team relationship</option>
                            <option value="energy">Energy</option>
                            <option value="stress">Stress</option>
                          </NativeSelect>
                        </div>
                      ) : null}
                      {q.rationale ? (
                        <p className="flex items-start gap-1.5 text-[12px] text-ai">
                          <Sparkles className="mt-0.5 size-3 shrink-0" /> {q.rationale}
                        </p>
                      ) : null}
                      <div className="flex items-center gap-3 border-t pt-2.5">
                        <label className="flex items-center gap-2 text-[12.5px]">
                          <Switch checked={q.required} onCheckedChange={(v) => update(q._key, { required: v })} /> Required
                        </label>
                        <div className="ml-auto flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Duplicate"
                            onClick={() => {
                              setQuestions((qs) => [...qs.slice(0, i + 1), { ...q, id: undefined, _key: k() }, ...qs.slice(i + 1)])
                              setDirty(true)
                            }}
                          >
                            <Copy />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Remove"
                            className="text-danger"
                            onClick={() => {
                              setQuestions((qs) => qs.filter((x) => x._key !== q._key))
                              setDirty(true)
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-[13px] font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground cursor-pointer">
                    <Plus className="size-4" /> Add question
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" className="grid w-[min(440px,calc(100vw-24px))] grid-cols-2 gap-1 p-2">
                  {QUESTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      className="rounded-lg px-3 py-2 text-left hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setQuestions((qs) => [...qs, blank(t.value)])
                        setDirty(true)
                      }}
                    >
                      <div className="text-[13px] font-medium">{t.label}</div>
                      <div className="text-[11.5px] text-muted-foreground">{t.hint}</div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Submission frequency</Label>
                <div className="grid grid-cols-3 gap-1">
                  {FREQS.map((f) => (
                    <button key={f.value} onClick={() => (setFrequency(f.value), setDirty(true))} className={cn('rounded-md border px-2 py-1.5 text-[12.5px] font-medium cursor-pointer', frequency === f.value ? 'border-foreground bg-foreground text-white' : 'hover:bg-muted')}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Assign to clients</Label>
                  <button className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => (setClientIds(clients.data?.map((c) => c.id) ?? []), setDirty(true))}>
                    Select all
                  </button>
                </div>
                <div className="grid gap-1">
                  {clients.data?.map((c) => {
                    const on = clientIds.includes(c.id)
                    return (
                      <label key={c.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition', on ? 'border-foreground/30 bg-muted/50' : 'hover:bg-muted/40')}>
                        <input type="checkbox" checked={on} onChange={() => (setClientIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id])), setDirty(true))} className="accent-[#18181b]" />
                        <Avatar name={c.name} color={c.avatarColor} size={22} />
                        <span className="text-[13px]">{c.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="text-[12px] text-muted-foreground">
                {questions.length} questions · {questions.filter((q) => q.required).length} required
              </div>
            </CardContent>
          </Card>

          <Card className="border-ai/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Wand2 className="size-4 text-ai" /> AI question assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="e.g. Add questions about board preparation and executive presence" className="text-[13px]" />
              <Button
                variant="ai-soft"
                size="sm"
                disabled={prompt.trim().length < 5 || busy || generating}
                onClick={async () => {
                  setGenerating(true)
                  try {
                    const g = await api<Generated>('/forms/ai/generate', { method: 'POST', json: { prompt }, signal: scope.next() })
                    const fresh = g.questions.filter((q) => !questions.some((x) => x.label === q.label))
                    applyGenerated({ ...g, questions: fresh }, questions.length === 0)
                    toast.success(`${fresh.length} questions added — review and edit before publishing`)
                  } catch (e) {
                    if (isAbortError(e)) return // left the editor
                    toast.error((e as Error).message)
                  }
                  setGenerating(false)
                }}
              >
                <Sparkles className={cn(generating && 'animate-pulse')} /> {generating ? 'Generating…' : 'Suggest questions'}
              </Button>
            </CardContent>
          </Card>

          {relevantSuggestions.length ? (
            <div className="grid gap-2">
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Adaptive suggestions for assigned clients</div>
              {relevantSuggestions.slice(0, 4).map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  forms={[]}
                  compact
                  onDone={async (approved) => {
                    if (approved) {
                      setQuestions((qs) => [...qs, { ...blank(s.type), label: s.question, rationale: s.rationale }])
                      setDirty(true)
                      if (id) await api(`/coach/suggestions/${s.id}/approve`, { method: 'POST', json: { formId: id, addQuestion: false } })
                      toast.success('Added — save the form to keep it')
                    } else {
                      await api(`/coach/suggestions/${s.id}/dismiss`, { method: 'POST' })
                    }
                    suggestions.setData((x) => x?.filter((y) => y.id !== s.id) ?? null)
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
