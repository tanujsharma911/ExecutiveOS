import { BookOpenCheck, Plus } from 'lucide-react'
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
import { api, useApi } from '@/lib/api'
import { useUi } from '@/store/ui'

interface Program {
  id: string
  name: string
  description: string
  durationWeeks: number
  focusAreas: string[]
  status: string
  clients: { id: string; startDate: string; user: { name: string; avatarColor: string } }[]
}

export default function Programs() {
  const { data } = useApi<Program[]>('/coach/programs')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', durationWeeks: 12, focusAreas: '' })
  const bump = useUi((s) => s.bump)
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Coaching Programs"
        description="The structured engagements your clients are enrolled in."
        actions={
          <Button onClick={() => setOpen(true)}>
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
            </div>
            <h3 className="mt-3 text-[15px] font-semibold">{p.name}</h3>
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
          <DialogHeader title="New coaching program" />
          <DialogBody className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Duration (weeks)</Label>
                <Input type="number" value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: Number(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
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
              disabled={form.name.length < 2}
              onClick={async () => {
                await api('/coach/programs', { method: 'POST', json: { ...form, focusAreas: form.focusAreas.split(',').map((x) => x.trim()).filter(Boolean) } })
                toast.success('Program created')
                setOpen(false)
                bump()
              }}
            >
              Create program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
