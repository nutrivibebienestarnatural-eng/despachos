// api/telegram.js — manda la foto de un pedido (con su resumen) o un texto a Telegram.
// El TOKEN del bot nunca viaja al navegador: vive en las Variables de Entorno de Vercel.
//
// Variables que hay que cargar en Vercel (Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN -> el token que te da @BotFather (ej: 123456:ABC-...)
//   TELEGRAM_CHAT_ID   -> tu chat (o el de un grupo) donde llegan los mensajes
//
// Endpoints:
//   POST /api/telegram {foto:"data:image/jpeg;base64,...", texto:"..."}  -> manda la foto con el texto de pie
//   POST /api/telegram {texto:"..."}                                      -> manda solo texto
//   GET  /api/telegram                                                    -> dice si está configurado

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (req.method === "GET") return res.status(200).json({ ok: true, configurado: !!(token && chat) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Usá POST" });
  if (!token || !chat) return res.status(500).json({ ok: false, error: "Falta configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const texto = String(body.texto || "").slice(0, 4000);
    const api = `https://api.telegram.org/bot${token}`;
    let r;
    if (body.foto) {
      const m = String(body.foto).match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ ok: false, error: "Foto inválida" });
      const form = new FormData();
      form.append("chat_id", chat);
      form.append("caption", texto.slice(0, 1024));            // Telegram corta el pie de foto en 1024
      form.append("photo", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), "pedido.jpg");
      r = await fetch(`${api}/sendPhoto`, { method: "POST", body: form });
    } else {
      r = await fetch(`${api}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: texto || "(vacío)" }),
      });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) return res.status(502).json({ ok: false, error: data.description || ("Telegram respondió " + r.status) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
