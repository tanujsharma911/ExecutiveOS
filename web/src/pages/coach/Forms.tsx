import { Check, Copy, FileText, Plus, Sparkles, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EvidenceQuote } from '@/components/common/Insight'
import { EmptyState, Loading, PageHeader, SectionTitle } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { api, isAbortError, useAbortScope, useApi } from '@/lib/api'
import type { Evidence, Form, QuestionType } from '@/lib/types'
import { relative, titleCase } from '@/lib/utils'
import { useUi } from '@/store/ui'

export interface Suggestion {
  id: string
  clientId: string
  theme: string
  question: string
  type: QuestionType
  rationale: string
  evidence: Evidence[]
  client: { user: { name: string; avatarColor: string } }
}

const EXAMPLES = [
  'Create a weekly leadership reflection form for a CEO struggling with delegation and team ownership.',
  'A daily two-minute check-in for a founder dealing with operational overload and burnout.',
  'A monthly review for a CEO preparing for difficult board conversations.',
]

export function AiFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const scope = useAbortScope()
  const [prompt, setPrompt] = useState(EXAMPLES[0])
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    if (!open) {
      scope.abortAll()
      setBusy(false)
    }
  }, [open, scope])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Create a form with AI" description="Describe the client and what you want to learn. You'll review and edit every question before publishing." />
        <DialogBody className="grid gap-3">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="text-[14px]" />
          <div className="grid gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setPrompt(e)} className="rounded-md px-2 py-1 text-left text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                “{e}”
              </button>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="ai"
            disabled={busy || prompt.trim().length < 5}
            onClick={async () => {
              setBusy(true)
              try {
                const gen = await api<{ title: string; description: string; frequency: string; questions: unknown[] }>('/forms/ai/generate', { method: 'POST', json: { prompt }, signal: scope.next() })
                navigate('/coach/forms/new', { state: { generated: gen, prompt } })
              } catch (e) {
                if (isAbortError(e)) return // dialog closed or page left
                toast.error((e as Error).message)
              }
              setBusy(false)
            }}
          >
            <Wand2 /> {busy ? 'Generating…' : 'Generate questions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SuggestionCard({ s, forms, onDone, compact }: { s: Suggestion; forms: Form[]; onDone: (approved: boolean, formId?: string) => void; compact?: boolean }) {
  const eligible = forms.filter((f) => f.assignments.some((a) => a.clientId === s.clientId))
  const [formId, setFormId] = useState(eligible[0]?.id ?? '')
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Avatar name={s.client.user.name} color={s.client.user.avatarColor} size={20} /> {s.client.user.name}
        <Badge variant="ai" className="ml-auto">
          <Sparkles /> Suggested
        </Badge>
      </div>
      <p className="mt-2 font-serif text-[16px] leading-snug">{s.question}</p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{s.rationale}</p>
      {!compact && s.evidence?.[0] ? (
        <div className="mt-2">
          <EvidenceQuote e={s.evidence[0]} compact />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!compact ? (
          <NativeSelect value={formId} onChange={(e) => setFormId(e.target.value)} className="h-8 w-auto min-w-48 text-[12.5px]">
            {eligible.map((f) => (
              <option key={f.id} value={f.id}>
                Add to: {f.title}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Button size="sm" disabled={!compact && !formId} onClick={() => onDone(true, formId)}>
          <Check /> Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          <X /> Dismiss
        </Button>
      </div>
    </Card>
  )
}

export default function Forms() {
  const { data, loading } = useApi<Form[]>('/forms')
  const suggestions = useApi<Suggestion[]>('/coach/suggestions')
  const [aiOpen, setAiOpen] = useState(false)
  const navigate = useNavigate()
  const bump = useUi((s) => s.bump)

  return (
    <div>
      <PageHeader
        title="Form Builder"
        description="Design reflection forms, assign them to clients and set how often they're due."
        actions={
          <>
            <Button variant="ai-soft" onClick={() => setAiOpen(true)}>
              <Sparkles /> Create with AI
            </Button>
            <Button onClick={() => navigate('/coach/forms/new')}>
              <Plus /> New form
            </Button>
          </>
        }
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <SectionTitle>Your forms</SectionTitle>
          {loading && !data ? <Loading /> : null}
          {data && !data.length ? <EmptyState icon={FileText} title="No forms yet" action={<Button onClick={() => navigate('/coach/forms/new')}>Create a form</Button>} /> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {data?.map((f) => (
              <Card key={f.id} className="group flex cursor-pointer flex-col p-4 transition hover:border-foreground/20" onClick={() => navigate(`/coach/forms/${f.id}`)}>
                <div className="flex items-center gap-2">
                  <Badge variant={f.status === 'PUBLISHED' ? 'success' : 'warning'}>{f.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
                  <Badge variant="outline">{titleCase(f.frequency).replace('One time', 'One-time')}</Badge>
                  {f.aiGenerated ? (
                    <Badge variant="ai">
                      <Sparkles /> AI-assisted
                    </Badge>
                  ) : null}
                  <button
                    className="ml-auto rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100 cursor-pointer"
                    title="Duplicate"
                    onClick={async (e) => {
                      e.stopPropagation()
                      await api(`/forms/${f.id}/duplicate`, { method: 'POST' })
                      toast.success('Form duplicated')
                      bump()
                    }}
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <h3 className="mt-2.5 text-[14.5px] font-semibold">{f.title}</h3>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{f.description}</p>
                <div className="mt-auto flex items-center justify-between pt-4 text-[12px] text-muted-foreground">
                  <div className="flex -space-x-1.5">
                    {f.assignments.map((a) => (
                      <Avatar key={a.clientId} name={a.client.user.name} color={a.client.user.avatarColor} size={22} className="ring-2 ring-card" />
                    ))}
                    {!f.assignments.length ? <span>Not assigned</span> : null}
                  </div>
                  <span>
                    {f.questions.length} questions · {f._count.submissions} responses · {relative(f.updatedAt)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle icon={Sparkles}>Adaptive suggestions</SectionTitle>
          <p className="mb-3 text-[12.5px] text-muted-foreground">Based on what clients keep writing about. Suggestions only join a form after you approve them.</p>
          {suggestions.loading && !suggestions.data ? <Loading label="Reading recent responses…" /> : null}
          <div className="grid gap-2.5">
            {suggestions.data?.slice(0, 6).map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                forms={data ?? []}
                onDone={async (approved, formId) => {
                  await api(`/coach/suggestions/${s.id}/${approved ? 'approve' : 'dismiss'}`, { method: 'POST', json: approved ? { formId } : {} })
                  toast.success(approved ? 'Question added to the form' : 'Suggestion dismissed')
                  suggestions.setData((x) => x?.filter((y) => y.id !== s.id) ?? null)
                  if (approved) bump()
                }}
              />
            ))}
            {suggestions.data && !suggestions.data.length ? <EmptyState title="No suggestions right now" /> : null}
          </div>
        </section>
      </div>
      <AiFormDialog open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  )
}
