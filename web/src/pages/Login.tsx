import { ArrowRight, Loader2, Quote, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { api, isAbortError } from '@/lib/api'
import { useAuth, type SessionUser } from '@/store/auth'

interface DemoAccount {
  email: string
  name: string
  role: 'COACH' | 'CLIENT'
  title: string | null
  avatarColor: string
}

export default function Login() {
  const user = useAuth((s) => s.user)
  const setSession = useAuth((s) => s.setSession)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState<DemoAccount[]>([])

  useEffect(() => {
    const controller = new AbortController()
    api<DemoAccount[]>('/demo-accounts', { signal: controller.signal })
      .then(setDemo)
      .catch((e) => !isAbortError(e) && setDemo([]))
    return () => controller.abort()
  }, [])

  if (user) return <Navigate to={user.role === 'COACH' ? '/coach' : '/client'} replace />

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ token: string; user: SessionUser }>('/auth/login', { method: 'POST', json: creds ?? { email, password } })
      setSession(r.token, r.user)
      navigate(r.user.role === 'COACH' ? '/coach' : '/client')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#141416] p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-7 invert-0" />
          <span className="text-[16px] font-semibold tracking-tight">ExecutiveOS</span>
        </div>
        <div className="max-w-lg">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[12px] text-white/70">
            <Sparkles className="size-3 text-[#a5a6f6]" /> Coaching intelligence, with the coach in charge
          </div>
          <h1 className="font-serif text-[40px] leading-[1.1] tracking-tight">Understand your clients more deeply than a single session allows.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">ExecutiveOS studies months of reflections, detects the patterns that matter, and hands you evidence — not verdicts — before every session.</p>
        </div>
        <figure className="max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#a5a6f6]">
            <Quote className="size-3" /> Delegation pattern · 13 reflections
          </div>
          <blockquote className="font-serif text-[18px] leading-snug text-white/90">“I ended up doing the board presentation myself after Omar's draft came in late.”</blockquote>
          <figcaption className="mt-3 text-[12px] text-white/50">Suggested question — “What would have to change for you to trust someone else with this responsibility?”</figcaption>
        </figure>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="size-7" />
              <span className="text-[16px] font-semibold">ExecutiveOS</span>
            </div>
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Use your coach or client account.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error ? <div className="rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</div> : null}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Sign in <ArrowRight />
            </Button>
          </form>

          {demo.length ? (
            <div className="mt-8">
              <div className="mb-2 flex items-center gap-3 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> Demo accounts <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-1.5">
                {demo.map((d) => {
                  const pw = d.role === 'COACH' ? 'Coach@2026' : 'Client@2026'
                  return (
                    <button
                      key={d.email}
                      onClick={() => {
                        setEmail(d.email)
                        setPassword(pw)
                        submit(undefined, { email: d.email, password: pw })
                      }}
                      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition hover:border-foreground/20 hover:bg-muted/40 cursor-pointer"
                    >
                      <Avatar name={d.name} color={d.avatarColor} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{d.name}</span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">{d.email}</span>
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{d.role === 'COACH' ? 'Coach' : 'Client'}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-center text-[11.5px] text-muted-foreground">Passwords: Coach@2026 · Client@2026</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
