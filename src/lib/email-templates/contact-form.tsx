import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface ContactFormEmailProps {
  name?: string
  email?: string
  userType?: string
  reasons?: string
  subject?: string
  message?: string
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
  margin: '0 0 18px',
  textTransform: 'uppercase' as const,
}
const label = {
  fontSize: '11px',
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  color: '#777777',
  margin: '0 0 4px',
}
const value = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#111111',
  margin: '0 0 16px',
}
const messageBox = {
  backgroundColor: '#f5f5f5',
  padding: '16px',
  borderRadius: '6px',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#333333',
  whiteSpace: 'pre-wrap' as const,
}
const footer = { fontSize: '12px', color: '#777777', marginTop: '28px' }

const ContactFormEmail = ({
  name = '',
  email = '',
  userType = '',
  reasons = '',
  subject = '',
  message = '',
}: ContactFormEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New message from {name} via PITCALL Contact form</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={bar} />
        <Text style={brand}>Pit Call</Text>
        <Heading style={heading}>Contact form message</Heading>

        <Text style={label}>Name</Text>
        <Text style={value}>{name}</Text>

        <Text style={label}>Email</Text>
        <Text style={value}>{email}</Text>

        <Text style={label}>User type</Text>
        <Text style={value}>{userType}</Text>

        <Text style={label}>Contact reason(s)</Text>
        <Text style={value}>{reasons}</Text>

        <Text style={label}>Subject</Text>
        <Text style={value}>{subject}</Text>

        <Text style={label}>Message</Text>
        <Section style={messageBox}>
          <Text style={{ ...value, margin: 0 }}>{message}</Text>
        </Section>

        <Text style={footer}>
          You are receiving this email because someone submitted the contact form on pitcall.net.
          Reply directly to this email to respond to the sender.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactFormEmail,
  subject: 'Pit Call — New contact form message',
  displayName: 'Contact form submission',
  to: 'info@pitcall.net',
  previewData: {
    name: 'Alex Rossi',
    email: 'alex.rossi@example.com',
    userType: 'Team',
    reasons: 'General info, Partnership / Business',
    subject: 'Question about team onboarding',
    message: 'Hi, I would like to know more about how my team can post Pit Calls and manage confirmations.',
  },
} satisfies TemplateEntry
