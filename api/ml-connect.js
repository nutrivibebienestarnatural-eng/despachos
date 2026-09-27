// api/ml-connect.js — Paso 1: arranca la conexión con Mercado Libre para una marca puntual.
// Uso: abrir /api/ml-connect?empresa=nutrivibe (te manda a loguearte con ESA cuenta de ML
// y aceptar; Mercado Libre te devuelve solo a /api/ml-auth, que guarda el token).
//
// Cada marca que vende por Flex (Nutrivibe, Suplemundo, ...) vende desde su PROPIA cuenta
// de Mercado Libre, así que hay que conectar cada una por separado, una sola vez.
//
// Variables que hay que cargar en Vercel (de tu aplicación en developers.mercadolibre.com.ar):
//   ML_CLIENT_ID
//
// La "URL de redirect" de esa aplicación en Mercado Libre tiene que ser EXACTAMENTE:
//   https://<tu-deploy>.vercel.app/api/ml-auth

module.exports = async (req, res) => {
  const empresa = ((req.query && req.query.empresa) || "").trim();
  if (!empresa) return res.status(400).send("Falta ?empresa=nombre (ej: /api/ml-connect?empresa=nutrivibe)");

  const cid = process.env.ML_CLIENT_ID;
  if (!cid) return res.status(500).send("Falta configurar ML_CLIENT_ID en Vercel → Settings → Environment Variables.");

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirect_uri = `https://${host}/api/ml-auth`;
  const url = "https://auth.mercadolibre.com.ar/authorization"
    + "?response_type=code"
    + "&client_id=" + encodeURIComponent(cid)
    + "&redirect_uri=" + encodeURIComponent(redirect_uri)
    + "&state=" + encodeURIComponent(empresa);

  res.writeHead(302, { Location: url });
  res.end();
};
