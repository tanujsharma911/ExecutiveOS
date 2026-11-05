import type { IntelligenceReport } from './intelligence.js'

export interface ClientAlert {
  id: string
  severity: 'high' | 'medium' | 'info'
  kind: 'pattern' | 'confidence' | 'commitments' | 'engagement' | 'contradiction'
  message: string
  detail?: string
  insightId?: string
}

export function engagementOf(lastWeeklyAt: string | null, now = Date.now()): { status: 'Active' | 'Slipping' | 'At risk'; daysSince: number | null } {
  if (!lastWeeklyAt) return { status: 'At risk', daysSince: null }
  const days = Math.floor((now - Date.parse(lastWeeklyAt)) / 86_400_000)
  return { status: days <= 8 ? 'Active' : days <= 13 ? 'Slipping' : 'At risk', daysSince: days }
}

export function buildAlerts(r: IntelligenceReport): ClientAlert[] {
  const alerts: ClientAlert[] = []
  const first = r.firstName ?? r.clientName.split(' ')[0]
  const top = r.recurring[0]
  if (top) {
    alerts.push({
      id: `alert:${top.id}`,
      severity: top.confidence === 'High' ? 'high' : 'medium',
      kind: 'pattern',
      message: `${top.title.replace(' pattern detected', '')} has appeared in ${top.stats?.mentions} reflections over the past ${top.stats?.weeks} weeks.`,
      detail: top.hypothesis,
      insightId: top.id,
    })
  }
  const conf = r.emotional.series.find((s) => s.key === 'confidence')
  if (conf && conf.delta !== null && conf.delta <= -1) {
    alerts.push({ id: 'alert:confidence', severity: 'high', kind: 'confidence', message: `${first}'s leadership confidence decreased from ${conf.first} to ${conf.last}.`, detail: 'Self-reported in weekly reflections.', insightId: 'emotional:confidence' })
  }
  const incomplete = r.commitments.summary.overdue
  if (incomplete >= 2) {
    const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']
    alerts.push({
      id: 'alert:commitments',
      severity: incomplete >= 3 ? 'high' : 'medium',
      kind: 'commitments',
      message: `${words[incomplete] ?? incomplete} commitments remain incomplete past their due date.`,
      detail: r.commitments.insights[0]?.summary,
      insightId: r.commitments.insights[0]?.id,
    })
  }
  const eng = engagementOf(r.overview.lastWeeklyAt)
  if (eng.daysSince === null || eng.daysSince >= 10) {
    alerts.push({
      id: 'alert:engagement',
      severity: 'high',
      kind: 'engagement',
      message: eng.daysSince === null ? `${first} has not submitted a weekly reflection yet.` : `${first} has not submitted a weekly reflection for ${eng.daysSince} days.`,
    })
  }
  const c = r.contradictions[0]
  if (c && c.confidence !== 'Low') {
    alerts.push({ id: `alert:${c.id}`, severity: 'medium', kind: 'contradiction', message: `Possible contradiction between stated intention and recent behaviour (${c.title.split(': ')[1] ?? 'see insight'}).`, detail: c.facts[1], insightId: c.id })
  }
  return alerts
}
