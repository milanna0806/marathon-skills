import { sendAdminTelegram, escapeHtml } from '../../lib/telegram'

function isAllowed(req) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!secret) return true
  return req.headers['x-webhook-secret'] === secret || req.query.secret === secret
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isAllowed(req)) return res.status(401).json({ error: 'Unauthorized' })

  const event = req.body
  const record = event.record || event.new || event
  const table = event.table || event.table_name || 'participants'
  const type = String(event.type || event.eventType || event.event || 'INSERT').toUpperCase()

  if (table === 'participants' && type.includes('INSERT')) {
    await sendAdminTelegram(
      `🎉 <b>Новая регистрация в Supabase</b>\n\n` +
      `👤 <b>${escapeHtml(record.surname)} ${escapeHtml(record.name)}</b>\n` +
      `🎽 ${escapeHtml(record.role)} · 🌍 ${escapeHtml(record.country)}\n` +
      `📧 ${escapeHtml(record.email)}`
    )
  }

  return res.status(200).json({ ok: true })
}

