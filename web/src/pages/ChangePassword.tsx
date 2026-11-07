/** Shown instead of the app until a client replaces the temporary password from their welcome email. */
import { KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAuth, type SessionUser } from '@/store/auth'

export default function ChangePassword() {
  const user = useAuth((s) => s.user)!
  const [pw, setPw] = useState({ next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const error = pw.next && pw.next.length < 8 ? 'Use at least 8 characters' : pw.confirm && pw.confirm !== pw.next ? 'The passwords don’t match' : ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (error || !pw.next || pw.next !== pw.confirm) return
    setSaving(true)
    try {
      const r = await api<{ user: SessionUser }>('/auth/password', { method: 'POST', json: { next: pw.next } })
      useAuth.getState().setUser(r.user)
      toast.success('Password updated. Welcome to ExecutiveOS!')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-ai-soft text-ai">
          <KeyRound className="size-5" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Choose your password</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">Hi {user.name.split(' ')[0]}, you signed in with a temporary password. For your security, choose your own before you continue.</p>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <div className="grid gap-1.5">
            <Label>New password</Label>
            <Input type="password" autoComplete="new-password" autoFocus value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Confirm new password</Label>
            <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
          {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
          <Button type="submit" disabled={saving || !!error || !pw.next || pw.next !== pw.confirm}>
            Save and continue
          </Button>
        </form>
        <button className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => useAuth.getState().logout()}>
          <LogOut className="size-3.5" /> Sign out
        </button>
      </Card>
    </div>
  )
}
