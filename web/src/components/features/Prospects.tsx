import { Check, Copy, CreditCard, Link2, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Skeleton, Tooltip } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import { PROSPECT_STATUS, type IntakeInfo, type Link, type Prospect, type ProspectStatus } from '@/lib/discovery'

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const s = PROSPECT_STATUS[status]
  return (
    <Tooltip content={s.hint}>
      <span className="inline-flex">
        <Badge variant={s.variant}>{s.label}</Badge>
      </span>
    </Tooltip>
  )
}

type ProspectForm = { name: string; email: string; company: string; role: string; industry: string; companySize: string; location: string; phone: string; links: Link[]; notes: string }
const EMPTY: ProspectForm = { name: '', email: '', company: '', role: '', industry: '', companySize: '', location: '', phone: '', links: [], notes: '' }

/** Add or edit a prospect. */
export function ProspectDialog({ open, onOpenChange, prospect, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; prospect?: Prospect; onSaved: (p: Prospect) => void }) {
  const [f, setF] = useState<ProspectForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setF(prospect ? { ...EMPTY, ...prospect, email: prospect.email ?? '', phone: prospect.phone ?? '', links: prospect.links ?? [] } : EMPTY)
  }, [open, prospect])
  const set = <K extends keyof ProspectForm>(k: K, v: ProspectForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const field = (k: keyof ProspectForm, label: string, placeholder = '', type = 'text') => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={f[k] as string} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  )
  const save = async () => {
    setSaving(true)
    try {
      const json = { ...f, links: f.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || 'Link', url: l.url.trim() })) }
      const p = await api<Prospect>(prospect ? `/discovery/prospects/${prospect.id}` : '/discovery/prospects', { method: prospect ? 'PATCH' : 'POST', json })
      toast.success(prospect ? 'Prospect updated' : 'Prospect added')
      onOpenChange(false)
      onSaved(p)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader title={prospect ? 'Edit prospect' : 'Add prospect'} description="Someone you might coach. Links help the AI research them for their Discovery Call Book." />
        <DialogBody className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Name *', 'Jane Doe')}
            {field('email', 'Email', 'jane@company.com', 'email')}
            {field('company', 'Company')}
            {field('role', 'Role', 'Founder & CEO')}
            {field('industry', 'Industry')}
            {field('companySize', 'Company size', '50 employees')}
            {field('location', 'Location')}
            {field('phone', 'Phone')}
          </div>
          <div className="grid gap-1.5">
            <Label>Links (website, LinkedIn, articles)</Label>
            {f.links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-36" placeholder="Label" value={l.label} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input placeholder="https://…" value={l.url} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => set('links', f.links.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {f.links.length < 10 ? (
              <Button variant="outline" size="sm" className="justify-self-start" onClick={() => set('links', [...f.links, { label: '', url: '' }])}>
                <Plus /> Add link
              </Button>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={f.notes} placeholder="How you met, what they want, anything you already know" onChange={(e) => set('notes', e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={f.name.trim().length < 2 || saving} onClick={save}>
            {prospect ? 'Save changes' : 'Add prospect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string, msg = 'Copied') => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(msg)
    setTimeout(() => setCopied(false), 1500)
  }
  return { copied, copy }
}

/** The coach's reusable intake link (Settings and the Prospects page). */
export function IntakeLinkCard({ compact }: { compact?: boolean }) {
  const { data, setData } = useApi<IntakeInfo>('/discovery/intake')
  const { copied, copy } = useCopy()
  const offered = data?.programs.filter((p) => p.priceCents > 0) ?? []
  const rotate = async () => {
    if (!confirm('Create a new intake link? The old link will stop working.')) return
    const r = await api<{ token: string; url: string }>('/discovery/intake/rotate', { method: 'POST' })
    if (data) setData({ ...data, ...r })
    toast.success('New intake link created')
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Intake form link
          </CardTitle>
          {!compact ? <CardDescription>One link for everyone. New clients see your details, choose a program, enter their details and pay with PayPal. Their client account is then created for them.</CardDescription> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!data ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={data.url} onFocus={(e) => e.target.select()} className="font-mono text-[12px]" />
              <Button variant="outline" onClick={() => copy(data.url, 'Intake link copied')}>
                {copied ? <Check /> : <Copy />} Copy
              </Button>
              {!compact ? (
                <Tooltip content="Create a new link (the old one stops working)">
                  <Button variant="ghost" size="icon" aria-label="New link" onClick={rotate}>
                    <RefreshCw />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              <CreditCard className="size-3.5" />
              {data.paypal.configured ? <Badge variant="success">PayPal {data.paypal.env}</Badge> : <Badge variant="warning">PayPal not configured</Badge>}
              <Mail className="ml-2 size-3.5" />
              {data.emailConfigured ? <Badge variant="success">Email on</Badge> : <Badge variant="warning">Email not configured</Badge>}
              <span className="ml-2">
                {offered.length} of {data.programs.length} programs on the form{offered.length < data.programs.length ? ' (set a price on Coaching Programs to add the rest)' : ''}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** What the intake assistant may tell prospects about refunds and payment questions. */
export function PaymentPoliciesCard() {
  const { data } = useApi<{ refundPolicy: string; paymentContact: string }>('/discovery/policies')
  const [f, setF] = useState<{ refundPolicy: string; paymentContact: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (data) setF(data)
  }, [data])
  const dirty = !!f && !!data && (f.refundPolicy !== data.refundPolicy || f.paymentContact !== data.paymentContact)
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" /> Payment policies
          </CardTitle>
          <CardDescription>The AI assistant on your intake form quotes these when prospects ask. If a field is empty, it says it will check with you.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!f ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label>Refund policy</Label>
              <Textarea rows={2} maxLength={600} value={f.refundPolicy} placeholder="e.g. There are no refunds: all payments are final." onChange={(e) => setF({ ...f, refundPolicy: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contact for payment questions</Label>
              <Input maxLength={300} value={f.paymentContact} placeholder="e.g. Email billing@yourpractice.com" onChange={(e) => setF({ ...f, paymentContact: e.target.value })} />
            </div>
            <Button
              className="justify-self-start"
              disabled={!dirty || saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await api('/discovery/policies', { method: 'PATCH', json: f })
                  toast.success('Payment policies saved')
                } catch (e) {
                  toast.error((e as Error).message)
                } finally {
                  setSaving(false)
                }
              }}
            >
              Save policies
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
