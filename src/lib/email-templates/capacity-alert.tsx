import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface CapacityAlertProps {
  level?: string
  freelancers?: number
  activePitCalls?: number
  workloadIndex?: number
  teams?: number
  drivers?: string
  thresholds?: string
  action?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const bar = { height: '4px', backgroundColor: '#E10600', marginBottom: '24px' }
const brand = {
  fontSize: '12px',
  letterSpacing: '3px',
  textTransform: 'uppercase' as const,
  color: '#111111',
  fontWeight: 700 as const,
  margin: '0 0 8px',
}
const heading = {
  fontSize: '22px',
  fontWeight: 800 as const,
  color: '#111111',
  margin: '0 0 12px',
  textTransform: 'uppercase' as const,
}
const text = { fontSize: '15px', lineHeight: '24px', color: '#333333' }
const mono = { fontSize: '14px', lineHeight: '22px', color: '#111111', fontFamily: 'monospace' }
const footer = { fontSize: '12px', color: '#777777', marginTop: '28px' }

const CapacityAlertEmail = ({
  level = 'CHECK CAPACITY',
  freelancers = 0,
  activePitCalls = 0,
  workloadIndex = 0,
  teams = 0,
  drivers = '—',
  thresholds = '—',
  action = 'Run a manual db_health check and review Lovable Cloud usage when possible.',
}: CapacityAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`PITCALL capacity level is now ${level}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={bar} />
        <Text style={brand}>Pit Call · Platform Capacity</Text>
        <Heading style={heading}>{level}</Heading>
        <Text style={text}>The LIVE platform capacity level changed.</Text>
        <Text style={mono}>
          Overall level: {level}
          <br />
          Total Freelancers: {freelancers}
          <br />
          Active Pit Calls: {activePitCalls}
          <br />
          Workload Index: {workloadIndex}
          <br />
          Total Teams (context): {teams}
          <br />
          Triggered by: {drivers}
          <br />
          Relevant thresholds: {thresholds}
        </Text>
        <Text style={text}>{action}</Text>
        <Text style={footer}>
          This is an early operational warning, not an infrastructure failure alert.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CapacityAlertEmail,
  subject: (data: Record<string, any>) =>
    `PITCALL Capacity Warning — ${data['level'] ?? 'CHECK CAPACITY'}`,
  displayName: 'Platform capacity warning',
  to: 'info@pitcall.net',
  previewData: {
    level: 'CHECK CAPACITY',
    freelancers: 1024,
    activePitCalls: 12,
    workloadIndex: 12288,
    teams: 210,
    drivers: 'Total Freelancers',
    thresholds: 'Freelancers >= 1000',
    action: 'Run a manual db_health check and review Lovable Cloud usage when possible.',
  },
} satisfies TemplateEntry
