// api/telegram-webhook.js — Bot de Telegram para verificar el pickeo con una foto.
// Flujo: la persona que arma pedidos le escribe al bot -> el bot le muestra los pedidos
// pendientes -> ella elige uno -> manda la foto del pedido armado -> Claude (con visión) la
// compara contra lo que ese pedido debía llevar, y el bot le contesta ahí mismo qué falta
// (si falta algo).
//
// Variables que hay que cargar en Vercel:
//   TELEGRAM_BOT_TOKEN        -> el mismo bot que ya usás para los avisos (api/telegram.js)
//   TELEGRAM_PICKEO_CHAT_IDS  -> chat IDs autorizados a usar este bot, separados por coma.
//                                Cada persona le escribe cualquier cosa al bot una vez, y con
//                                GET /api/telegram?chatid sacás su número para cargarlo acá.
//   ANTHROPIC_API_KEY         -> tu clave de la API de Claude (console.anthropic.com)
//
// Setup del webhook (una sola vez, reemplazando <TOKEN> por tu TELEGRAM_BOT_TOKEN y <DOMINIO>
// por tu dominio de Vercel) — pegar esta URL en la barra del navegador:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMINIO>/api/telegram-webhook
//
// Depende de que /api/telegram-sync ya haya recibido la lista de pedidos pendientes desde la
// app (lo hace sola con la app abierta) — si todavía no sincronizó, el bot lo avisa.

const Anthropic = require("@anthropic-ai/sdk");
const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");
const { z } = require("zod");
const { kvGet, kvSet } = require("./_lib/kv");

const MODEL = "claude-sonnet-5";

// Telegram con parse_mode HTML rechaza el mensaje entero si el texto tiene "<", ">" o "&" sueltos
// (por ejemplo, un nombre de cliente con esos caracteres) — escapo lo que viene de datos.
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const Veredicto = z.object({
  etiqueta_coincide: z.boolean().describe("false SOLO si hay una etiqueta de envío visible y legible que dice claramente OTRO nombre de cliente (no este); true si coincide, o si no hay etiqueta visible, o no se alcanza a leer bien"),
  cliente_en_etiqueta: z.string().describe("el nombre que se lee en la etiqueta de envío, tal cual impreso (vacío si no hay etiqueta visible o no se lee)"),
  completo: z.boolean().describe("true si lo que se ve en la foto coincide con lo que el pedido debía llevar"),
  faltantes: z.array(z.object({
    producto: z.string(),
    esperado: z.number(),
    detectado: z.number(),
  })).describe("productos de los que hay MENOS unidades visibles que las esperadas (vacío si no falta nada)"),
  sobrantes: z.array(z.object({
    producto: z.string(),
    detectado: z.number(),
  })).describe("productos visibles en la foto que NO estaban en el pedido (vacío si no hay ninguno)"),
  comentario: z.string().describe("una frase corta y clara en español rioplatense para la persona que armó el pedido"),
});

const VeredictoAuto = z.object({
  pedido_id: z.string().nullable().describe("el id EXACTO (tal cual aparece en la lista) del pedido que más corresponde a esta foto, según el nombre en la etiqueta de envío visible y/o los productos — null si ninguno coincide con una confianza razonable"),
  cliente_detectado: z.string().describe("el nombre de cliente que se lee en la etiqueta de envío de la foto, tal cual aparece impreso (vacío si no se alcanza a leer ninguna etiqueta)"),
  completo: z.boolean().describe("true si lo que se ve en la foto coincide con lo que ese pedido debía llevar (solo tiene sentido si pedido_id no es null)"),
  faltantes: z.array(z.object({
    producto: z.string(),
    esperado: z.number(),
    detectado: z.number(),
  })),
  sobrantes: z.array(z.object({
    producto: z.string(),
    detectado: z.number(),
  })),
  comentario: z.string().describe("una frase corta y clara en español rioplatense para la persona que armó el pedido"),
});

