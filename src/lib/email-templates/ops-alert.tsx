import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

// OPS-MON-02 — P0 operational alert (LIVE only). Fixed recipient, plain operational wording.
interface OpsAlertProps {
  kind?: 'open' | 'reminder' | 'recovered'
  checkKind?: string
  alertKey?: string
  detectedAt?: string
  summary?: string
  details?: string
  action?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const bar = (kind: string) => ({ height: '4px', backgroundColor: kind === 'recovered' ? '#1B7F3B' : '#E10600', marginBottom: '24px' })
const brand = { fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase' as const, color: '#111111', fontWeight: 700 as const, margin: '0 0 8px' }
const heading = { fontSize: '22px', fontWeight: 800 as const, color: '#111111', margin: '0 0 12px', textTransform: 'uppercase' as const }
const text = { fontSize: '15px', lineHeight: '24px', color: '#333333' }
const mono = { fontSize: '13px', lineHeight: '21px', color: '#111111', fontFamily: 'monospace', whiteSpace: 'pre-wrap' as const }
const footer = { fontSize: '12px', color: '#777777', marginTop: '28px' }

const TITLE: Record<string, string> = { open: 'Operational alert', reminder: 'Operational alert — still active', recovered: 'Operational alert — recovered' }

const OpsAlertEmail = ({
  kind = 'open',
  checkKind = 'unknown',
  alertKey = '—',
  detectedAt = '—',
  summary = '',
  details = '',
  action = 'Open the Admin Control Panel → Backup tab → Operational log export for the full timeline.',
}: OpsAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`PITCALL ${TITLE[kind] ?? 'Operational alert'} · ${checkKind}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={bar(kind)} />
        <Text style={brand}>Pit Call · LIVE operations</Text>
        <Heading style={heading}>{TITLE[kind] ?? 'Operational alert'}</Heading>
        <Text style={text}>{summary}</Text>
        <Text style={mono}>
          Check: {checkKind}
          {'\n'}Key: {alertKey}
          {'\n'}Detected at (UTC): {detectedAt}
          {details ? `\n\n${details}` : ''}
        </Text>
        <Text style={text}>{action}</Text>
        <Text style={footer}>Automated P0 health check (every 15 min). One e-mail per state change; reminders every 6 h while active. TEST environment never alerts.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OpsAlertEmail,
  subject: (data: Record<string, any>) => {
    const k = data['kind'] === 'recovered' ? 'RECOVERED' : data['kind'] === 'reminder' ? 'STILL ACTIVE' : 'ALERT'
    return `PITCALL LIVE ${k} — ${data['checkKind'] ?? 'operational'}`
  },
  displayName: 'Operational P0 alert',
  to: 'info@pitcall.net',
  previewData: {
    kind: 'open',
    checkKind: 'cron_health',
    alertKey: 'cron:dispatch-notification-emails',
    detectedAt: '2026-09-15 10:15:00',
    summary: 'Scheduled job "dispatch-notification-emails" has not run successfully for more than 2× its expected interval.',
    details: 'expected_interval_min: 1\nlast_success_at: 2026-09-15 09:40:00',
  },
} satisfies TemplateEntry
