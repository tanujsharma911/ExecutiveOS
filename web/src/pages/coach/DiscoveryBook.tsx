/**
 * Discovery Call Book: one rich-text editor. "Template" is the coach's master book; picking a prospect opens
 * that prospect's own copy (started from the template). An AI assistant sits beside the editor.
 */
import type { JSONContent } from '@tiptap/react'
import { Check, Download, ExternalLink, FileText, MoreHorizontal, Printer, RotateCcw, Save, Send, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AiGenerating } from '@/components/common/AiGenerating'
import { ErrorState, PageHeader } from '@/components/common/Page'
import { ProspectStatusBadge } from '@/components/features/Prospects'
import { RichTextEditor, useRichEditor } from '@/components/features/RichTextEditor'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from '@/components/ui/misc'
import { api, http, useAbortScope, useApi } from '@/lib/api'
import { linkHost, type ProspectRow } from '@/lib/discovery'
import { cn, fmtDate } from '@/lib/utils'

interface BookView {
  id: string | null
  title: string
  content: JSONContent
  sources: { url: string; title: string }[]
  version: number
  updatedAt: string
  model: string
  saved: boolean
  kind: 'template' | 'prospect'
}
type Apply = 'insert' | 'replace_selection' | 'replace_all' | 'none'
interface Suggestion {
  id: number
  instruction: string
  reply?: string
  html?: string
  apply?: Apply
  range?: { from: number; to: number } | null
  status: 'loading' | 'ready' | 'applied' | 'discarded' | 'error'
}

const APPLY_LABEL: Record<Exclude<Apply, 'none'>, string> = { insert: 'Insert at cursor', replace_selection: 'Replace selection', replace_all: 'Replace the book' }

function printDoc(title: string, html: string) {
  const w = window.open('', '_blank')
  if (!w) return toast.error('Allow pop-ups to print or save as PDF')
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  w.document.write(
    `<!doctype html><html><head><title>${esc(title)}</title><style>body{font:14px/1.55 Inter,system-ui,sans-serif;color:#18181b;max-width:720px;margin:32px auto;padding:0 24px}h1{font-size:22px;margin:0 0 16px}h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #e4e4e7;padding-bottom:4px}h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#71717a;margin:12px 0 2px}ul,ol{padding-left:20px}li p{margin:2px 0}ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:8px}ul[data-type=taskList] li>label{margin-top:2px}a{color:#4f46e5}.notes{margin-top:24px;border:1px dashed #d4d4d8;border-radius:8px;height:160px}@media print{body{margin:0}}</style></head><body><h1>${esc(title)}</h1>${html}<h2>Notes during the call</h2><div class="notes"></div><script>window.onload=()=>window.print()</script></body></html>`,
  )
  w.document.close()
}