function chatsAutorizados() {
  return String(process.env.TELEGRAM_PICKEO_CHAT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
}

// Solo vos (el encargado) podés corregir un pedido desde el bot — Claudia puede armar y avisar,
// pero no reescribir qué debía llevar cada pedido. Se identifica por chat id, no por nombre.
function esAdmin(chatId) {
  const id = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  return !!id && String(chatId) === id;
}

async function tg(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

function enviarTexto(chatId, texto, teclado) {
  const body = { chat_id: chatId, text: texto, parse_mode: "HTML" };
  if (teclado) body.reply_markup = { inline_keyboard: teclado };
  return tg("sendMessage", body);
}

// Menú fijo de botones, siempre visible abajo del chat — no hace falta escribir nada.
// Un mensaje no puede tener a la vez teclado fijo (reply_markup keyboard) y botones inline
// sobre el mensaje mismo; por eso se manda suelto, una vez, y Telegram lo deja puesto.
function enviarMenuPrincipal(chatId) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: "Elegí una opción, o mandame directamente una foto 📷",
    reply_markup: {
      keyboard: [[{ text: "📅 Hoy" }, { text: "📦 A preparar" }], [{ text: "🔍 Chequear un pedido" }]],
      resize_keyboard: true,
    },
  });
}

async function pedidosPendientes() {
  const arr = await kvGet("pending_orders");
  return Array.isArray(arr) ? arr : [];
}

async function pedidosPreparadosRecientes() {
  const arr = await kvGet("prepared_recent");
  return Array.isArray(arr) ? arr : [];
}

// Lo saca YA de la lista de pendientes en cuanto la IA confirma que quedó completo — sin esto,
// hasta que la app no sincroniza de vuelta (unos segundos), seguiría apareciendo en /pedidos.
async function quitarDePendientes(pedidoId) {
  try {
    const pend = await pedidosPendientes();
    const quedan = pend.filter(p => p.id !== pedidoId);
    if (quedan.length !== pend.length) await kvSet("pending_orders", quedan);
  } catch (e) { console.error("quitarDePendientes:", e); }
}

// /hoy — resumen consolidado de todo lo que hay que juntar hoy, sumando todos los pedidos
// pendientes (mismo criterio que la "Lista de pickeo" de la app), en tono bien relajado.
async function mostrarResumenHoy(chatId) {
  const pend = await pedidosPendientes();
  if (!pend.length) {
    await enviarTexto(chatId, "🎉 Posta que no hay nada pendiente ahora, Claudia — tranqui, no hay nada para buscar.");
    return;
  }
  const totales = {};
  pend.forEach(p => (p.items || []).forEach(i => { totales[i.nombre] = (totales[i.nombre] || 0) + (i.cant || 0); }));
  const lista = Object.entries(totales).map(([nombre, cant]) => `• ${cant}x ${esc(nombre)}`).join("\n");
  const totalUnidades = Object.values(totales).reduce((s, n) => s + n, 0);
  await enviarTexto(chatId,
    `👋 Hasta ahora tenés que buscar esto (entre los ${pend.length} pedido${pend.length === 1 ? "" : "s"} pendientes, ${totalUnidades} unidades en total):\n\n${lista}\n\n` +
    `Cuando lo tengas todo, armamos pedido por pedido — tocá /pedidos.`,
    [[{ text: "📦 Ver pedidos", callback_data: "lista" }]]);
}

async function mostrarLista(chatId) {
  const pend = await pedidosPendientes();
  if (!pend.length) return enviarTexto(chatId, "🎉 No hay pedidos pendientes de preparar en este momento.");
  const botones = pend.slice(0, 30).map(p => ([{
    text: `${p.cliente || "—"} · ${(p.items || []).reduce((s, i) => s + (i.cant || 0), 0)} u.`,
    callback_data: "p:" + p.id,
  }]));
  return enviarTexto(chatId, "📦 Elegí el pedido que armaste:", botones);
}

