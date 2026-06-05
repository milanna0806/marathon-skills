import { supabaseAdmin } from "../../lib/supabase";

// Отключаем bodyParser — Telegram шлёт JSON, Next.js должен его распарсить сам
export const config = {
  api: {
    bodyParser: true,
  },
};

// Отправка сообщения через Telegram API
async function sendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

export default async function handler(req, res) {
  // Telegram шлёт только POST
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  try {
    const { message } = req.body;

    // Игнорируем если нет сообщения или текста
    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Команда /start
    if (text === "/start") {
      await sendMessage(
        chatId,
        "👋 Привет! Я бот марафона <b>Marathon Skills 2026</b>.\n\n" +
        "Отправь мне <b>фамилию</b> участника — и я найду его в базе данных.\n\n" +
        "Пример: <code>Иванов</code>"
      );
      return res.status(200).json({ ok: true });
    }

    // Команда /help
    if (text === "/help") {
      await sendMessage(
        chatId,
        "📖 <b>Как пользоваться ботом:</b>\n\n" +
        "Просто напиши фамилию участника марафона.\n" +
        "Я найду его в базе данных и покажу информацию.\n\n" +
        "Пример: <code>Смирнов</code>"
      );
      return res.status(200).json({ ok: true });
    }

    // Поиск по фамилии в таблице participants
    const surname = text;

    const { data, error } = await supabaseAdmin
      .from("participants")
      .select("name, surname, email, gender, country, bmi, role")
      .ilike("surname", surname)  // ilike — регистронезависимый поиск
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error.message);
      await sendMessage(chatId, "⚠️ Ошибка при обращении к базе данных. Попробуй позже.");
      return res.status(200).json({ ok: true });
    }

    if (!data) {
      await sendMessage(
        chatId,
        `❌ Фамилия «<b>${surname}</b>» не найдена в базе.\n\n` +
        "Проверь правильность написания и попробуй снова."
      );
      return res.status(200).json({ ok: true });
    }

    // Найдено — формируем ответ
    const bmi = data.bmi ? parseFloat(data.bmi).toFixed(1) : "не указан";
    const reply =
      `✅ Фамилия <b>${data.surname}</b> найдена!\n\n` +
      `👤 Имя: ${data.name} ${data.surname}\n` +
      `📧 Email: ${data.email}\n` +
      `⚧ Пол: ${data.gender || "—"}\n` +
      `🌍 Страна: ${data.country || "—"}\n` +
      `📊 BMI: ${bmi}\n` +
      `🎽 Роль: ${data.role || "—"}`;

    await sendMessage(chatId, reply);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true }); // всегда 200 для Telegram
  }
}
