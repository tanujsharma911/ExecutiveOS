/** Public intake form: a new client picks one of the coach's programs, enters their details and pays with PayPal. */
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { CheckCircle2, Clock, CreditCard, Lock, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { IntakeAssistant } from '@/components/features/IntakeAssistant'
import { api, useApi } from '@/lib/api'
import { usd, type Link as LinkItem } from '@/lib/discovery'
import { cn } from '@/lib/utils'

interface Program {
  id: string
  name: string
  description: string
  durationWeeks: number
  focusAreas: string[]
  priceCents: number
  billingType: 'ONE_TIME' | 'SUBSCRIPTION'
}
interface IntakePage {
  coach: { name: string; title: string | null; avatarColor: string }
  programs: Program[]
  paypal: { configured: boolean; env: 'sandbox' | 'live'; clientId: string | null }
  assistant?: { enabled: boolean; coachName: string }
  prefill: (Partial<Details> & { prospectId: string }) | null
}
interface Details {
  name: string
  email: string
  phone: string
  company: string
  role: string
  industry: string
  companySize: string
  location: string
  links: LinkItem[]
  goals: string
}
const EMPTY: Details = { name: '', email: '', phone: '', company: '', role: '', industry: '', companySize: '', location: '', links: [], goals: '' }
const REQUIRED: (keyof Details)[] = ['name', 'email', 'company', 'role', 'location']

function missing(d: Details) {
  const out = REQUIRED.filter((k) => !String(d[k]).trim())
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) out.push('email')
  if (d.name.trim().length === 1) out.push('name')
  return [...new Set(out)]
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <img src="/favicon.svg" alt="" className="size-6" />
          <span className="text-[15px] font-semibold">ExecutiveOS</span>
          <span className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground">
            <Lock className="size-3.5" /> Secure checkout
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}

function PayButtons({ token, programId, subscription, details, prospectId, chatId, disabled, onPaid, onError }: { token: string; programId: string; subscription: boolean; details: Details; prospectId?: string; chatId?: string | null; disabled: boolean; onPaid: (email: string, pending?: boolean) => void; onError: (msg: string) => void }) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  // PayPal keeps the callbacks from its first render, so read the latest form values from a ref.
  const latest = useRef({ programId, details, prospectId, chatId, onPaid, onError })
  useEffect(() => {
    latest.current = { programId, details, prospectId, chatId, onPaid, onError }
  })
  if (isRejected) return <p className="text-[13px] text-danger">PayPal could not be loaded. Check your connection or disable content blockers, then refresh.</p>
  return (
    <div className={cn('relative min-h-[48px]', disabled && 'pointer-events-none opacity-50')}>
      {isPending ? <Skeleton className="h-12 w-full rounded-full" /> : null}
      <PayPalButtons
        style={{ layout: 'vertical', shape: 'pill', label: subscription ? 'subscribe' : 'pay', height: 44 }}
        disabled={disabled}
        forceReRender={[programId, subscription]}
        {...(subscription
          ? {
              createSubscription: async () => {
                const { programId, details, prospectId, chatId, onError } = latest.current
                onError('')
                try {
                  const r = await api<{ subscriptionId: string }>(`/public/intake/${token}/subscriptions`, { method: 'POST', json: { programId, details, prospectId, chatId: chatId ?? undefined } })
                  return r.subscriptionId
                } catch (e) {
                  onError((e as Error).message)
                  throw e
                }
              },
              onApprove: async (data: { subscriptionID?: string | null }) => {
                try {
                  const r = await api<{ email: string; pending: boolean }>(`/public/intake/${token}/subscriptions/${data.subscriptionID}/activate`, { method: 'POST' })
                  latest.current.onPaid(r.email, r.pending)
                } catch (e) {
                  latest.current.onError((e as Error).message)
                }
              },
            }
          : {
        createOrder: async () => {
          const { programId, details, prospectId, chatId, onError } = latest.current
          onError('')
          try {
            const r = await api<{ orderId: string }>(`/public/intake/${token}/orders`, { method: 'POST', json: { programId, details, prospectId, chatId: chatId ?? undefined } })
            return r.orderId
          } catch (e) {
            onError((e as Error).message)
            throw e
          }
        },
        onApprove: async (data: { orderID: string }) => {
          try {
            const r = await api<{ email: string }>(`/public/intake/${token}/orders/${data.orderID}/capture`, { method: 'POST' })
            latest.current.onPaid(r.email)
          } catch (e) {
            latest.current.onError((e as Error).message)
          }
        },
            })}
        onError={() => latest.current.onError('PayPal reported a problem. No payment was taken. Please try again.')}
      />
    </div>
  )
}

