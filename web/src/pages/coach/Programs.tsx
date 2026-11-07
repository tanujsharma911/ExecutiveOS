import { BookOpenCheck, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loading, PageHeader } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/tabs'
import { api, useApi } from '@/lib/api'
import { usd } from '@/lib/discovery'
import { useUi } from '@/store/ui'

interface Program {
  id: string
  name: string
  description: string
  durationWeeks: number
  focusAreas: string[]
  included: string
  priceCents: number
  billingType: 'ONE_TIME' | 'SUBSCRIPTION'
  status: string
  clients: { id: string; startDate: string; user: { name: string; avatarColor: string } }[]
}

export default function Programs() {
  const { data } = useApi<Program[]>('/coach/programs')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [form, setForm] = useState({ name: '', description: '', durationWeeks: 12, focusAreas: '', included: '', price: '', billingType: 'ONE_TIME' as Program['billingType'] })
  const openNew = () => {
    setEditing(null)
    setForm({ name: '', description: '', durationWeeks: 12, focusAreas: '', included: '', price: '', billingType: 'ONE_TIME' })
    setOpen(true)
  }
  const openEdit = (p: Program) => {
    setEditing(p)
    setForm({ name: p.name, description: p.description, durationWeeks: p.durationWeeks, focusAreas: p.focusAreas.join(', '), included: p.included ?? '', price: p.priceCents ? String(p.priceCents / 100) : '', billingType: p.billingType })
    setOpen(true)
  }
  const priceCents = Math.round(Number(form.price || 0) * 100)
  const priceValid = Number.isFinite(priceCents) && priceCents >= 0
  const termError = form.billingType === 'SUBSCRIPTION' && form.durationWeeks > 52 ? 'Auto-renewing programs can be at most 52 weeks (a PayPal limit).' : ''
  const bump = useUi((s) => s.bump)
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Coaching Programs"
        description="The structured engagements your clients are enrolled in."
        actions={
          <Button onClick={openNew}>
            <Plus /> New program
          </Button>
        }
      />
      {!data ? <Loading /> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <BookOpenCheck className="size-4" />
              </span>
              <Badge variant={p.status === 'ACTIVE' ? 'success' : 'outline'}>{p.status === 'ACTIVE' ? 'Active' : p.status}</Badge>
              <span className="ml-auto text-[12px] text-muted-foreground">{p.durationWeeks} weeks</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
                <Pencil />
              </Button>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <h3 className="flex-1 text-[15px] font-semibold">{p.name}</h3>
              {p.priceCents ? <span className="text-[14px] font-semibold tabular-nums">{usd(p.priceCents)}</span> : <span className="text-[12px] text-muted-foreground">No price</span>}
            </div>
            {p.priceCents ? (
              <div className="mt-1 text-[12px] text-muted-foreground">
                {p.billingType === 'SUBSCRIPTION' ? (
                  <Badge variant="ai">
                    <RefreshCw /> Auto-renews every {p.durationWeeks} weeks
                  </Badge>
                ) : (
                  'One-time payment'
                )}
              </div>
            ) : null}
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.focusAreas.map((f) => (
                <Badge key={f} variant="outline">
                  {f}
                </Badge>
              ))}
            </div>
            <div className="mt-auto pt-5">
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Enrolled</div>
              {p.clients.map((c) => {
                const week = Math.ceil((Date.now() - new Date(c.startDate).getTime()) / (7 * 86_400_000))
                return (
                  <button key={c.id} onClick={() => navigate(`/coach/clients/${c.id}`)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted cursor-pointer">
                    <Avatar name={c.user.name} color={c.user.avatarColor} size={26} />
                    <span className="flex-1 text-[13px]">{c.user.name}</span>
                    <span className="text-[12px] text-muted-foreground">
                      Week {week} / {p.durationWeeks}
                    </span>
                  </button>
                )
              })}
              {!p.clients.length ? <p className="text-[12.5px] text-muted-foreground">No clients enrolled yet.</p> : null}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader title={editing ? 'Edit program' : 'New coaching program'} description="Programs with a price appear on your intake form, where new clients pay with PayPal." />
          <DialogBody className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>What's included</Label>
              <Textarea rows={2} value={form.included} placeholder="e.g. Fortnightly 60-minute sessions, weekly reflections with AI insights, email support" onChange={(e) => setForm({ ...form, included: e.target.value })} />
              <p className="text-[12px] text-muted-foreground">The AI assistant on your intake form uses this to answer “what do I get?”.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Payment on the intake form</Label>
              <Segmented
                value={form.billingType}
                onChange={(billingType) => setForm({ ...form, billingType })}
                options={[
                  { value: 'ONE_TIME', label: 'One-time payment' },
                  { value: 'SUBSCRIPTION', label: 'Auto-renew each term' },
                ]}
              />
              <p className="text-[12px] text-muted-foreground">
                {form.billingType === 'SUBSCRIPTION'
                  ? `PayPal charges the price on the intake form, then again every ${form.durationWeeks || 'N'} weeks until cancelled. If a renewal fails, PayPal retries up to 3 times; you and the client are notified each time, and after the third failure the client becomes inactive (read-only).`
                  : 'The client pays the price once on the intake form.'}
              </p>
              {termError ? <p className="text-[12px] text-danger">{termError}</p> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Price (USD){form.billingType === 'SUBSCRIPTION' ? ' per term' : ''}</Label>
                <Input type="number" min={0} step="0.01" placeholder="0 = not on intake form" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Duration (weeks)</Label>
                <Input type="number" value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: Number(e.target.value) })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Focus areas (comma separated)</Label>
                <Input value={form.focusAreas} onChange={(e) => setForm({ ...form, focusAreas: e.target.value })} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={form.name.length < 2 || !priceValid || !!termError}
              onClick={async () => {
                const json = { name: form.name, description: form.description, included: form.included, durationWeeks: form.durationWeeks, priceCents, billingType: form.billingType, focusAreas: form.focusAreas.split(',').map((x) => x.trim()).filter(Boolean) }
                try {
                  await api(editing ? `/coach/programs/${editing.id}` : '/coach/programs', { method: editing ? 'PATCH' : 'POST', json })
                } catch (e) {
                  toast.error((e as Error).message)
                  return
                }
                toast.success(editing ? 'Program updated' : 'Program created')
                setOpen(false)
                bump()
              }}
            >
              {editing ? 'Save changes' : 'Create program'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
