import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { supabaseAdmin } from '../../../lib/supabase'

const ADMIN_EMAIL = 'milannaigorevna@gmail.com'
const ALLOWED = ['name', 'surname', 'email', 'gender', 'dob', 'country', 'role', 'bmi']

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if ((char === ',' || char === ';') && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (cell || row.length) rows.push([...row, cell.trim()])
      row = []
      cell = ''
      if (char === '\r' && next === '\n') i++
    } else {
      cell += char
    }
  }
  if (cell || row.length) rows.push([...row, cell.trim()])
  return rows
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || session.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rows = parseCsv(String(req.body?.csv || '').replace(/^\uFEFF/, ''))
  if (rows.length < 2) return res.status(400).json({ error: 'CSV is empty' })

  const headers = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((values) => {
    const item = {}
    headers.forEach((header, index) => {
      if (ALLOWED.includes(header)) item[header] = values[index] || null
    })
    if (item.bmi) item.bmi = Number(item.bmi)
    return item
  }).filter((item) => item.email && item.name && item.surname)

  if (!records.length) return res.status(400).json({ error: 'No valid rows' })

  const { data, error } = await supabaseAdmin
    .from('participants')
    .upsert(records, { onConflict: 'email' })
    .select()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ imported: data.length })
}

