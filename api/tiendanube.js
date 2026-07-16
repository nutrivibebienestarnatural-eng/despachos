// api/tiendanube.js — Puente seguro entre la app y Tienda Nube.
// El TOKEN nunca viaja al navegador: vive en las Variables de Entorno de Vercel.
//
// Variables que hay que cargar en Vercel (Settings → Environment Variables):
//   TN_TOKEN     -> el access token de Tienda Nube
//   TN_STORE_ID  -> el id numérico de la tienda (user_id)
//   TN_UA        -> (opcional) User-Agent, ej: "Fullminet (agumartini@gmail.com)"
//
// Endpoints:
//   GET  /api/tiendanube?action=pedidos            -> trae los pedidos pagados y sin despachar, ya mapeados
//   POST /api/tiendanube  {action:"tracking", tnId, code, url}  -> marca el pedido como enviado en Tienda Nube

const API_BASE = "https://api.tiendanube.com/v1";

function tnHeaders() {
  const token = process.env.TN_TOKEN;
  const ua = process.env.TN_UA || "Fullminet (agumartini@gmail.com)";
  return {
    "Authentication": "bearer " + token,       // OJO: es "Authentication", no "Authorization"
    "User-Agent": ua,
    "Content-Type": "application/json; charset=utf-8",
  };
}

// Convierte un pedido de Tienda Nube al formato que usa la app de despacho
function mapearPedido(o) {
  const s = o.shipping_address || {};
  const dir = [s.address, s.number, s.floor].filter(Boolean).join(" ").trim();
  const items = (o.products || [])
    .map(p => (p.quantity || 1) + "x " + (p.name || "").replace(/\s+/g, " ").trim())
    .join(" · ");
  const retiro = (o.shipping_pickup_type === "pickup");   // retira en punto → va a correo/retiro
  return {
    tnId: o.id,                                  // id interno de Tienda Nube (para devolver el tracking)
    ref: "#" + (o.number != null ? o.number : o.id),
    cliente: s.name || o.contact_name || "",
    tel: s.phone || o.contact_phone || "",
    dir: dir,
    ciudad: s.locality || s.city || "",
    provincia: s.province || "",
    cp: (s.zipcode || "").toString().replace(/\D/g, "").slice(0, 4),
    items: items,
    nota: o.note || "",
    retiro: retiro,
    pago: o.payment_status || "",
    envio: o.shipping_status || "",
  };
}

async function traerPedidos(desde) {
  const store = process.env.TN_STORE_ID;
  const base = `${API_BASE}/${store}/orders`;
  const filtroFecha = desde ? `&created_at_min=${encodeURIComponent(desde + "T00:00:00-03:00")}` : "";
  // pagados + abiertos + todavía sin despachar (unpacked). Paginado por las dudas.
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${base}?status=open&payment_status=paid&shipping_status=unpacked&per_page=50&page=${page}${filtroFecha}`;
    const r = await fetch(url, { headers: tnHeaders() });
    if (r.status === 404) break;                 // no hay más páginas
    if (!r.ok) {
      const txt = await r.text();
      throw new Error("Tienda Nube respondió " + r.status + ": " + txt.slice(0, 200));
    }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) break;
    arr.forEach(o => out.push(mapearPedido(o)));
    if (arr.length < 50) break;                  // última página
  }
  return out;
}

// Devuelve el estado/tracking a Tienda Nube marcando el/los fulfillment orders como enviados.
async function devolverTracking({ tnId, code, url }) {
  const store = process.env.TN_STORE_ID;
  // 1) traigo el pedido con sus fulfillment orders
  const r1 = await fetch(`${API_BASE}/${store}/orders/${tnId}?aggregates=fulfillment_orders`, { headers: tnHeaders() });
  if (!r1.ok) throw new Error("No pude leer el pedido " + tnId + " (" + r1.status + ")");
  const order = await r1.json();
  const fos = order.fulfillments || order.fulfillment_orders || [];
  if (!fos.length) throw new Error("El pedido no tiene fulfillment orders (revisá el envío en Tienda Nube).");

  const resultados = [];
  for (const fo of fos) {
    const foId = fo.id;
    // 2) marco cada fulfillment order como enviado, con el tracking
    const body = JSON.stringify({
      status: "shipped",
      tracking_info: { code: code || null, url: url || null },
      notify_customer: true,
    });
    const r2 = await fetch(`${API_BASE}/${store}/fulfillment-orders/${foId}/fulfill`, {
      method: "POST", headers: tnHeaders(), body,
    });
    const txt = await r2.text();
    resultados.push({ foId, status: r2.status, resp: txt.slice(0, 300) });
  }
  return resultados;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!process.env.TN_TOKEN || !process.env.TN_STORE_ID) {
      return res.status(500).json({ ok: false, error: "Falta configurar TN_TOKEN y TN_STORE_ID en Vercel." });
    }
    const action = (req.query && req.query.action) || (req.body && req.body.action);

    // GET => devolver pedidos (la app lo llama con /api/tiendanube?empresa=...&desde=YYYY-MM-DD)
    if (req.method === "GET") {
      const pedidos = await traerPedidos(req.query && req.query.desde);
      return res.status(200).json({ ok: true, cantidad: pedidos.length, pedidos });
    }

    if (req.method === "POST" && action === "tracking") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body.tnId) return res.status(400).json({ ok: false, error: "Falta tnId" });
      const resultados = await devolverTracking(body);
      return res.status(200).json({ ok: true, resultados });
    }

    return res.status(400).json({ ok: false, error: "Acción no reconocida. Usá ?action=pedidos o POST action=tracking." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
