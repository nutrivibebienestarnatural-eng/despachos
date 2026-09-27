// api/_lib/kv.js — guardar/leer datos chiquitos entre llamadas, sin depender de Firebase.
// Hace falta para Mercado Libre: su refresh_token se gasta en cada uso (ML te da uno nuevo
// cada vez) y hay que guardarlo en algún lado que sobreviva entre una llamada y la otra —
// una función de Vercel no se acuerda de nada de una ejecución a la siguiente.
//
// Setup (una sola vez): Vercel → tu proyecto → Storage → Create Database → KV (Upstash Redis)
// → Connect to Project. Vercel carga solo KV_REST_API_URL y KV_REST_API_TOKEN, no hay que
// escribir nada a mano.
//
// Este archivo NO es un endpoint (el nombre empieza con "_" a propósito: Vercel lo ignora
// como ruta y solo lo usan otras funciones de /api con require).

async function kvCmd(cmd) {
  const base = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error("Falta conectar un Vercel KV Store a este proyecto (Storage → Create Database → KV).");
  const r = await fetch(base + "/pipeline", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify([cmd]),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(data)) throw new Error("Vercel KV respondió " + r.status + ": " + JSON.stringify(data));
  if (data[0] && data[0].error) throw new Error("Vercel KV: " + data[0].error);
  return data[0] && data[0].result;
}

async function kvGet(key) {
  const raw = await kvCmd(["GET", key]);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function kvSet(key, value) {
  await kvCmd(["SET", key, JSON.stringify(value)]);
}

module.exports = { kvGet, kvSet };
