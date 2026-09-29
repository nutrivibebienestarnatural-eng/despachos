// api/telegram-correcciones.js — cola de correcciones de pedidos que el admin mandó por el bot de
// Telegram (botón "✏️ Corregir este pedido", solo para vos), esperando a que la app (abierta en el
// navegador) las aplique al pedido correspondiente en Firestore — el bot no tiene permiso para
// escribir ahí directamente.
//
// GET /api/telegram-correcciones  -> devuelve las correcciones pendientes Y VACÍA la cola (se consumen una vez)

const { kvGet, kvSet } = require("./_lib/kv");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Usá GET" });
  try {
    const cola = (await kvGet("telegram_correcciones_pendientes")) || [];
    if (cola.length) await kvSet("telegram_correcciones_pendientes", []);
    return res.status(200).json({ ok: true, correcciones: cola });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
