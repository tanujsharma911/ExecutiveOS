import { ExternalLink, KeyRound, Link2, MapPin, Phone, Plus, Save, Sparkles, Trash2, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/Page'
import { ClientBillingCard } from '@/components/features/Billing'
import { IntakeLinkCard, PaymentPoliciesCard } from '@/components/features/Prospects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import { useAuth, type SessionUser } from '@/store/auth'

interface ProfileLink {
  label: string
  url: string
}
interface ContactForm {
  phone: string
  location: string
  links: ProfileLink[]
}

const MAX_LINKS = 10
const isWebUrl = (u: string) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u.trim())
/** "linkedin.com/in/x" → "https://linkedin.com/in/x" */
const withScheme = (u: string) => (u.trim() && !/^[a-z][a-z\d+.-]*:\/\//i.test(u.trim()) ? `https://${u.trim()}` : u.trim())
const linkHost = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/** Client-only: phone, location and any number of links (LinkedIn, company site, talks…). */
function ContactAndLinks() {
  const { data, error } = useApi<{ phone: string | null; location: string; links: ProfileLink[] | null }>('/client/profile')
  const [saved, setSaved] = useState<ContactForm | null>(null)
  const [form, setForm] = useState<ContactForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    const f = { phone: data.phone ?? '', location: data.location, links: data.links ?? [] }
    setSaved(f)
    setForm(f)
  }, [data])

  if (error) return null
  if (!form || !saved) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Contact & links
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </CardContent>
      </Card>
    )
  }

  const setLink = (i: number, patch: Partial<ProfileLink>) => setForm({ ...form, links: form.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const linkErrors = form.links.map((l) => (!l.label.trim() ? 'Add a name' : !isWebUrl(l.url) ? 'Enter a full web address, e.g. https://linkedin.com/in/you' : null))
  const invalid = !form.location.trim() || linkErrors.some(Boolean)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const save = async () => {
    setSaving(true)
    try {
      const r = await api<{ phone: string | null; location: string; links: ProfileLink[] }>('/client/profile', {
        method: 'PATCH',
        json: { phone: form.phone, location: form.location, links: form.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })) },
      })
      const f = { phone: r.phone ?? '', location: r.location, links: r.links ?? [] }
      setSaved(f)
      setForm(f)
      toast.success('Contact details saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Contact & links
          </CardTitle>
          <CardDescription>Your contact details, plus any links about you or your business — LinkedIn, your website, a talk, anything.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <Phone className="size-3.5" /> Phone
            </Label>
            <Input value={form.phone} placeholder="+1 (555) 555-0100" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Location
            </Label>
            <Input value={form.location} placeholder="City, State" onChange={(e) => setForm({ ...form, location: e.target.value })} />
            {!form.location.trim() ? <span className="text-[11.5px] text-danger">Location is required</span> : null}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Links</Label>
          {!form.links.length ? <p className="text-[12.5px] text-muted-foreground">No links yet — add your LinkedIn, company website, a talk or anything else.</p> : null}
          {form.links.map((l, i) => (
            <div key={i} className="grid gap-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input className="sm:w-48" value={l.label} placeholder="Name, e.g. LinkedIn" aria-label={`Link ${i + 1} name`} onChange={(e) => setLink(i, { label: e.target.value })} />
                <Input
                  className="flex-1"
                  value={l.url}
                  placeholder="https://…"
                  aria-label={`Link ${i + 1} address`}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                  onBlur={(e) => setLink(i, { url: withScheme(e.target.value) })}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild disabled={!isWebUrl(l.url)} aria-label="Open link">
                    <a href={isWebUrl(l.url) ? l.url : undefined} target="_blank" rel="noopener noreferrer" className={isWebUrl(l.url) ? '' : 'pointer-events-none opacity-40'}>
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => setForm({ ...form, links: form.links.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {linkErrors[i] && (l.label || l.url) ? <span className="text-[11.5px] text-danger">{linkErrors[i]}</span> : null}
              {!linkErrors[i] ? <span className="text-[11.5px] text-muted-foreground">{linkHost(l.url)}</span> : null}
            </div>
          ))}
          <Button variant="outline" size="sm" className="justify-self-start" disabled={form.links.length >= MAX_LINKS} onClick={() => setForm({ ...form, links: [...form.links, { label: '', url: '' }] })}>
            <Plus /> Add link
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!dirty || invalid || saving}>
            <Save /> {saving ? 'Saving…' : 'Save contact & links'}
          </Button>
          {dirty ? (
            <Button variant="ghost" onClick={() => setForm(saved)} disabled={saving}>
              Discard changes
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const user = useAuth((s) => s.user)!
  const ai = useAuth((s) => s.ai)
  const setUser = useAuth((s) => s.setUser)
  const [name, setName] = useState(user.name)
  const [title, setTitle] = useState(user.title ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Your profile and account." />
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" /> Profile
              </CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
            <Avatar name={user.name} color={user.avatarColor} size={40} />
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <Button
              className="justify-self-start"
              onClick={async () => {
                const r = await api<{ user: SessionUser }>('/auth/me', { method: 'PATCH', json: { name, title } })
                setUser(r.user)
                toast.success('Profile updated')
              }}
            >
              <Save /> Save profile
            </Button>
          </CardContent>
        </Card>
        {user.role === 'CLIENT' ? <ClientBillingCard /> : null}
        {user.role === 'CLIENT' ? <ContactAndLinks /> : null}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Password
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Current password</Label>
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>New password (8+ characters)</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={!pw.current || pw.next.length < 8}
              onClick={async () => {
                try {
                  await api('/auth/password', { method: 'POST', json: pw })
                  toast.success('Password changed')
                  setPw({ current: '', next: '' })
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              Change password
            </Button>
          </CardContent>
        </Card>
        {user.role === 'COACH' ? <IntakeLinkCard /> : null}
        {user.role === 'COACH' ? <PaymentPoliciesCard /> : null}
        {user.role === 'COACH' ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-ai" /> AI assistant
                </CardTitle>
                <CardDescription>Configured on the server via environment variables.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 text-[13px]">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">{ai?.mode === 'llm' ? 'Live LLM' : ai?.mode === 'deterministic' ? 'Deterministic analyst (no LLM key)' : 'Unavailable'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono text-[12px]">{ai?.model}</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Insights are always computed by evidence-grounded LangChain tools over your clients' own words. In live mode, Gemini orchestrates the tools and writes the briefing narrative, with Groq as an automatic fallback.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
