import { getSupabaseAdmin } from '../../lib/supabase'
import { sendAdminTelegram, escapeHtml } from '../../lib/telegram'

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('participants')
    .select('name, surname, role, country, created_at')

  if (error) return res.status(500).json({ error: error.message })

  const today = new Date().toISOString().slice(0, 10)
  const createdToday = data.filter((p) => String(p.created_at || '').slice(0, 10) === today)
  const countries = {}
  data.forEach((p) => {
    if (p.country) countries[p.country] = (countries[p.country] || 0) + 1
  })
  const topCountries = Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count], index) => `${index + 1}. ${escapeHtml(country)} — ${count}`)
    .join('\n')

  await sendAdminTelegram(
    `📊 <b>Ежедневная статистика Marathon Skills</b>\n\n` +
    `👥 Всего участников: <b>${data.length}</b>\n` +
    `🆕 За сегодня: <b>${createdToday.length}</b>\n` +
    `🏃 Бегунов: <b>${data.filter((p) => p.role === 'Бегун').length}</b>\n` +
    `📋 Координаторов: <b>${data.filter((p) => p.role === 'Координатор').length}</b>\n\n` +
    `🏆 <b>Топ стран:</b>\n${topCountries || '—'}`
  )

  return res.status(200).json({ ok: true })
}

