import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface NotificationEmailProps {
  title?: string
  message?: string
  actionUrl?: string
  actionLabel?: string
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
  fontSize: '24px',
  fontWeight: 800 as const,
  color: '#111111',
  margin: '0 0 12px',
  textTransform: 'uppercase' as const,
}
const text = { fontSize: '15px', lineHeight: '24px', color: '#333333' }
const button = {
  display: 'inline-block',
  backgroundColor: '#E10600',
  color: '#ffffff',
  padding: '12px 22px',
  fontSize: '13px',
  fontWeight: 700 as const,
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#777777', marginTop: '28px' }

const NotificationEmail = ({
  title = 'New activity on Pit Call',
  message = 'You have a new notification on Pit Call.',
  actionUrl = 'https://pitcall.net/dashboard/notifications',
  actionLabel = 'Open Pit Call',
}: NotificationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{message}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={bar} />
        <Text style={brand}>Pit Call</Text>
        <Heading style={heading}>{title}</Heading>
        <Text style={text}>{message}</Text>
        <Section style={{ marginTop: '24px' }}>
          <Link href={actionUrl} style={button}>
            {actionLabel}
          </Link>
        </Section>
        <Text style={footer}>
          You are receiving this email because of activity on your Pit Call account.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NotificationEmail,
  subject: (data: Record<string, any>) => `Pit Call — ${data['title'] ?? 'New activity'}`,
  displayName: 'System notification',
  previewData: {
    title: 'New match proposed',
    message: 'A team proposed a match for one of your available dates.',
    actionUrl: 'https://pitcall.net/dashboard/engagements',
    actionLabel: 'View engagement',
  },
} satisfies TemplateEntry
