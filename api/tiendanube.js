// api/tn-auth.js — Ayudante para sacar el access_token de Tienda Nube (una sola vez).
// Cuando instalás tu app en la tienda, Tienda Nube te manda acá con ?code=...
// y este archivo lo cambia por el token y te lo muestra para copiarlo a Vercel.
//
// Variables que hay que cargar en Vercel (las sacás de tu app en el Portal de Socios):
//   TN_CLIENT_ID
//   TN_CLIENT_SECRET

const TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

function pagina(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.55;color:#111}
.box{background:#f5f5f7;border-radius:14px;padding:16px;margin:14px 0}
code{display:block;background:#111;color:#25e06a;padding:10px 12px;border-radius:8px;word-break:break-all;font-size:15px;margin-top:4px}
.k{font-weight:700;margin-top:14px}h2{font-size:22px}</style></head><body>${body}</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const code = req.query && req.query.code;

  if (!code) {
    return res.status(400).send(pagina("Falta el código",
      `<h2>Falta el código de instalación</h2>
       <p>Entrá primero a <b>instalar tu app</b> en Tienda Nube. Cuando toques "Aceptar", te va a traer de vuelta a esta página automáticamente y ahí aparece el token.</p>`));
  }

  const cid = process.env.TN_CLIENT_ID, secret = process.env.TN_CLIENT_SECRET;
  if (!cid || !secret) {
    return res.status(500).send(pagina("Falta configurar",
      `<h2>Falta cargar TN_CLIENT_ID y TN_CLIENT_SECRET</h2>
       <p>Cargá esas dos variables en <b>Vercel → despachos → Settings → Environment Variables</b> (las sacás de tu app en el Portal de Socios), <b>redeployá</b>, y volvé a instalar la app.</p>`));
  }

  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: cid, client_secret: secret, grant_type: "authorization_code", code }),
    });
    const data = await r.json().catch(() => ({}));

    if (!data || !data.access_token) {
      return res.status(500).send(pagina("No salió",
        `<h2>No pude obtener el token</h2>
         <p>Tienda Nube respondió esto:</p><div class="box"><code>${JSON.stringify(data)}</code></div>
         <p>El código de instalación dura solo <b>5 minutos</b>. Desinstalá la app y volvé a instalarla para generar uno nuevo.</p>`));
    }

    return res.status(200).send(pagina("¡Token listo!",
      `<h2>✅ ¡Listo! Copiá estos dos valores</h2>
       <p>Andá a <b>Vercel → despachos → Settings → Environment Variables</b> y cargá (o actualizá) estas dos:</p>
       <div class="box">
         <div class="k">TN_TOKEN</div><code>${data.access_token}</code>
         <div class="k">TN_STORE_ID</div><code>${data.user_id}</code>
       </div>
       <p>Después <b>redeployá</b> y ya podés traer los pedidos desde la app. 🎉</p>
       <p style="color:#b00020"><b>Ojo:</b> no le saques captura ni compartas esta pantalla — el token es tu llave.</p>`));
  } catch (e) {
    return res.status(500).send(pagina("Error",
      `<h2>Hubo un error</h2><div class="box"><code>${String(e && e.message || e)}</code></div>`));
  }
};