async function descargarFotoBase64(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rf = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const df = await rf.json();
  if (!df.ok) throw new Error("No pude obtener el archivo de Telegram: " + JSON.stringify(df));
  const path = df.result.file_path;
  const rimg = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  const buf = Buffer.from(await rimg.arrayBuffer());
  const mediaType = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
  return { base64: buf.toString("base64"), mediaType };
}

async function verificarConIA(pedido, fotoBase64, mediaType) {
  const client = new Anthropic();   // toma ANTHROPIC_API_KEY del entorno
  const listaEsperada = (pedido.items || []).map(i => `${i.cant}x ${i.nombre}`).join("\n") || "(sin productos cargados)";
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: fotoBase64 } },
        {
          type: "text", text:
            `Esta foto debería ser el pedido de "${pedido.cliente || "—"}", ya armado, listo para despachar.\n\n` +
            `Primero: si hay una etiqueta de envío visible y se lee el nombre del destinatario, fijate si coincide con "${pedido.cliente || "—"}" ` +
            `— si dice claramente OTRO nombre, marcalo (puede ser que se mezcló con otro pedido). Si no hay etiqueta visible o no se lee bien, no lo marques como error.\n\n` +
            `Después: lo que ESTE pedido debía llevar:\n${listaEsperada}\n\n` +
            `Mirá los frascos/cajas visibles en la foto y contralos contra esa lista. ` +
            `Si algún producto no se ve con claridad (tapado, de espaldas, etc.), no lo des por sentado como faltante: ` +
            `decilo en el comentario en vez de marcarlo como faltante. Respondé solo con el resultado de la comparación.`,
        },
      ],
    }],
    output_config: { format: zodOutputFormat(Veredicto) },
  });
  return response.parsed_output;
}

async function detectarYVerificarConIA(pendientes, fotoBase64, mediaType) {
  const client = new Anthropic();
  const lista = pendientes.map(p =>
    `id: ${p.id} | cliente: ${p.cliente || "—"} | productos: ${(p.items || []).map(i => `${i.cant}x ${i.nombre}`).join(", ") || "(sin productos cargados)"}`
  ).join("\n");
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: fotoBase64 } },
        {
          type: "text", text:
            `Esta es una foto de un pedido de suplementos ya armado, listo para despachar. Puede tener una etiqueta de envío visible con el nombre del cliente.\n\n` +
            `Pedidos pendientes de preparar hoy (elegí cuál de estos corresponde a la foto, por el nombre de la etiqueta y/o los productos visibles):\n${lista}\n\n` +
            `Devolvé el id EXACTO del pedido que corresponda (tal cual aparece arriba, después de "id: "), o null si ninguno coincide con confianza razonable. ` +
            `Después, comparando contra lo que ESE pedido debía llevar, contá los frascos/cajas visibles. ` +
            `Si algún producto no se ve con claridad, no lo des por sentado como faltante: decilo en el comentario en vez de marcarlo como faltante.`,
        },
      ],
    }],
    output_config: { format: zodOutputFormat(VeredictoAuto) },
  });
  return response.parsed_output;
}

// Deja la foto + veredicto en una cola en KV para que la app (abierta en el navegador) la
// levante y la guarde en el pedido — igual que si alguien hubiera subido esa foto a mano
// (aparece sola en Control, con el mismo botón "OK" / "Reportar problema" de siempre).
async function guardarFotoParaLaApp(pedido, base64, mediaType, veredicto) {
  try {
    const completo = esCompleto(veredicto);
    const cola = (await kvGet("telegram_fotos_pendientes")) || [];
    cola.push({
      pedidoId: pedido.id,
      foto: `data:${mediaType};base64,${base64}`,
      veredicto: veredicto ? formatearVeredicto(veredicto, pedido.cliente).replace(/<\/?b>/g, "") : "",
      completo,   // si la IA dio todo OK, la app avanza el pedido solo a "Preparado" (y descuenta stock)
      ts: Date.now(),
    });
    await kvSet("telegram_fotos_pendientes", cola.slice(-30));   // tope de seguridad
  } catch (e) { console.error("guardarFotoParaLaApp:", e); /* si falla, igual ya le contestamos a la persona */ }
}