export default function Intake() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const p = params.get('p')
  const { data, error } = useApi<IntakePage>(`/public/intake/${token}${p ? `?p=${encodeURIComponent(p)}` : ''}`)
  const [programId, setProgramId] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [flashPay, setFlashPay] = useState(false)
  const payRef = useRef<HTMLElement>(null)
  const [d, setD] = useState<Details | null>(null)
  const [touched, setTouched] = useState(false)
  const [err, setErr] = useState('')
  const [paidEmail, setPaidEmail] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const details = useMemo<Details>(() => d ?? { ...EMPTY, ...(data?.prefill ?? {}), links: (data?.prefill?.links as LinkItem[] | undefined) ?? [] }, [d, data])
  const set = <K extends keyof Details>(k: K, v: Details[K]) => setD({ ...details, [k]: v })
  const program = data?.programs.find((x) => x.id === (programId ?? (data.programs.length === 1 ? data.programs[0].id : null)))
  const bad = missing(details)
  const payload = useMemo(() => ({ ...details, links: details.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || 'Link', url: l.url.trim() })) }), [details])

  if (error)
    return (
      <Shell>
        <Card className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Link not found</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">{error}</p>
        </Card>
      </Shell>
    )
  if (!data)
    return (
      <Shell>
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        </div>
      </Shell>
    )

  if (paidEmail)
    return (
      <Shell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h1 className="mt-3 text-xl font-semibold">Welcome aboard!</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {pending ? (
              <>
                PayPal approved your subscription to <b className="text-foreground">{program?.name}</b> and is collecting the first payment. Your sign-in details will be emailed to <b className="text-foreground">{paidEmail}</b> within a few minutes.
              </>
            ) : (
              <>
                Your payment for <b className="text-foreground">{program?.name}</b> was received and {data.coach.name} has been notified. We emailed your sign-in details to <b className="text-foreground">{paidEmail}</b>. You will choose your own password the first time you sign in.
              </>
            )}
            {program?.billingType === 'SUBSCRIPTION' ? ` It renews automatically every ${program.durationWeeks} weeks; you can cancel anytime in your PayPal account.` : ''}
          </p>
          <Button asChild className="mt-5">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </Card>
      </Shell>
    )

  const field = (k: keyof Details, label: string, opts: { type?: string; placeholder?: string; required?: boolean } = {}) => {
    const invalid = touched && bad.includes(k)
    return (
      <div className="grid gap-1.5">
        <Label>
          {label}
          {opts.required ? <span className="text-danger"> *</span> : null}
        </Label>
        <Input type={opts.type ?? 'text'} value={details[k] as string} placeholder={opts.placeholder} aria-invalid={invalid} className={cn(invalid && 'border-danger')} onChange={(e) => set(k, e.target.value)} onBlur={() => setTouched(true)} />
      </div>
    )
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-3">
        <Avatar name={data.coach.name} color={data.coach.avatarColor} size={52} />
        <div>
          <div className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Coaching with</div>
          <h1 className="text-xl font-semibold tracking-tight">{data.coach.name}</h1>
          {data.coach.title ? <p className="text-[13px] text-muted-foreground">{data.coach.title}</p> : null}
        </div>
      </div>

      {!data.programs.length ? (
        <Card className="p-8 text-center text-[14px] text-muted-foreground">{data.coach.name} has no programs open for sign-up right now. Please contact them directly.</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="grid content-start gap-6">
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">1. Choose your program</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.programs.map((x) => {
                  const active = program?.id === x.id
                  return (
                    <button
                      key={x.id}
                      onClick={() => setProgramId(x.id)}
                      aria-pressed={active}
                      className={cn('flex flex-col rounded-xl border bg-card p-4 text-left transition cursor-pointer hover:border-foreground/30', active && 'border-ai ring-2 ring-ai/25')}
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-1 text-[14.5px] font-semibold">{x.name}</span>
                        <span className="text-[15px] font-semibold tabular-nums">{usd(x.priceCents)}</span>
                      </div>
                      <span className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Clock className="size-3" /> {x.durationWeeks} weeks
                        {x.billingType === 'SUBSCRIPTION' ? (
                          <Badge variant="ai" className="ml-1">
                            <RefreshCw /> Renews every {x.durationWeeks} weeks
                          </Badge>
                        ) : null}
                      </span>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{x.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {x.focusAreas.map((f) => (
                          <Badge key={f} variant="outline">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-[15px] font-semibold">2. Your details</h2>
              <Card className="grid gap-3 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('name', 'Full name', { required: true })}
                  {field('email', 'Email', { type: 'email', required: true, placeholder: 'Your sign-in email' })}
                  {field('company', 'Company', { required: true })}
                  {field('role', 'Role', { required: true, placeholder: 'e.g. Founder & CEO' })}
                  {field('location', 'Location', { required: true, placeholder: 'City, country' })}
                  {field('phone', 'Phone')}
                  {field('industry', 'Industry')}
                  {field('companySize', 'Company size', { placeholder: 'e.g. 50 employees' })}
                </div>
                <div className="grid gap-1.5">
                  <Label>Links (LinkedIn, website)</Label>
                  {details.links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Input className="w-32" placeholder="Label" value={l.label} onChange={(e) => set('links', details.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <Input placeholder="https://…" value={l.url} onChange={(e) => set('links', details.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                      <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => set('links', details.links.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {details.links.length < 10 ? (
                    <Button variant="outline" size="sm" className="justify-self-start" onClick={() => set('links', [...details.links, { label: '', url: '' }])}>
                      <Plus /> Add link
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label>What do you want from coaching? (optional)</Label>
                  <Textarea rows={3} value={details.goals} onChange={(e) => set('goals', e.target.value)} placeholder="Your goals, in a sentence or two. Only your coach sees this." />
                </div>
              </Card>
            </section>
          </div>

          <aside ref={payRef} className="scroll-mt-6 lg:sticky lg:top-6 lg:self-start">
            <Card className={cn('grid gap-4 p-5 transition-shadow', flashPay && 'ring-2 ring-ai/50')}>
              <h2 className="text-[15px] font-semibold">3. Pay and start</h2>
              {program ? (
                <div className="grid gap-1 text-[13px]">
                  <div className="flex justify-between">
                    <span>{program.name}</span>
                    <span className="tabular-nums">{usd(program.priceCents)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{program.durationWeeks} weeks with {data.coach.name}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                    <span>{program.billingType === 'SUBSCRIPTION' ? 'Due today (USD)' : 'Total (USD)'}</span>
                    <span className="tabular-nums">{usd(program.priceCents)}</span>
                  </div>
                  {program.billingType === 'SUBSCRIPTION' ? (
                    <p className="mt-1 rounded-lg bg-ai-soft px-3 py-2 text-[12px] leading-relaxed text-ai">
                      Auto-renews: PayPal charges {usd(program.priceCents)} again every {program.durationWeeks} weeks, at the end of each term, until you cancel. Cancel anytime in your PayPal account.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">Choose a program to see the total.</p>
              )}
              {touched && bad.length ? <p className="text-[12.5px] text-danger">Please fill in: {bad.map((k) => ({ name: 'full name', email: 'a valid email', company: 'company', role: 'role', location: 'location' })[k as string] ?? k).join(', ')}.</p> : null}
              {err ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{err}</p> : null}
              {!data.paypal.configured || !data.paypal.clientId ? (
                <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">Online payment isn’t set up yet. Please contact {data.coach.name} to join.</p>
              ) : program ? (
                <div onPointerDownCapture={() => setTouched(true)}>
                  <PayPalScriptProvider key={program.billingType} options={program.billingType === 'SUBSCRIPTION' ? { clientId: data.paypal.clientId, vault: true, intent: 'subscription' } : { clientId: data.paypal.clientId, currency: 'USD', intent: 'capture' }}>
                    <PayButtons token={token} programId={program.id} subscription={program.billingType === 'SUBSCRIPTION'} details={payload} prospectId={data.prefill?.prospectId} chatId={chatId} disabled={bad.length > 0} onPaid={(email, p) => {
                      setPending(!!p)
                      setPaidEmail(email)
                    }} onError={setErr} />
                  </PayPalScriptProvider>
                </div>
              ) : null}
              <div className="grid gap-1.5 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> Paid securely through PayPal. We never see your card.
                </span>
                <span className="flex items-center gap-1.5">
                  <CreditCard className="size-3.5" /> Your account is created right after payment.
                </span>
                {data.paypal.env === 'sandbox' && data.paypal.configured ? <Badge variant="warning" className="justify-self-start">PayPal sandbox: test payments only</Badge> : null}
              </div>
            </Card>
          </aside>
        </div>
      )}
      {data.assistant?.enabled && data.programs.length ? (
        <IntakeAssistant
          token={token}
          coachName={data.coach.name}
          programs={data.programs}
          prospectId={data.prefill?.prospectId}
          firstName={data.prefill?.name?.split(' ')[0]}
          selectedProgramId={program?.id ?? null}
          onSelectProgram={setProgramId}
          onChatId={setChatId}
          onGoToPayment={() => {
            payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setFlashPay(true)
            setTimeout(() => setFlashPay(false), 1600)
          }}
        />
      ) : null}
    </Shell>
  )
}
