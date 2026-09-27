// api/mercadolibre.js — Puente entre la app y Mercado Libre, para las marcas que venden por Flex
// (cada una desde su propia cuenta — ver api/ml-connect.js para conectarlas).
//
// El access_token de ML dura 6hs y su refresh_token se gasta en cada uso (ML te da uno nuevo
// cada vez que lo usás). Por eso vive en Vercel KV en vez de una variable de entorno: acá se
// renueva solo y se guarda de nuevo antes de contestar, así la próxima llamada ya tiene el bueno.
//
// Endpoint:
//   GET /api/mercadolibre?action=pedidos&empresa=nutrivibe&desde=YYYY-MM-DD
//     -> pedidos pagos y todavía sin marcar como enviados de la cuenta conectada a esa marca
//
// Setup: ver api/ml-auth.js y api/ml-connect.js (ML_CLIENT_ID, ML_CLIENT_SECRET, Vercel KV,
// y conectar cada marca una vez desde /api/ml-connect?empresa=nombre).

const { kvGet, kvSet } = require("./_lib/kv");
const API_BASE = "https://api.mercadolibre.com";

// ID de vendedor de ML de cada marca (el mismo que ya usa index.html en VENDEDOR_ML para
// detectar la marca en las etiquetas). Se usa este ID fijo — y NO el "user_id" que devuelve
// el login — porque si quien conecta la cuenta es un usuario COLABORADOR (no el dueño), ese
// user_id es el del colaborador, no el de la marca, y las órdenes no aparecerían.
const SELLER_ID = {
  nutrivibe: "3177810946",
  suplemundo: "3660784748",
};

async function tokenValido(empresa) {
  const key = "ml_tokens:" + empresa;
  const t = await kvGet(key);
  if (!t || !t.refresh_token) {
    throw new Error("Esta marca todavía no está conectada con Mercado Libre. Entrá a Importar pedidos → Conectar con Mercado Libre.");
  }
  if (t.access_token && t.expira && Date.now() < t.expira) return t;   // sigue vivo, no hace falta renovar

  const cid = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
  if (!cid || !secret) throw new Error("Falta configurar ML_CLIENT_ID y ML_CLIENT_SECRET en Vercel.");
  const r = await fetch(API_BASE + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: cid, client_secret: secret, refresh_token: t.refresh_token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!data || !data.access_token) {
    throw new Error("No pude renovar el token de Mercado Libre (" + empresa + "): " + JSON.stringify(data).slice(0, 200) + ". Puede que haga falta volver a conectarla.");
  }
  const nuevo = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || t.refresh_token,
    user_id: data.user_id || t.user_id,
    expira: Date.now() + ((data.expires_in || 21600) * 1000) - 60000,
  };
  await kvSet(key, nuevo);   // guardo YA el nuevo refresh_token: el anterior queda inválido apenas lo usamos
  return nuevo;
}

function mlHeaders(token) { return { "Authorization": "Bearer " + token, "Accept": "application/json" }; }

// Convierte una orden + su envío al formato que usa la app de despacho
// (mismos nombres de campo que arma api/tiendanube.js, para que el import del lado
// del navegador — vincular productos por SKU, elegir método de envío, etc — sea igual).
function mapearPedido(o, ship, empresa) {
  const items = (o.order_items || []).map(it => ({
    nombre: String((it.item && it.item.title) || "").trim(),
    cant: parseInt(it.quantity, 10) || 1,
    sku: String((it.item && (it.item.seller_sku || it.item.seller_custom_field)) || "").trim(),
  }));
  const itemsTxt = items.map(p => p.cant + "x " + p.nombre).join(" · ");
  const rd = (ship && ship.receiver_address) || {};
  const dir = [rd.address_line, rd.comment].filter(Boolean).join(" - ").trim();
  return {
    mlId: o.id,
    ref: "#" + o.id,
    empresa,
    canal: "ml_flex",
    cliente: rd.receiver_name || (o.buyer && o.buyer.nickname) || "",
    tel: (rd.receiver_phone || "").trim(),
    dir: dir,
    ciudad: (rd.city && rd.city.name) || "",
    provincia: (rd.state && rd.state.name) || "",
    cp: String(rd.zip_code || "").replace(/\D/g, "").slice(0, 4),
    items: itemsTxt,
    prodsTN: items,   // mismo campo que usa el import de Tienda Nube, para reusar el vínculo por SKU
    nota: "",
  };
}

async function traerPedidos(empresa, desde) {
  const t = await tokenValido(empresa);
  const sellerId = SELLER_ID[empresa];
  if (!sellerId) throw new Error("No tengo el ID de vendedor de ML de '" + empresa + "'. Falta agregarlo en api/mercadolibre.js (SELLER_ID).");
  const filtroFecha = desde ? `&order.date_created.from=${encodeURIComponent(desde + "T00:00:00.000-03:00")}` : "";
  const out = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const url = `${API_BASE}/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=50&offset=${offset}${filtroFecha}`;
    const r = await fetch(url, { headers: mlHeaders(t.access_token) });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error("Mercado Libre respondió " + r.status + ": " + txt.slice(0, 200));
    }
    const data = await r.json();
    const results = data.results || [];
    for (const o of results) {
      const shipId = o.shipping && o.shipping.id;
      let ship = null;
      if (shipId) {
        try {
          const rs = await fetch(`${API_BASE}/shipments/${shipId}`, { headers: mlHeaders(t.access_token) });
          if (rs.ok) ship = await rs.json();
        } catch (e) { /* sin conexión al detalle del envío: sigue igual, se completa a mano en la app */ }
      }
      if (ship && ["shipped", "delivered", "cancelled"].includes(ship.status)) continue;   // ya salió: no lo traigo de nuevo
      out.push(mapearPedido(o, ship, empresa));
    }
    if (results.length < 50) break;   // última página
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const empresa = ((req.query && req.query.empresa) || "").trim();
    if (!empresa) return res.status(400).json({ ok: false, error: "Falta ?empresa=" });

    if (req.method === "GET") {
      const pedidos = await traerPedidos(empresa, req.query && req.query.desde);
      return res.status(200).json({ ok: true, cantidad: pedidos.length, pedidos });
    }
    return res.status(400).json({ ok: false, error: "Método no soportado." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
