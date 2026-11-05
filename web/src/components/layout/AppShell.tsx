import {
  Bell,
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  NotebookPen,
  Route,
  Settings,
  Sparkles,
  SquarePen,
  Users,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui/misc'
import { api, useApi } from '@/lib/api'
import type { Notification } from '@/lib/types'
import { cn, relative } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'

const COACH_NAV = [
  { to: '/coach', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/coach/clients', label: 'My Clients', icon: Users },
  { to: '/coach/programs', label: 'Coaching Programs', icon: BookOpenCheck },
  { to: '/coach/forms', label: 'Form Builder', icon: SquarePen },
  { to: '/coach/intelligence', label: 'AI Intelligence', icon: BrainCircuit, ai: true },
  { to: '/coach/commitments', label: 'Commitments', icon: ListChecks },
  { to: '/coach/sessions', label: 'Session History', icon: CalendarClock },
  { to: '/coach/settings', label: 'Settings', icon: Settings },
]

const CLIENT_NAV = [
  { to: '/client', label: 'My Dashboard', icon: LayoutDashboard, end: true },
  { to: '/client/reflections/daily', label: 'Daily Reflection', icon: NotebookPen },
  { to: '/client/reflections/weekly', label: 'Weekly Review', icon: CalendarDays },
  { to: '/client/reflections/monthly', label: 'Monthly Review', icon: CalendarRange },
  { to: '/client/commitments', label: 'My Commitments', icon: ClipboardList },
  { to: '/client/growth', label: 'My Growth Journey', icon: Route },
  { to: '/client/sessions', label: 'Session History', icon: CalendarClock },
  { to: '/client/settings', label: 'Settings', icon: Settings },
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2">
      <img src="/favicon.svg" alt="" className="size-6" />
      <span className="text-[15px] font-semibold tracking-tight">ExecutiveOS</span>
    </Link>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const nav = user.role === 'COACH' ? COACH_NAV : CLIENT_NAV
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <Logo />
      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{user.role === 'COACH' ? 'Coach workspace' : 'My leadership'}</div>
      <nav className="-mt-2 grid gap-0.5">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] font-medium text-foreground/70 transition-colors hover:bg-black/[0.04] hover:text-foreground',
                isActive && 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border',
              )
            }
          >
            <n.icon className={cn('size-4', 'ai' in n && n.ai ? 'text-ai' : 'text-foreground/50 group-hover:text-foreground/80')} />
            {n.label}
            {'ai' in n && n.ai ? <Sparkles className="ml-auto size-3 text-ai" /> : null}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto grid gap-2">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={user.name} color={user.avatarColor} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{user.name}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{user.title ?? user.email}</div>
          </div>
          <Tooltip content="Sign out">
            <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-black/5 hover:text-foreground cursor-pointer" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function Notifications() {
  const { data, reload } = useApi<Notification[]>('/notifications')
  const navigate = useNavigate()
  const location = useLocation()
  React.useEffect(() => {
    const t = setInterval(reload, 20_000)
    return () => clearInterval(t)
  }, [reload])
  // Refresh on navigation — but not on first render, where useApi has already fetched.
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    reload()
  }, [location.pathname, reload])
  const unread = data?.filter((n) => !n.read).length ?? 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer" aria-label="Notifications">
          <Bell className="size-[18px]" />
          {unread ? <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-ai text-[10px] font-semibold text-white">{unread}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-[13px] font-semibold">Notifications</span>
          {unread ? (
            <button className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => api('/notifications/read-all', { method: 'POST' }).then(reload)}>
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!data?.length ? <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">You're all caught up.</div> : null}
          {data?.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                api(`/notifications/${n.id}/read`, { method: 'POST' }).then(reload)
                if (n.link) navigate(n.link)
              }}
              className={cn('flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60 cursor-pointer', !n.read && 'bg-ai-soft/40')}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.kind === 'insight' ? 'bg-ai' : n.kind === 'alert' ? 'bg-danger' : 'bg-foreground/40')} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{n.body}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground/80">{relative(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AppShell() {
  const { mobileNav, setMobileNav } = useUi()
  const ai = useAuth((s) => s.ai)
  const user = useAuth((s) => s.user)!
  const location = useLocation()
  React.useEffect(() => setMobileNav(false), [location.pathname, setMobileNav])
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] border-r bg-sidebar lg:block">
        <Sidebar />
      </aside>
      {mobileNav ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] border-r bg-sidebar shadow-xl animate-rise">
            <button className="absolute right-2 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-black/5 cursor-pointer" onClick={() => setMobileNav(false)} aria-label="Close menu">
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <button className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden cursor-pointer" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Menu className="size-[18px]" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {user.role === 'COACH' && ai ? (
              <Tooltip content={ai.mode === 'llm' ? `Model chain: ${ai.model}` : ai.mode === 'deterministic' ? 'No LLM key set — using the deterministic analyst (DETERMINISTIC_FALLBACK=true).' : 'No GOOGLE_API_KEY or GROQ_API_KEY is set, and DETERMINISTIC_FALLBACK is false, so AI features are off.'}>
                <span className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground sm:inline-flex">
                  <span className={cn('size-1.5 rounded-full', ai.mode === 'llm' ? 'bg-success' : ai.mode === 'deterministic' ? 'bg-ai' : 'bg-danger')} />
                  AI · {ai.mode === 'llm' ? ai.model.split(' → ')[0] : ai.mode === 'deterministic' ? 'Deterministic analyst' : 'Unavailable'}
                </span>
              </Tooltip>
            ) : null}
            <Notifications />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
