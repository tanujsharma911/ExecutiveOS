/** Chat on the public intake form: helps the prospect understand programs and how paying with PayPal works. */
import { ArrowRight, CalendarClock, Check, Eye, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { usd } from '@/lib/discovery'
import { cn } from '@/lib/utils'

export interface ChatProgram {
  id: string
  name: string
  durationWeeks: number
  priceCents: number
  billingType: 'ONE_TIME' | 'SUBSCRIPTION'
  focusAreas: string[]
}
type Action = { type: 'select_program' | 'show_schedule'; programId: string } | { type: 'compare' } | { type: 'go_to_payment' }
interface Msg {
  role: 'user' | 'assistant'
  text: string
  actions?: Action[]
  suggestions?: string[]
  error?: boolean
}

const STARTERS = ['Which program fits me?', 'How does auto-renew work?', 'What if a payment fails?', 'Can I pay by card without a PayPal account?', 'How do I cancel?']
const DAY = 86_400_000
const fmt = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

/** Same rules as the server: one charge today, then one per term for auto-renewing programs. */
function Schedule({ p }: { p: ChatProgram }) {
  const now = Date.now()
  const sub = p.billingType === 'SUBSCRIPTION'
  const charges = sub ? [0, 1, 2].map((i) => new Date(now + i * p.durationWeeks * 7 * DAY)) : [new Date(now)]
  const perYear = sub ? Math.floor((52 * 7 - 1) / (p.durationWeeks * 7)) + 1 : 1
  return (
    <div className="mt-2 rounded-lg border bg-card px-3 py-2 text-[12.5px]">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
        <CalendarClock className="size-3.5" /> {p.name}: what you pay
      </div>
      <ol className="grid gap-1">
        {charges.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={cn('size-1.5 rounded-full', i === 0 ? 'bg-ai' : 'bg-foreground/25')} />
            <span className="flex-1">{i === 0 ? 'Today' : fmt(d)}</span>
            <span className="tabular-nums font-medium">{usd(p.priceCents)}</span>
          </li>
        ))}
        {sub ? <li className="pl-3.5 text-muted-foreground">… every {p.durationWeeks} weeks until you cancel in PayPal</li> : null}
      </ol>
      <div className="mt-1.5 flex justify-between border-t pt-1.5 text-muted-foreground">
        <span>{sub ? 'First 12 months' : 'Total'}</span>
        <span className="tabular-nums font-medium text-foreground">{usd(perYear * p.priceCents)}</span>
      </div>
    </div>
  )
}

