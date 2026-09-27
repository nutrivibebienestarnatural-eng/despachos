// api/telegram-sync.js — recibe desde el navegador (la app abierta) el listado de pedidos
// pendientes de preparar, y lo guarda en Vercel KV. El bot de Telegram (api/telegram-webhook.js)
// lo lee de ahí para mostrar la lista y saber qué debía llevar cada pedido — así el bot no
// necesita acceso directo a Firestore.
//
// POST /api/telegram-sync {pedidos:[{id, cliente, items:[{nombre,cant}]}]}

const { kvSet } = require("./_lib/kv");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Usá POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const pedidos = Array.isArray(body.pedidos) ? body.pedidos : [];
    const limpio = pedidos.slice(0, 200).map(p => ({
      id: String(p.id || "").slice(0, 60),
      cliente: String(p.cliente || "").slice(0, 120),
      items: (Array.isArray(p.items) ? p.items : []).slice(0, 30).map(i => ({
        nombre: String(i.nombre || "").slice(0, 120),
        cant: Number(i.cant) || 0,
      })),
    })).filter(p => p.id);
    await kvSet("pending_orders", limpio);
    return res.status(200).json({ ok: true, cantidad: limpio.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
