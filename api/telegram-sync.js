// api/telegram-sync.js — recibe desde el navegador (la app abierta) el listado de pedidos
// pendientes de preparar, y lo guarda en Vercel KV. El bot de Telegram (api/telegram-webhook.js)
// lo lee de ahí para mostrar la lista y saber qué debía llevar cada pedido — así el bot no
// necesita acceso directo a Firestore.
//
// POST /api/telegram-sync {pedidos:[{id, cliente, items:[{nombre,cant}]}], preparados:[...]}
//   pedidos    -> pendientes de preparar (lo normal)
//   preparados -> ya avanzados (últimas 24hs), para el modo "Chequear un pedido" del bot

const { kvGet, kvSet } = require("./_lib/kv");

function limpiar(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 200).map(p => ({
    id: String(p.id || "").slice(0, 60),
    cliente: String(p.cliente || "").slice(0, 120),
    estado: String(p.estado || "").slice(0, 30),
    items: (Array.isArray(p.items) ? p.items : []).slice(0, 30).map(i => ({
      nombre: String(i.nombre || "").slice(0, 120),
      cant: Number(i.cant) || 0,
    })),
  })).filter(p => p.id);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    // Diagnóstico: abrí /api/telegram-sync en el navegador para ver qué es lo que el bot está
    // leyendo AHORA MISMO desde KV — sirve para saber si el problema es que no llega el dato desde
    // la app, o que el bot no lo lee bien.
    try {
      const pedidos = (await kvGet("pending_orders")) || [];
      const preparados = (await kvGet("prepared_recent")) || [];
      return res.status(200).json({
        ok: true,
        pendientes: pedidos.length,
        preparados: preparados.length,
        detalle_pendientes: pedidos.map(p => ({
          cliente: p.cliente || p.id,
          items: (p.items || []).map(i => i.cant + "x " + i.nombre),
        })),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Usá POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const pedidos = limpiar(body.pedidos);
    const preparados = limpiar(body.preparados);
    await kvSet("pending_orders", pedidos);
    await kvSet("prepared_recent", preparados);
    return res.status(200).json({ ok: true, cantidad: pedidos.length, preparados: preparados.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