function Compare({ programs }: { programs: ChatProgram[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border bg-card text-[12px]">
      {programs.map((p) => (
        <div key={p.id} className="border-b px-3 py-1.5 last:border-b-0">
          <div className="flex justify-between gap-2 font-medium">
            <span>{p.name}</span>
            <span className="tabular-nums">{usd(p.priceCents)}</span>
          </div>
          <div className="text-muted-foreground">
            {p.durationWeeks} weeks · {p.billingType === 'SUBSCRIPTION' ? `renews every ${p.durationWeeks} weeks` : 'one-time payment'}
            {p.focusAreas.length ? ` · ${p.focusAreas.slice(0, 2).join(', ')}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

export function IntakeAssistant({ token, coachName, programs, prospectId, firstName, selectedProgramId, onSelectProgram, onGoToPayment, onChatId }: {
  token: string
  coachName: string
  programs: ChatProgram[]
  prospectId?: string
  firstName?: string
  selectedProgramId: string | null
  onSelectProgram: (id: string) => void
  onGoToPayment: () => void
  onChatId: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [msgs, busy])

  const send = async (message: string) => {
    const m = message.trim()
    if (!m || busy) return
    setText('')
    setMsgs((xs) => [...xs, { role: 'user', text: m }])
    setBusy(true)
    try {
      const r = await api<{ chatId: string | null; reply: string; actions: Action[]; suggestions: string[] }>(`/public/intake/${token}/chat`, {
        method: 'POST',
        json: { chatId: chatId ?? undefined, message: m, selectedProgramId, prospectId },
      })
      if (r.chatId && r.chatId !== chatId) {
        setChatId(r.chatId)
        onChatId(r.chatId)
      }
      setMsgs((xs) => [...xs, { role: 'assistant', text: r.reply, actions: r.actions, suggestions: r.suggestions }])
    } catch (e) {
      setMsgs((xs) => [...xs, { role: 'assistant', text: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const byId = (id: string) => programs.find((p) => p.id === id)
  const last = msgs[msgs.length - 1]
  const chips = !msgs.length ? STARTERS : last?.role === 'assistant' && last.suggestions?.length ? last.suggestions : []

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ai px-4 py-3 text-[13.5px] font-medium text-white shadow-lg hover:bg-ai/90 cursor-pointer"
        >
          <MessageCircle className="size-4" /> Ask about programs & payment
        </button>
      ) : null}
      {open ? (
        <section
          className="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col rounded-t-2xl border bg-card shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100dvh-40px)] sm:w-[400px] sm:rounded-2xl"
          aria-label="Intake assistant"
        >
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-ai-soft text-ai">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[14px] font-semibold">Programs & payment help</div>
              <div className="text-[11.5px] text-muted-foreground">AI assistant · answers come from {coachName}'s programs and PayPal checkout</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted cursor-pointer" aria-label="Close chat">
              <X className="size-4" />
            </button>
          </header>
          <div className="flex items-start gap-2 border-b bg-muted/50 px-4 py-2 text-[11.5px] text-muted-foreground">
            <Eye className="mt-0.5 size-3.5 shrink-0" /> {coachName} can read this conversation so they can follow up. Never type card numbers here; payment happens only in PayPal’s window.
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!msgs.length ? (
              <div className="rounded-lg bg-ai-soft/60 px-3 py-2 text-[13px] leading-relaxed">
                Hi{firstName ? ` ${firstName}` : ''}! I can help you choose a program and explain exactly how paying with PayPal works: what you pay today, when it renews, what happens if a payment fails, and how to cancel.
              </div>
            ) : null}
            {msgs.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-8 flex justify-end">
                  <div className="whitespace-pre-line rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground">{m.text}</div>
                </div>
              ) : (
                <div key={i} className="mr-6">
                  <div className={cn('whitespace-pre-line rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-[13px] leading-relaxed', m.error && 'bg-danger-soft text-danger')}>{m.text}</div>
                  {m.actions?.map((a, j) => {
                    if (a.type === 'show_schedule') {
                      const p = byId(a.programId)
                      return p ? <Schedule key={j} p={p} /> : null
                    }
                    if (a.type === 'compare') return <Compare key={j} programs={programs} />
                    return null
                  })}
                  {m.actions?.some((a) => a.type === 'select_program' || a.type === 'go_to_payment') ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.actions.map((a, j) => {
                        if (a.type === 'select_program') {
                          const p = byId(a.programId)
                          if (!p) return null
                          const chosen = selectedProgramId === p.id
                          return (
                            <Button key={j} size="sm" variant={chosen ? 'outline' : 'ai'} onClick={() => onSelectProgram(p.id)}>
                              {chosen ? <Check /> : null} {chosen ? `${p.name} selected` : `Choose ${p.name}`}
                            </Button>
                          )
                        }
                        if (a.type === 'go_to_payment')
                          return (
                            <Button
                              key={j}
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // Close so the panel doesn't cover the PayPal button; the conversation is kept.
                                setOpen(false)
                                onGoToPayment()
                              }}
                            >
                              Go to payment <ArrowRight />
                            </Button>
                          )
                        return null
                      })}
                    </div>
                  ) : null}
                </div>
              ),
            )}
            {busy ? (
              <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-3" role="status" aria-label="Assistant is typing">
                <span className="ai-dots text-[18px] leading-none text-muted-foreground">
                  <span>•</span>
                  <span>•</span>
                  <span>•</span>
                </span>
              </div>
            ) : null}
            <div ref={end} />
          </div>

          <div className="border-t px-3 py-3">
            {chips.length && !busy ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button key={c} onClick={() => void send(c)} className="rounded-full border bg-card px-2.5 py-1 text-[12px] hover:border-ai/40 hover:bg-ai-soft hover:text-ai cursor-pointer">
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send(text)
              }}
            >
              <textarea
                rows={1}
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(text)
                  }
                }}
                placeholder="Ask about a program or paying with PayPal…"
                className="max-h-28 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-[13.5px] outline-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-label="Message"
              />
              <Button type="submit" size="icon" variant="ai" disabled={!text.trim() || busy} aria-label="Send">
                <Send />
              </Button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  )
}
