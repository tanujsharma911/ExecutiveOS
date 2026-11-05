import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import ClientCommitments from '@/pages/client/Commitments'
import ClientDashboard from '@/pages/client/Dashboard'
import FormFill from '@/pages/client/FormFill'
import ClientGrowth from '@/pages/client/Growth'
import Reflections from '@/pages/client/Reflections'
import ClientSessions from '@/pages/client/Sessions'
import ClientWorkspace from '@/pages/coach/ClientWorkspace'
import Clients from '@/pages/coach/Clients'
import CoachCommitments from '@/pages/coach/Commitments'
import FormEditor from '@/pages/coach/FormEditor'
import Forms from '@/pages/coach/Forms'
import Intelligence from '@/pages/coach/Intelligence'
import Overview from '@/pages/coach/Overview'
import Programs from '@/pages/coach/Programs'
import SessionPrep from '@/pages/coach/SessionPrep'
import Sessions from '@/pages/coach/Sessions'
import Login from '@/pages/Login'
import SettingsPage from '@/pages/Settings'
import { useAuth, type SessionUser } from '@/store/auth'

function RequireRole({ role, children }: { role: 'COACH' | 'CLIENT'; children: React.ReactNode }) {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={user.role === 'COACH' ? '/coach' : '/client'} replace />
  return <>{children}</>
}

function Home() {
  const user = useAuth((s) => s.user)
  return <Navigate to={!user ? '/login' : user.role === 'COACH' ? '/coach' : '/client'} replace />
}

export default function App() {
  const token = useAuth((s) => s.token)
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    api<{ user: SessionUser; ai: { mode: string; model: string } }>('/auth/me', { signal: controller.signal })
      .then((r) => {
        useAuth.getState().setUser(r.user)
        useAuth.getState().setAi(r.ai)
      })
      .catch(() => undefined) // aborted or offline: keep the persisted session
    return () => controller.abort()
  }, [token])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route
        path="/coach"
        element={
          <RequireRole role="COACH">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<Overview />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientWorkspace />} />
        <Route path="programs" element={<Programs />} />
        <Route path="forms" element={<Forms />} />
        <Route path="forms/new" element={<FormEditor />} />
        <Route path="forms/:id" element={<FormEditor />} />
        <Route path="intelligence" element={<Intelligence />} />
        <Route path="commitments" element={<CoachCommitments />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/:id/prep" element={<SessionPrep />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="/client"
        element={
          <RequireRole role="CLIENT">
            <AppShell />
          </RequireRole>
        }
      >
        <Route index element={<ClientDashboard />} />
        <Route path="reflections/:freq" element={<Reflections />} />
        <Route path="forms/:formId" element={<FormFill />} />
        <Route path="commitments" element={<ClientCommitments />} />
        <Route path="growth" element={<ClientGrowth />} />
        <Route path="sessions" element={<ClientSessions />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
