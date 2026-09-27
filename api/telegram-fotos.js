// api/telegram-fotos.js — cola de fotos que llegaron por el bot de Telegram (pickeo con IA),
// esperando a que la app (abierta en el navegador) las guarde en el pedido correspondiente.
//
// GET /api/telegram-fotos  -> devuelve las fotos pendientes Y VACÍA la cola (se consumen una vez)

const { kvGet, kvSet } = require("./_lib/kv");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Usá GET" });
  try {
    const cola = (await kvGet("telegram_fotos_pendientes")) || [];
    if (cola.length) await kvSet("telegram_fotos_pendientes", []);
    return res.status(200).json({ ok: true, fotos: cola });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