export default function DiscoveryBook() {
  const [params, setParams] = useSearchParams()
  const prospectId = params.get('prospect') ?? ''
  const scope = useAbortScope()
  const { data: prospects, reload: reloadProspects } = useApi<ProspectRow[]>('/discovery/prospects')
  const { data: book, error, setData: setBook, reload } = useApi<BookView>(`/discovery/book${prospectId ? `?prospectId=${encodeURIComponent(prospectId)}` : ''}`, [prospectId])
  const [title, setTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sources, setSources] = useState<BookView['sources']>([])
  const [items, setItems] = useState<Suggestion[]>([])
  const [ask, setAsk] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const nextId = useRef(1)
  const loadedFor = useRef<string | null>(null)
  const prospect = prospects?.find((p) => p.id === prospectId) ?? null

  const editor = useRichEditor({ content: null, onChange: () => setDirty(true), placeholder: 'Write your Discovery Call Book, or ask the AI to draft it →' })

  // Load the book into the editor whenever the selected prospect's book arrives.
  useEffect(() => {
    if (!editor || !book) return
    const key = `${prospectId}:${book.id ?? 'new'}`
    if (loadedFor.current === key) return
    loadedFor.current = key
    editor.commands.setContent(book.content, { emitUpdate: false })
    setTitle(book.title)
    setSources(book.sources ?? [])
    setDirty(false)
    setItems([])
  }, [editor, book, prospectId])

  useEffect(() => {
    if (!editor) return
    const on = () => setHasSelection(!editor.state.selection.empty)
    editor.on('selectionUpdate', on)
    return () => void editor.off('selectionUpdate', on)
  }, [editor])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const save = useCallback(async () => {
    if (!editor || !book) return false
    setSaving(true)
    try {
      const b = await api<BookView>('/discovery/book', { method: 'PUT', json: { prospectId: prospectId || undefined, title: title.trim() || book.title, content: editor.getJSON(), sources } })
      loadedFor.current = `${prospectId}:${b.id}`
      setBook(b)
      setDirty(false)
      if (prospectId && !book.saved) reloadProspects()
      toast.success(prospect ? `Saved to ${prospect.name}` : 'Template saved')
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }, [editor, book, prospectId, title, sources, prospect, setBook, reloadProspects])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, save])

  const switchTo = (id: string) => {
    if (dirty && !confirm('You have unsaved changes. Switch anyway and lose them?')) return
    setParams(id ? { prospect: id } : {})
  }

  const runAi = async (instruction: string, research = false) => {
    if (!editor || !instruction.trim()) return
    const { from, to, empty } = editor.state.selection
    const selection = empty ? undefined : editor.state.doc.textBetween(from, to, '\n')
    const id = nextId.current++
    setItems((xs) => [...xs, { id, instruction, status: 'loading', range: empty ? null : { from, to } }])
    setAsk('')
    try {
      const html = editor.getHTML()
      const r = await api<{ reply: string; apply: Apply; html: string; sources: BookView['sources'] }>('/discovery/book/assist', {
        method: 'POST',
        json: { prospectId: prospectId || undefined, html, selection, instruction, research },
        signal: scope.signal(),
      })
      if (r.sources?.length) setSources(r.sources)
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...r, apply: r.apply === 'replace_selection' && !selection ? 'insert' : r.apply, status: 'ready' } : x)))
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, reply: (e as Error).message, status: 'error' } : x)))
    }
  }

  const apply = (s: Suggestion) => {
    if (!editor || !s.html) return
    if (s.apply === 'replace_all') editor.chain().focus().setContent(s.html).run()
    else if (s.apply === 'replace_selection' && s.range) editor.chain().focus().insertContentAt(s.range, s.html).run()
    else editor.chain().focus().insertContent(s.html).run()
    setDirty(true)
    setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, status: 'applied' } : x)))
  }

  const download = async (format: 'md' | 'docx') => {
    if ((dirty || !book?.saved) && !(await save())) return
    const res = await http.get('/discovery/book/export', { params: { format, prospectId: prospectId || undefined }, responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'discovery-call-book'}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const quick = prospect
    ? [
        { label: `Draft for ${prospect.name.split(' ')[0]}`, text: `Draft the full Discovery Call Book for ${prospect.name}, using their details, my notes and their public links.`, research: true },
        { label: 'Tailor to their industry', text: `Tailor the questions to ${prospect.industry || 'their industry'} and ${prospect.company || 'their business'}. Keep my structure.` },
      ]
    : [{ label: 'Draft a template', text: 'Draft a reusable Discovery Call Book template I can start every prospect from.' }]
  const common = hasSelection
    ? [
        { label: 'Rewrite selection', text: 'Rewrite the selected text so it is sharper and more open-ended.' },
        { label: 'Shorten selection', text: 'Make the selected text shorter.' },
      ]
    : [
        { label: 'Add profit questions', text: 'Add 3 open questions that link their pains to profitability, in the Info gathering section.' },
        { label: 'Make it shorter', text: 'Make the whole book shorter and easier to scan during a call. Keep every section.' },
      ]

  if (error) return <ErrorState message={error} />

  return (
    <div>
      <PageHeader title="Discovery Call Book" description="Your call preparation in one place. Edit the template, or pick a prospect to tailor their own copy with AI." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect value={prospectId} onChange={(e) => switchTo(e.target.value)} className="w-full sm:w-80" aria-label="Book for">
          <option value="">Template (starting point for everyone)</option>
          {(prospects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.company ? ` · ${p.company}` : ''}
              {p.books ? '' : ' (no book yet)'}
            </option>
          ))}
        </NativeSelect>
        {prospect ? <ProspectStatusBadge status={prospect.status} /> : null}
        {prospect ? (
          <Link to={`/coach/prospects/${prospect.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            Open prospect <ExternalLink className="size-3" />
          </Link>
        ) : null}
        <span className="text-[12px] text-muted-foreground sm:ml-auto">
          {!book ? '' : dirty ? 'Unsaved changes' : !book.saved ? 'Started from your template, not saved yet' : `Saved · v${book.version} · ${fmtDate(book.updatedAt)}`}
        </span>
        <div className="flex gap-2">
          <Button disabled={!book || saving || (!dirty && book.saved)} onClick={() => void save()}>
            <Save /> {prospect ? `Save to ${prospect.name.split(' ')[0]}` : 'Save template'}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={!book}>
                <Download /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-48 gap-0.5 p-1" align="end">
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => editor && printDoc(title, editor.getHTML())}>
                <Printer /> PDF (print)
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => void download('docx')}>
                <FileText /> Word (.docx)
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => void download('md')}>
                <FileText /> Markdown (.md)
              </Button>
            </PopoverContent>
          </Popover>
          {prospect && book?.saved ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="grid w-56 gap-0.5 p-1" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-danger"
                  onClick={async () => {
                    if (!confirm(`Delete ${prospect.name}'s copy and start again from the template?`)) return
                    await api(`/discovery/book?prospectId=${prospect.id}`, { method: 'DELETE' })
                    loadedFor.current = null
                    setDirty(false)
                    reload()
                    reloadProspects()
                    toast.success('Reset to the template')
                  }}
                >
                  <RotateCcw /> Reset to template
                </Button>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {!book ? (
            <div className="rounded-xl border bg-card p-6" aria-busy="true">
              <Skeleton className="mb-5 h-7 w-2/3" />
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className={cn('mb-3 h-4', i % 3 === 0 ? 'w-1/3' : 'w-full')} />
              ))}
            </div>
          ) : (
            <>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setDirty(true)
                }}
                className="mb-2 h-11 border-transparent bg-transparent px-1 text-xl font-semibold shadow-none hover:border-border"
                aria-label="Title"
              />
              <RichTextEditor editor={editor} />
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Sparkles className="size-4 text-ai" />
              <h2 className="text-[14px] font-semibold">AI assistant</h2>
              <span className="ml-auto text-[11.5px] text-muted-foreground">{prospect ? `For ${prospect.name.split(' ')[0]}` : 'Template'}</span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {!items.length ? (
                <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 text-center text-[12.5px] text-muted-foreground">
                  <Sparkles className="size-5 text-ai/60" />
                  No messages yet. Pick a suggestion below or type a request.
                </div>
              ) : null}
              {items.map((s) => (
                <div key={s.id} className="grid gap-1.5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[12.5px] leading-relaxed text-primary-foreground">{s.instruction}</div>
                  </div>
                  {s.status === 'loading' ? (
                    <AiGenerating steps={s.instruction.startsWith('Draft the full') ? ['Reading their links', 'Finding pains and problems to ask about', 'Writing your book'] : ['Reading your book', 'Writing']} lines={3} />
                  ) : (
                    <div className={cn('mr-4 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-[12.5px]', s.status === 'error' && 'bg-danger-soft text-danger')}>
                      <p className="leading-relaxed">{s.reply}</p>
                      {s.html && s.apply !== 'none' ? (
                        <>
                          <div className={cn('rte-preview mt-2 max-h-56 overflow-y-auto rounded-lg border bg-card px-2.5 py-1.5 text-[12.5px]', s.status !== 'ready' && 'opacity-60')} dangerouslySetInnerHTML={{ __html: s.html }} />
                          {s.status === 'ready' ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button size="sm" variant="ai" onClick={() => apply(s)}>
                                <Check /> {APPLY_LABEL[s.apply as Exclude<Apply, 'none'>]}
                              </Button>
                              {s.apply !== 'insert' ? (
                                <Button size="sm" variant="outline" onClick={() => apply({ ...s, apply: 'insert' })}>
                                  Insert instead
                                </Button>
                              ) : null}
                              <Button size="sm" variant="ghost" onClick={() => setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, status: 'discarded' } : x)))}>
                                <X /> Discard
                              </Button>
                            </div>
                          ) : (
                            <p className="mt-1.5 text-[11.5px] text-muted-foreground">{s.status === 'applied' ? 'Applied to the book' : 'Discarded'}</p>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {sources.length ? (
                <div className="border-t pt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pages the AI read</div>
                  {sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate text-[12px] hover:underline">
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" /> {s.title || linkHost(s.url)}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="border-t px-3 py-3">
              <div className="mb-2 flex flex-col items-end gap-1.5">
                {[...quick, ...common].map((q) => (
                  <button
                    key={q.label}
                    disabled={!book}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void runAi(q.text, 'research' in q && !!q.research)}
                    className="max-w-[85%] rounded-2xl rounded-br-sm border bg-card px-3 py-1.5 text-right text-[12.5px] hover:border-ai/40 hover:bg-ai-soft hover:text-ai cursor-pointer disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <form
                className="flex items-stretch gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void runAi(ask)
                }}
              >
                <Textarea
                  rows={2}
                  value={ask}
                  disabled={!book}
                  placeholder={hasSelection ? 'What should change in the selected text?' : 'Ask the AI, e.g. add questions about hiring'}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void runAi(ask)
                    }
                  }}
                  className="min-h-0 resize-none text-[13px]"
                />
                <Button type="submit" variant="ai" className="h-auto w-10 shrink-0 px-0" disabled={!ask.trim() || !book} aria-label="Send">
                  <Send />
                </Button>
              </form>
            </div>
          </Card>
          <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Ask for a draft, new questions or a rewrite. {hasSelection ? 'Your selected text will be rewritten.' : 'Select text in the book to rewrite just that part.'} Suggestions only change the book when you apply them.
          </p>
        </aside>
      </div>
    </div>
  )
}
