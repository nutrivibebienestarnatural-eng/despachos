// api/ml-auth.js — Paso 2: acá te devuelve Mercado Libre después de aceptar en /api/ml-connect.
// Cambia el "code" por un access_token + refresh_token y los guarda en Vercel KV, con la
// marca (empresa) que mandamos como "state" desde /api/ml-connect. De ahí en más
// /api/mercadolibre los usa solo y los va renovando cuando hace falta.
//
// Variables que hay que cargar en Vercel (de tu aplicación en developers.mercadolibre.com.ar):
//   ML_CLIENT_ID
//   ML_CLIENT_SECRET
// Además hace falta tener un Vercel KV Store conectado a este proyecto (ver api/_lib/kv.js).

const { kvSet } = require("./_lib/kv");
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function pagina(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.55;color:#111}
.box{background:#f5f5f7;border-radius:14px;padding:16px;margin:14px 0}
code{display:block;background:#111;color:#25e06a;padding:10px 12px;border-radius:8px;word-break:break-all;font-size:15px;margin-top:4px}
h2{font-size:22px}</style></head><body>${body}</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const code = req.query && req.query.code;
  const empresa = ((req.query && req.query.state) || "").trim();

  if (!code || !empresa) {
    return res.status(400).send(pagina("Falta el código",
      `<h2>Falta el código o la marca</h2>
       <p>No entres a esta página directamente: hacelo desde <b>Importar pedidos → Conectar con Mercado Libre</b> dentro de la app.</p>`));
  }

  const cid = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
  if (!cid || !secret) {
    return res.status(500).send(pagina("Falta configurar",
      `<h2>Falta cargar ML_CLIENT_ID y ML_CLIENT_SECRET</h2>
       <p>Cargalas en <b>Vercel → despachos → Settings → Environment Variables</b> (las sacás de tu aplicación en developers.mercadolibre.com.ar), redeployá, y volvé a "Conectar con Mercado Libre".</p>`));
  }

  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const redirect_uri = `https://${host}/api/ml-auth`;
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: cid, client_secret: secret, code, redirect_uri }),
    });
    const data = await r.json().catch(() => ({}));

    if (!data || !data.access_token) {
      return res.status(500).send(pagina("No salió",
        `<h2>No pude obtener el token</h2>
         <p>Mercado Libre respondió esto:</p><div class="box"><code>${JSON.stringify(data)}</code></div>
         <p>El código dura pocos minutos: volvé a tocar "Conectar con Mercado Libre" desde la app para generar uno nuevo.</p>`));
    }

    await kvSet("ml_tokens:" + empresa, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user_id,
      expira: Date.now() + ((data.expires_in || 21600) * 1000) - 60000,   // 1 minuto de margen
    });

    return res.status(200).send(pagina("¡Conectado!",
      `<h2>✅ ${empresa} conectada con Mercado Libre</h2>
       <p>Conectado como usuario #${data.user_id} (dueño de la cuenta o colaborador autorizado). Ya podés cerrar esta pestaña y volver a la app — en <b>Importar pedidos</b> vas a poder traer los pedidos de esta marca con un botón, sin subir etiquetas a mano.</p>`));
  } catch (e) {
    return res.status(500).send(pagina("Error",
      `<h2>Hubo un error</h2><div class="box"><code>${String(e && e.message || e)}</code></div>`));
  }
};