function esCompleto(v) {
  return !!(v && v.completo && !v.faltantes.length && !v.sobrantes.length && v.etiqueta_coincide !== false);
}

function formatearVeredicto(v, cliente) {
  if (!v) return "⚠ No pude leer bien la foto — probá con otra (que se vean todos los frascos, con buena luz).";
  cliente = esc(cliente);
  if (v.etiqueta_coincide === false) {
    return `🚨 Ojo — la etiqueta de esta foto dice <b>${esc(v.cliente_en_etiqueta) || "otro nombre"}</b>, no ${cliente}. ` +
      `¿Se mezcló con otro pedido? Fijate bien antes de seguir.`;
  }
  if (esCompleto(v)) {
    return `✅ Por ahora está todo bien con el pedido de <b>${cliente}</b>. ${esc(v.comentario) || ""}`.trim();
  }
  let out = `⚠ Revisá el pedido de <b>${cliente}</b>:\n`;
  v.faltantes.forEach(f => { out += `• Falta ${f.esperado - f.detectado}x ${esc(f.producto)} (contás ${f.detectado} de ${f.esperado})\n`; });
  v.sobrantes.forEach(s => { out += `• De más: ${s.detectado}x ${esc(s.producto)} (no estaba en el pedido)\n`; });
  if (v.comentario) out += `\n${esc(v.comentario)}`;
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(200).json({ ok: true });   // Telegram solo llama con POST
  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const autorizados = chatsAutorizados();

    // 1) Tocó un botón: eligió un pedido, o pidió ver la lista de nuevo
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message.chat.id);
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      if (!autorizados.includes(chatId)) return res.status(200).json({ ok: true });
      if (cq.data === "lista") { await mostrarLista(chatId); return res.status(200).json({ ok: true }); }

      // Avisar al resto de la gente autorizada (el encargado) que una cantidad no cierra — típico
      // síntoma de un pack mal aprendido en Stock, que multiplica de más un producto que en este
      // pedido va suelto. No cambia nada del pedido, solo manda el aviso.
      const mFlag = /^flag:(.+)$/.exec(cq.data || "");
      if (mFlag) {
        const combinados = (await pedidosPendientes()).concat(await pedidosPreparadosRecientes());
        const pedido = combinados.find(p => p.id === mFlag[1]);
        const detalle = pedido ? (pedido.items || []).map(i => `${i.cant}x ${esc(i.nombre)}`).join(", ") : "";
        const texto = `🚩 Aviso desde el pickeo: el pedido de <b>${esc(pedido ? pedido.cliente : "—")}</b>` +
          (detalle ? ` pide llevar ${detalle} y la cantidad no cierra.` : ` tiene una cantidad que no cierra.`) +
          ` Puede ser un pack mal aprendido — revisá Stock → Packs aprendidos.`;
        const otros = autorizados.filter(a => a !== chatId);
        for (const otro of otros) await enviarTexto(otro, texto);
        await enviarTexto(chatId, otros.length ? "👍 Avisado — ya le llegó al encargado." : "Anotado, pero no hay otro número autorizado a quien avisarle todavía.");
        return res.status(200).json({ ok: true });
      }

      // Corregir qué debía llevar un pedido — solo para el encargado (ver esAdmin). El bot no puede
      // escribir en Firestore, así que la corrección queda en una cola (KV) hasta que la app, abierta
      // en el navegador con la sesión real, la aplique — mismo mecanismo que las fotos del pickeo.
      const mCorregir = /^corregir:(.+)$/.exec(cq.data || "");
      if (mCorregir) {
        if (!esAdmin(chatId)) return res.status(200).json({ ok: true });
        const combinados = (await pedidosPendientes()).concat(await pedidosPreparadosRecientes());
        const pedido = combinados.find(p => p.id === mCorregir[1]);
        if (!pedido) { await enviarTexto(chatId, "No encuentro ese pedido — puede que ya haya cambiado. Mandá /pedidos de nuevo."); return res.status(200).json({ ok: true }); }
        await kvSet("telegram_correccion_espera:" + chatId, { pedidoId: pedido.id, cliente: pedido.cliente || "", ts: Date.now() });
        await enviarTexto(chatId,
          `✏️ Mandame la lista corregida para <b>${esc(pedido.cliente || "—")}</b>, un producto por línea, así:\n<code>4x Inulina - Prebiotico Natural (60 capsulas)\n1x Glicinato de Magnesio</code>\n\n` +
          `Esto reemplaza TODO lo que este pedido debía llevar. Mandá "cancelar" si te arrepentís.`);
        return res.status(200).json({ ok: true });
      }

      const m = /^p:(.+)$/.exec(cq.data || "");
      if (!m) return res.status(200).json({ ok: true });
      const pend = await pedidosPendientes();
      const pedido = pend.find(p => p.id === m[1]);
      if (!pedido) {
        await enviarTexto(chatId, "Ese pedido ya no está pendiente (¿ya lo preparaste?). Mandá /pedidos para ver la lista actualizada.");
        return res.status(200).json({ ok: true });
      }
      await kvSet("telegram_wait:" + chatId, { pedidoId: pedido.id, ts: Date.now() });
      const lista = (pedido.items || []).map(i => `• ${i.cant}x ${esc(i.nombre)}`).join("\n") || "(sin productos cargados)";
      const botonesPedido = [[{ text: "⚠️ Esta cantidad no me cierra", callback_data: "flag:" + pedido.id }]];
      if (esAdmin(chatId)) botonesPedido.push([{ text: "✏️ Corregir este pedido", callback_data: "corregir:" + pedido.id }]);
      await enviarTexto(chatId,
        `🧺 <b>Andá a buscar esto para ${esc(pedido.cliente || "—")}:</b>\n${lista}\n\n` +
        `📷 Cuando lo armes, mandame la foto del pedido acá mismo.`,
        botonesPedido);
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });
    const chatId = String(msg.chat.id);

    if (!autorizados.length) {
      await enviarTexto(chatId, "Este bot todavía no está configurado (falta TELEGRAM_PICKEO_CHAT_IDS en Vercel). Avisale al encargado.");
      return res.status(200).json({ ok: true });
    }
    if (!autorizados.includes(chatId)) {
      await enviarTexto(chatId, `Tu chat todavía no está autorizado. Pasale este número al encargado para que te habilite: <code>${chatId}</code>`);
      return res.status(200).json({ ok: true });
    }

    // 2) Mandó una foto
    if (msg.photo && msg.photo.length) {
      // ¿Está en modo "Chequear un pedido"? Compara contra pendientes + ya preparados (últimas
      // 24hs) — sirve para releer algo que YA se armó, por si en realidad tenía un error.
      if (await kvGet("telegram_checkmode:" + chatId)) {
        await kvSet("telegram_checkmode:" + chatId, null);
        const combinados = (await pedidosPendientes()).concat(await pedidosPreparadosRecientes());
        if (!combinados.length) {
          await enviarTexto(chatId, "No tengo pedidos para comparar (ni pendientes ni preparados recientes) — abrí la app un momento y probá de nuevo.");
          return res.status(200).json({ ok: true });
        }
        await enviarTexto(chatId, "🔍 Comparando la foto…");
        const mejorChk = msg.photo[msg.photo.length - 1];
        const { base64: b64chk, mediaType: mtchk } = await descargarFotoBase64(mejorChk.file_id);
        const vChk = await detectarYVerificarConIA(combinados, b64chk, mtchk);
        const pedChk = combinados.find(p => p.id === vChk.pedido_id);
        if (!pedChk) {
          const leido = vChk.cliente_detectado ? ` (leí algo como "${esc(vChk.cliente_detectado)}" en la etiqueta)` : "";
          await enviarTexto(chatId, `🤔 No reconocí de qué pedido es esta foto${leido}. Probá con otra foto donde se vea bien la etiqueta.`);
        } else if (esCompleto(vChk)) {
          await enviarTexto(chatId, `✅ Repasé el pedido de <b>${esc(pedChk.cliente || "—")}</b> — está todo bien, tranqui.`);
        } else {
          const yaPreparado = pedChk.estado && pedChk.estado !== "pendiente";
          const encabezado = yaPreparado
            ? `😬 Fijate el pedido de <b>${esc(pedChk.cliente || "—")}</b>, parece que te equivocaste:\n\n`
            : "";
          await enviarTexto(chatId, encabezado + formatearVeredicto(vChk, pedChk.cliente));
        }
        return res.status(200).json({ ok: true });
      }

      const pend = await pedidosPendientes();
      if (!pend.length) {
        await enviarTexto(chatId, "No hay pedidos pendientes cargados ahora — abrí la app un momento para que sincronice, y volvé a mandar la foto.");
        return res.status(200).json({ ok: true });
      }
      const espera = await kvGet("telegram_wait:" + chatId);
      const mejor = msg.photo[msg.photo.length - 1];   // la de mayor resolución
      const { base64, mediaType } = await descargarFotoBase64(mejor.file_id);

      let pedido = espera && pend.find(p => p.id === espera.pedidoId);
      let veredicto, aviso = "";

      if (pedido) {
        // ya había elegido el pedido con /pedidos: comparación directa, más rápida
        await enviarTexto(chatId, "🔍 Revisando la foto…");
        veredicto = await verificarConIA(pedido, base64, mediaType);
      } else {
        // no eligió nada antes: que la IA detecte solo de qué pedido es, por la etiqueta
        await enviarTexto(chatId, "🔍 Buscando de qué pedido es esta foto…");
        veredicto = await detectarYVerificarConIA(pend, base64, mediaType);
        pedido = pend.find(p => p.id === veredicto.pedido_id);
        if (!pedido) {
          const leido = veredicto.cliente_detectado ? ` (leí algo como "${esc(veredicto.cliente_detectado)}" en la etiqueta, pero no coincide con ningún pendiente)` : "";
          await enviarTexto(chatId, `🤔 No pude reconocer con seguridad de qué pedido es esta foto${leido}. Mandá /pedidos y elegí el pedido antes de mandar la foto.`);
          return res.status(200).json({ ok: true });
        }
        aviso = `🔎 Detecté que es el pedido de <b>${esc(pedido.cliente || "—")}</b>.\n\n`;
      }

      if (esCompleto(veredicto)) {
        await enviarTexto(chatId, aviso + formatearVeredicto(veredicto, pedido.cliente),
          [[{ text: "➡️ Siguiente pedido", callback_data: "lista" }]]);
        await kvSet("telegram_wait:" + chatId, null);   // este pedido ya quedó resuelto: no lo arrastro a la próxima foto
        await quitarDePendientes(pedido.id);
      } else {
        // algo no coincide: NO se ofrece pasar a otro pedido — se re-arma el mismo, hasta que
        // la foto corregida dé bien (o alguien lo revise a mano en Control).
        await kvSet("telegram_wait:" + chatId, { pedidoId: pedido.id, ts: Date.now() });
        const botonesIncompleto = [[{ text: "⚠️ La cantidad esperada no me cierra", callback_data: "flag:" + pedido.id }]];
        if (esAdmin(chatId)) botonesIncompleto.push([{ text: "✏️ Corregir este pedido", callback_data: "corregir:" + pedido.id }]);
        await enviarTexto(chatId, aviso + formatearVeredicto(veredicto, pedido.cliente) +
          `\n\n🔧 Corregí el pedido de <b>${esc(pedido.cliente || "—")}</b> y mandame la foto de nuevo antes de seguir con otro.`,
          botonesIncompleto);
      }
      await guardarFotoParaLaApp(pedido, base64, mediaType, veredicto);
      return res.status(200).json({ ok: true });
    }

    // 2.5) ¿Está esperando que mandes la lista corregida de un pedido? (solo admin, ver esAdmin)
    if (esAdmin(chatId) && msg.text) {
      const esperaCorreccion = await kvGet("telegram_correccion_espera:" + chatId);
      if (esperaCorreccion) {
        const textoOriginal = String(msg.text || "").trim();
        if (/^cancelar$/i.test(textoOriginal)) {
          await kvSet("telegram_correccion_espera:" + chatId, null);
          await enviarTexto(chatId, "👍 Cancelado, no cambié nada.");
          return res.status(200).json({ ok: true });
        }
        const lineas = textoOriginal.split("\n").map(l => l.trim()).filter(Boolean);
        const items = lineas.map(l => {
          const m = /^(\d+)\s*[xX]\s*(.+)$/.exec(l);
          return m ? { cant: parseInt(m[1], 10) || 1, nombre: m[2].trim() } : { cant: 1, nombre: l };
        });
        if (!items.length) {
          await enviarTexto(chatId, "No entendí ningún producto — mandalo como \"2x nombre del producto\", uno por línea, o \"cancelar\".");
          return res.status(200).json({ ok: true });
        }
        const cola = (await kvGet("telegram_correcciones_pendientes")) || [];
        cola.push({ pedidoId: esperaCorreccion.pedidoId, cliente: esperaCorreccion.cliente || "", items, ts: Date.now() });
        await kvSet("telegram_correcciones_pendientes", cola.slice(-30));
        await kvSet("telegram_correccion_espera:" + chatId, null);
        const resumen = items.map(i => `• ${i.cant}x ${esc(i.nombre)}`).join("\n");
        await enviarTexto(chatId,
          `✅ Corrección guardada para <b>${esc(esperaCorreccion.cliente || "—")}</b>:\n${resumen}\n\n` +
          `Se aplica sola apenas la app esté abierta (unos segundos) — después Claudia ya ve la lista corregida.`);
        return res.status(200).json({ ok: true });
      }
    }

    // 3) Texto / comando (incluye los botones del menú fijo, que mandan su propio texto)
    const texto = String(msg.text || "").trim().toLowerCase();
    if (texto === "/start") {
      await enviarMenuPrincipal(chatId);
      await mostrarLista(chatId);
    } else if (texto === "/pedidos" || texto === "pedidos" || texto === "📦 a preparar") {
      await mostrarLista(chatId);
    } else if (texto === "/hoy" || texto === "hoy" || texto === "📅 hoy") {
      await mostrarResumenHoy(chatId);
    } else if (texto === "/chequear" || texto === "🔍 chequear un pedido") {
      await kvSet("telegram_checkmode:" + chatId, true);
      await enviarTexto(chatId, "📷 Mandame la foto del pedido que querés chequear (puede ser uno que ya diste por armado).");
    } else {
      // cualquier saludo u otra cosa que no reconozco: le muestro el menú de nuevo, así nunca
      // queda sin saber qué tocar (no hace falta que sepa escribir /start ni ningún comando).
      await enviarMenuPrincipal(chatId);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("telegram-webhook:", e);
    return res.status(200).json({ ok: true });   // siempre 200 a Telegram, si no reintenta en bucle
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: "2mb" } } };
