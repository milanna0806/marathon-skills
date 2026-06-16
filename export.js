import { getSupabaseAdmin } from '../../lib/supabase'
import { answerMarathonQuestion } from '../../lib/marathonAgent'

export const config = { api: { bodyParser: true } }

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (keyboard) body.reply_markup = keyboard
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

function mainKeyboard(isAdmin) {
  const rows = [
    ['✚ Зарегистрироваться на марафон'],
    ['🔍 Найти по фамилии', '🔍 Найти по имени'],
    ['📊 Статистика', '❓ Что такое марафон?'],
    ['🤖 ИИ-консультант'],
    ['📋 Как зарегистрироваться?', '🌐 Открыть сайт'],
  ]
  if (isAdmin) rows.push(['⚖️ Калькулятор ИМТ (Админ)'])
  return { keyboard: rows, resize_keyboard: true }
}

function cancelKeyboard() {
  return { keyboard: [['❌ Отмена']], resize_keyboard: true }
}

function escapeHtml(str) {
  if (!str) return '—'
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function calcBMI(weight, height) {
  const bmi = weight / ((height / 100) ** 2)
  let category, emoji
  if (bmi < 18.5)      { category = 'Недостаточный вес'; emoji = '⚠️' }
  else if (bmi < 25)   { category = 'Норма';             emoji = '✅' }
  else if (bmi < 30)   { category = 'Избыточный вес';    emoji = '⚠️' }
  else                 { category = 'Ожирение';           emoji = '🔴' }
  return { bmi: parseFloat(bmi.toFixed(1)), category, emoji }
}

// ── Работа с состоянием в Supabase ───────────────────────────
async function getState(chatId) {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('bot_state')
    .select('state')
    .eq('chat_id', String(chatId))
    .single()
  if (!data) return null
  try { return JSON.parse(data.state) } catch { return null }
}

async function setState(chatId, state) {
  const db = getSupabaseAdmin()
  console.log('setState called:', chatId, JSON.stringify(state))
  const { error } = await db.from('bot_state').upsert({
    chat_id: String(chatId),
    state: JSON.stringify(state),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'chat_id' })
  if (error) console.error('setState error:', error)
}

async function clearState(chatId) {
  const db = getSupabaseAdmin()
  await db.from('bot_state').delete().eq('chat_id', String(chatId))
}

const REG_STEPS = ['name', 'surname', 'email', 'gender', 'role', 'country']

async function startRegistration(chatId) {
  await setState(chatId, { type: 'reg', step: 0, data: {} })
  await sendMessage(chatId,
    '📝 <b>Регистрация на марафон</b>\n\nШаг 1 из 6 — Введи своё <b>имя</b>:',
    cancelKeyboard()
  )
}

async function handleReg(chatId, text, state, isAdmin) {
  const step = state.step

  if (typeof step === 'number' && step < REG_STEPS.length) {
    const field = REG_STEPS[step]

    if (field === 'email' && !text.includes('@')) {
      await sendMessage(chatId, '❌ Неверный email. Попробуй ещё раз:', cancelKeyboard())
      return
    }

    state.data[field] = text
    state.step++
    const next = REG_STEPS[state.step]

    if (next === 'gender') {
      await setState(chatId, state)
      await sendMessage(chatId,
        `Шаг ${state.step + 1} из 6 — Выбери <b>пол</b>:`,
        { keyboard: [['Мужской', 'Женский'], ['❌ Отмена']], resize_keyboard: true }
      )
    } else if (next === 'role') {
      await setState(chatId, state)
      await sendMessage(chatId,
        `Шаг ${state.step + 1} из 6 — Выбери <b>роль</b>:`,
        { keyboard: [['Бегун', 'Координатор'], ['❌ Отмена']], resize_keyboard: true }
      )
    } else if (next === 'country') {
      await setState(chatId, state)
      await sendMessage(chatId,
        `Шаг ${state.step + 1} из 6 — Введи <b>страну</b>:`,
        cancelKeyboard()
      )
    } else if (!next) {
      state.step = 'bmi_ask'
      await setState(chatId, state)
      await sendMessage(chatId,
        '📊 Хочешь рассчитать <b>ИМТ (индекс массы тела)</b>?\n\nЭто необязательно, но поможет организаторам.',
        { keyboard: [['📊 Рассчитать ИМТ', '⏭ Пропустить'], ['❌ Отмена']], resize_keyboard: true }
      )
    } else {
      await setState(chatId, state)
      const label = next === 'surname' ? 'фамилию' : next === 'email' ? 'email' : next
      await sendMessage(chatId,
        `Шаг ${state.step + 1} из 6 — Введи <b>${label}</b>:`,
        cancelKeyboard()
      )
    }
    return
  }

  if (step === 'bmi_ask') {
    if (text === '📊 Рассчитать ИМТ') {
      state.step = 'bmi_weight'
      await setState(chatId, state)
      await sendMessage(chatId, '⚖️ Введи свой <b>вес</b> в кг (например: <code>72</code>):', cancelKeyboard())
    } else {
      state.data.bmi = null
      state.step = 'confirm'
      await setState(chatId, state)
      await showConfirm(chatId, state.data)
    }
    return
  }

  if (step === 'bmi_weight') {
    const w = parseFloat(text)
    if (isNaN(w) || w < 30 || w > 300) {
      await sendMessage(chatId, '❌ Некорректный вес. Введи число, например <code>72</code>:', cancelKeyboard())
      return
    }
    state.data._weight = w
    state.step = 'bmi_height'
    await setState(chatId, state)
    await sendMessage(chatId, '📏 Введи свой <b>рост</b> в см (например: <code>175</code>):', cancelKeyboard())
    return
  }

  if (step === 'bmi_height') {
    const h = parseFloat(text)
    if (isNaN(h) || h < 100 || h > 250) {
      await sendMessage(chatId, '❌ Некорректный рост. Введи число, например <code>175</code>:', cancelKeyboard())
      return
    }
    const { bmi, category, emoji } = calcBMI(state.data._weight, h)
    delete state.data._weight
    state.data.bmi = bmi
    state.step = 'confirm'
    await setState(chatId, state)
    await sendMessage(chatId, `${emoji} Твой ИМТ: <b>${bmi}</b> — ${category}\n\nОтлично, сохраню в профиль!`)
    await showConfirm(chatId, state.data)
    return
  }
}

async function showConfirm(chatId, d) {
  await sendMessage(chatId,
    `✅ <b>Проверь данные:</b>\n\n` +
    `👤 ${escapeHtml(d.name)} ${escapeHtml(d.surname)}\n` +
    `📧 ${escapeHtml(d.email)}\n` +
    `⚥ ${escapeHtml(d.gender)}\n` +
    `🎽 ${escapeHtml(d.role)}\n` +
    `🌍 ${escapeHtml(d.country)}\n` +
    `📊 ИМТ: ${d.bmi ?? '—'}\n\nВсё верно?`,
    { keyboard: [['✅ Подтвердить', '❌ Отмена']], resize_keyboard: true }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    if (req.body?.type === 'new_participant') {
      if (ADMIN_CHAT_ID) {
        const p = req.body.participant
        await sendMessage(ADMIN_CHAT_ID,
          `🎉 <b>Новый участник с сайта!</b>\n\n` +
          `👤 <b>${escapeHtml(p.surname)} ${escapeHtml(p.name)}</b>\n` +
          `🎽 ${p.role || '—'} · 🌍 ${p.country || '—'}\n📧 ${p.email || '—'}`
        )
      }
      return res.status(200).json({ ok: true })
    }

    const message = req.body?.message
    if (!message?.text) return res.status(200).json({ ok: true })

    const chatId  = message.chat.id
    const text    = message.text.trim()
    const isAdmin = String(chatId) === String(ADMIN_CHAT_ID)

    // Загружаем состояние из Supabase
    const state = await getState(chatId)

    // ── Отмена ───────────────────────────────────────────────────
    if (text === '❌ Отмена') {
      await clearState(chatId)
      await sendMessage(chatId, '↩️ Отменено.', mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    // ── Подтверждение регистрации ─────────────────────────────────
    if (text === '✅ Подтвердить' && state?.type === 'reg' && state?.step === 'confirm') {
      const d = state.data
      await clearState(chatId)

      const db = getSupabaseAdmin()
      const { error } = await db.from('participants').insert({
        name:       d.name,
        surname:    d.surname,
        email:      d.email,
        gender:     d.gender,
        role:       d.role,
        country:    d.country,
        bmi:        d.bmi ?? null,
        owner_id:   `tg_${chatId}`,
        created_at: new Date().toISOString(),
      }).select().single()

      if (error) {
        await sendMessage(chatId, `❌ Ошибка сохранения: ${error.message}`, mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }

      await sendMessage(chatId,
        `🎉 <b>Ты успешно зарегистрирован!</b>\n\n` +
        `👤 ${escapeHtml(d.surname)} ${escapeHtml(d.name)}\n` +
        `🎽 ${d.role} · 🌍 ${d.country}` +
        (d.bmi ? `\n📊 ИМТ: ${d.bmi}` : '') +
        `\n\nЖдём тебя <b>15 июня 2026</b> · 42.195 км 🏃`,
        mainKeyboard(isAdmin)
      )

      if (ADMIN_CHAT_ID && !isAdmin) {
        await sendMessage(ADMIN_CHAT_ID,
          `🎉 <b>Новый участник через бота!</b>\n\n` +
          `👤 <b>${escapeHtml(d.surname)} ${escapeHtml(d.name)}</b>\n` +
          `🎽 ${d.role} · 🌍 ${d.country}\n📧 ${d.email}` +
          (d.bmi ? `\n📊 ИМТ: ${d.bmi}` : '') +
          `\n🆔 @${message.from.username || chatId}`
        )
      }
      return res.status(200).json({ ok: true })
    }

    // ── Если идёт регистрация ─────────────────────────────────────
    if (state?.type === 'reg') {
      await handleReg(chatId, text, state, isAdmin)
      return res.status(200).json({ ok: true })
    }

    // ── Калькулятор ИМТ (только для админа) ──────────────────────
    if (text === '⚖️ Калькулятор ИМТ (Админ)') {
      if (!isAdmin) {
        await sendMessage(chatId, '❌ Только для администратора.', mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }
      await setState(chatId, { type: 'bmi', step: 'weight' })
      await sendMessage(chatId, '⚖️ <b>Калькулятор ИМТ</b>\n\nВведи <b>вес</b> в кг:', cancelKeyboard())
      return res.status(200).json({ ok: true })
    }

    if (state?.type === 'bmi' && state?.step === 'weight') {
      const w = parseFloat(text)
      if (isNaN(w) || w < 30 || w > 300) {
        await sendMessage(chatId, '❌ Некорректный вес:', cancelKeyboard())
        return res.status(200).json({ ok: true })
      }
      await setState(chatId, { type: 'bmi', step: 'height', weight: w })
      await sendMessage(chatId, '📏 Введи <b>рост</b> в см:', cancelKeyboard())
      return res.status(200).json({ ok: true })
    }

    if (state?.type === 'bmi' && state?.step === 'height') {
      const h = parseFloat(text)
      if (isNaN(h) || h < 100 || h > 250) {
        await sendMessage(chatId, '❌ Некорректный рост:', cancelKeyboard())
        return res.status(200).json({ ok: true })
      }
      const { bmi, category, emoji } = calcBMI(state.weight, h)
      await clearState(chatId)
      const bar = bmi < 18.5 ? '🟦⬜⬜⬜' : bmi < 25 ? '🟦🟩⬜⬜' : bmi < 30 ? '🟦🟩🟨⬜' : '🟦🟩🟨🟥'
      await sendMessage(chatId,
        `${emoji} <b>ИМТ: ${bmi}</b> — ${category}\n${bar}\n\n` +
        `🟦 &lt;18.5 Недостаточный\n🟩 18.5–24.9 Норма ✅\n🟨 25–29.9 Избыточный\n🟥 ≥30 Ожирение`,
        mainKeyboard(isAdmin)
      )
      return res.status(200).json({ ok: true })
    }

    // ── Главное меню ──────────────────────────────────────────────
    if (text === '/start' || text === '/help') {
      await sendMessage(chatId, '🏃 <b>Marathon Skills 2026</b>\n\nПривет! Выбери действие 👇', mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    if (text === '✚ Зарегистрироваться на марафон') {
      await startRegistration(chatId)
      return res.status(200).json({ ok: true })
    }

    if (text === '🌐 Открыть сайт') {
      await sendMessage(chatId,
        '🌐 <a href="https://marathon-vercel-superbase.vercel.app">marathon-vercel-superbase.vercel.app</a>',
        mainKeyboard(isAdmin)
      )
      return res.status(200).json({ ok: true })
    }

    if (text === '🤖 ИИ-консультант') {
      await sendMessage(chatId, '🤖 Напиши вопрос о марафоне, регистрации, участниках или статистике.', mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    if (text === '📋 Как зарегистрироваться?') {
      await sendMessage(chatId,
        '📋 <b>Способы регистрации:</b>\n\n' +
        '1️⃣ <b>Прямо здесь в боте</b> — нажми «✚ Зарегистрироваться»\n\n' +
        '2️⃣ <b>На сайте</b>:\n<a href="https://marathon-vercel-superbase.vercel.app">marathon-vercel-superbase.vercel.app</a>\n→ Войти через Google → ✚ Зарегистрировать',
        mainKeyboard(isAdmin)
      )
      return res.status(200).json({ ok: true })
    }

    if (text === '❓ Что такое марафон?') {
      await sendMessage(chatId,
        '🏅 <b>Marathon Skills 2026</b>\n\n' +
        'Марафон — забег на <b>42,195 км</b>\n\n' +
        '📅 <b>15 июня 2026</b> · Алматы\n\n' +
        '🏃 <b>Бегун</b> — участвует в забеге\n' +
        '📋 <b>Координатор</b> — организует и помогает',
        mainKeyboard(isAdmin)
      )
      return res.status(200).json({ ok: true })
    }

    if (text === '📊 Статистика') {
      const db = getSupabaseAdmin()
      const { data, error } = await db.from('participants').select('role, country, bmi')
      if (error || !data) {
        await sendMessage(chatId, '❌ Не удалось получить статистику.', mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }
      const total    = data.length
      const runners  = data.filter(p => p.role === 'Бегун').length
      const coords   = data.filter(p => p.role === 'Координатор').length
      const countries = [...new Set(data.map(p => p.country).filter(Boolean))]
      const bmis     = data.map(p => p.bmi).filter(Boolean)
      const avgBmi   = bmis.length ? (bmis.reduce((a, b) => a + b, 0) / bmis.length).toFixed(1) : '—'
      const cc = {}
      data.forEach(p => { if (p.country) cc[p.country] = (cc[p.country] || 0) + 1 })
      const top = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 3)
      let reply = `📊 <b>Статистика марафона</b>\n\n👥 Всего: <b>${total}</b>\n🏃 Бегунов: <b>${runners}</b>\n📋 Координаторов: <b>${coords}</b>\n🌍 Стран: <b>${countries.length}</b>\n📊 Средний ИМТ: <b>${avgBmi}</b>`
      if (top.length) { reply += `\n\n🏆 <b>Топ стран:</b>\n`; top.forEach(([c, n], i) => { reply += `${i+1}. ${c} — ${n} чел.\n` }) }
      await sendMessage(chatId, reply, mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    if (text === '🔍 Найти по фамилии') {
      await setState(chatId, { type: 'search', field: 'surname' })
      await sendMessage(chatId, '✏️ Введи <b>фамилию</b>:', cancelKeyboard())
      return res.status(200).json({ ok: true })
    }

    if (text === '🔍 Найти по имени') {
      await setState(chatId, { type: 'search', field: 'name' })
      await sendMessage(chatId, '✏️ Введи <b>имя</b>:', cancelKeyboard())
      return res.status(200).json({ ok: true })
    }

    // ── Удаление (только для админа) ──────────────────────────────
    if (text.startsWith('/delete_')) {
      if (!isAdmin) {
        await sendMessage(chatId, '❌ Нет прав.', mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }
      const id = text.replace('/delete_', '').trim()
      const db = getSupabaseAdmin()
      const { error } = await db.from('participants').delete().eq('id', id)
      await sendMessage(chatId, error ? `❌ Ошибка: ${error.message}` : '✅ Участник удалён.', mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    // ── Поиск ─────────────────────────────────────────────────────
    if (state?.type === 'search') {
      await clearState(chatId)
      const db    = getSupabaseAdmin()
      const field = state.field === 'name' ? 'name' : 'surname'
      const { data, error } = await db
        .from('participants')
        .select('id, name, surname, role, country, bmi, gender')
        .ilike(field, `%${text}%`)
        .limit(5)

      if (error) {
        await sendMessage(chatId, '❌ Ошибка базы данных.', mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }
      if (!data || data.length === 0) {
        await sendMessage(chatId, `❌ По запросу «<b>${escapeHtml(text)}</b>» никого не найдено.`, mainKeyboard(isAdmin))
        return res.status(200).json({ ok: true })
      }

      let reply = `✅ Найдено: <b>${data.length}</b> участник(ов)\n\n`
      data.forEach(p => {
        const g = p.gender === 'Женский' ? '👩' : '👨'
        reply += `${g} <b>${escapeHtml(p.surname)} ${escapeHtml(p.name)}</b>\n`
        reply += `   🎽 ${p.role || '—'} · 🌍 ${p.country || '—'}`
        if (p.bmi) reply += ` · 📊 ${p.bmi}`
        reply += '\n'
        if (isAdmin) reply += `   🗑 /delete_${p.id}\n`
        reply += '\n'
      })
      await sendMessage(chatId, reply.trim(), mainKeyboard(isAdmin))
      return res.status(200).json({ ok: true })
    }

    const aiAnswer = await answerMarathonQuestion(text)
    await sendMessage(chatId, `🤖 <b>ИИ-консультант</b>\n\n${escapeHtml(aiAnswer)}`, mainKeyboard(isAdmin))
    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(200).json({ ok: true })
  }
}
