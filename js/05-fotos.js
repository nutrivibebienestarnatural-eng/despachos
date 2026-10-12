/* ============================================================
   05-fotos — Fotos de pedidos, lectura de QR y carpeta Ventas vigilada
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
function fotoChica(dataUrl, max, calidad, limiteKB){ return new Promise((res,rej)=>{
  const img=new Image();
  img.onload=()=>{ const k=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.width*k)); c.height=Math.max(1,Math.round(img.height*k));
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    let q=calidad, d=c.toDataURL("image/jpeg",q);
    while(d.length>limiteKB*1024 && q>0.2){ q-=0.08; d=c.toDataURL("image/jpeg",q); }
    res(d); };
  img.onerror=()=>rej(new Error("No se pudo leer la imagen")); img.src=dataUrl; }); }
async function guardarFotoGrande(pedidoId, dataUrl){
  try{
    if(DB.modo==="firebase"){
      const col=firebase.firestore().collection("fotos");
      const ref=await col.add({pedidoId, data:dataUrl, ts:Date.now()});
      return ref.id;
    }
    localStorage.setItem("foto_"+pedidoId, dataUrl); return "local:"+pedidoId;
  }catch(e){ console.warn("foto grande:", e); return ""; }
}
async function leerFotoGrande(docId){
  try{
    if(!docId) return "";
    if(docId.startsWith("local:")) return localStorage.getItem("foto_"+docId.slice(6))||"";
    const d=await firebase.firestore().collection("fotos").doc(docId).get();
    return d.exists?(d.data().data||""):"";
  }catch(e){ console.warn("foto grande:", e); return ""; }
}
/* Guarda la foto de un pedido: miniatura adentro del pedido + foto grande aparte. Devuelve la miniatura. */
async function guardarFotoPedido(id, dataUrl){
  const mini=await fotoChica(dataUrl, 600, 0.55, 90);          // ~60-90 KB: entra siempre
  const docId=await guardarFotoGrande(id, dataUrl);
  // cada foto nueva (o reemplazada) queda "sin revisar" hasta que el admin la mire en Control
  await DB.update(id, {fotoPrep:mini, fotoPrepTs:Date.now(), fotoDoc:docId||"", fotoRevisada:false});
  return mini;
}
async function adjuntarFotoPedido(id,file){
  if(!file) return;
  try{
    toast("Subiendo foto…");
    const foto=await comprimirFoto(file);
    const mini=await guardarFotoPedido(id, foto);
    telegramPedido(PEDIDOS.find(x=>x.id===id),foto,"📷 PEDIDO CON FOTO",[]); toast("Foto del pedido guardada 📷"); refrescarFoto(id,{fotoPrep:mini, fotoPrepTs:Date.now()});
  }catch(e){ console.error(e); notify("No se pudo guardar la foto: "+(e.message||e)); }
}
async function borrarFotoPedido(id){
  if(!await askConfirm("¿Borrar la foto de este pedido?")) return;
  await DB.update(id,{fotoPrep:"", fotoPrepTs:null, fotoDoc:""}); toast("Foto borrada"); refrescarFoto(id,{fotoPrep:"", fotoPrepTs:null});
}
/* El admin revisa la foto que subió la empleada y la da por buena. Si el pedido todavía estaba
   pendiente (por ejemplo, el bot de Telegram detectó algo raro y no lo avanzó solo), el OK
   también lo marca Preparado — así queda guardado de una, sin que siga apareciendo como pendiente. */
async function marcarFotoRevisada(id){
  const p=PEDIDOS.find(x=>x.id===id);
  if(p && p.estado==="pendiente") await avanzar(id,"preparado","Preparado · OK al revisar la foto en Control",{fotoRevisada:true});
  else await DB.update(id,{fotoRevisada:true});
  toast("Foto revisada ✓");
  vistaControl();
}
/* Doble chequeo del admin sobre un pedido ya preparado (aparte de lo que haya dicho la IA) —
   solo deja constancia visual de que vos lo miraste y está bien, no cambia el estado del pedido. */
async function marcarRevisadoAdmin(id){
  await DB.update(id,{revisadoAdmin:true, revisadoAdminTs:Date.now()});
  toast("Pedido revisado ✓");
  vistaControl();
}
/* Si al revisar la foto ves que el contenido de la caja está mal (no la foto en sí), esto lo manda
   a "Con problema" — mismo mecanismo que "Algo no coincide" durante el despacho. */
async function reportarProblemaFoto(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const nota=prompt("¿Qué está mal? (ej: faltó 1 Hierro Bisglicinato, la foto no corresponde)","");
  if(nota===null || !nota.trim()) return;
  await DB.update(id,{despachoAviso:true, despachoAvisoVisto:false, despachoAvisoTs:Date.now(), despachoAvisoTxt:[nota.trim()], fotoRevisada:true});
  telegramPedido(p, p.fotoPrep, "🚨 PROBLEMA DETECTADO AL REVISAR LA FOTO", [nota.trim()]);
  toast("⚠ Reportado — aparece en Con problema");
  vistaControl();
}
/* Canal de envío editable directo desde la revisión: Pickit / Cadete (Cardinal-Claudia) / Correo.
   Así se chequea junto con la foto en el mismo lugar, sin ir a otra pantalla. */
function envioActual(p){ return p.pickit?"pickit":(p.metodo==="cadete"?(p.cadete==="Claudia"?"claudia":"cardinal"):"correo"); }
async function corregirCanalEnvio(id,val){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id); if(!p) return;
  if(val==="pickit") await DB.update(id,{pickit:true});
  else if(val==="cardinal"||val==="claudia") await DB.update(id,{pickit:false, metodo:"cadete", cadete:val==="claudia"?"Claudia":"Cardinal", correo:""});
  else await DB.update(id,{pickit:false, metodo:"correo", cadete:"", correo:p.canal==="ml_flex"?"Punto de Despacho":(p.correo||"Correo Argentino")});
  toast("Canal de envío actualizado");
  vistaControl();
}
function selectCanalEnvio(p){
  const v=envioActual(p);
  return `<select onchange="corregirCanalEnvio('${p.id}',this.value)" style="max-width:190px;font-size:12.5px">
    <option value="pickit" ${v==="pickit"?'selected':''}>📦 Pickit</option>
    <option value="cardinal" ${v==="cardinal"?'selected':''}>🚴 Cardinal</option>
    <option value="claudia" ${v==="claudia"?'selected':''}>🚴 Claudia</option>
    <option value="correo" ${v==="correo"?'selected':''}>📮 Correo</option>
  </select>`;
}
/* Para el primer día de esta función: todo pedido con foto ya cargada aparece "sin revisar" porque
   el campo es nuevo. Este botón limpia de una el pendiente acumulado (solo dentro del filtro actual
   de fecha/empresa) para arrancar al día. */
async function marcarTodasRevisadas(){
  const peds=ctlPedidos().filter(p=>p.fotoPrep && !p.fotoRevisada);
  if(!peds.length) return;
  if(!await askConfirm("¿Marcar como revisadas las "+peds.length+" fotos de esta lista?")) return;
  for(const p of peds){
    if(p.estado==="pendiente") await avanzar(p.id,"preparado","Preparado · OK al revisar la foto en Control",{fotoRevisada:true});
    else await DB.update(p.id,{fotoRevisada:true});
  }
  toast(peds.length+" fotos marcadas ✓");
  vistaControl();
}
/* Habilita un pedido para que el bot de Telegram se lo muestre a Claudia — hasta acá, aunque esté
   pendiente, sincronizarPedidosTelegram() no lo manda (queda esperando tu OK). */
async function aprobarParaTelegram(id){
  await DB.update(id,{telegramAprobado:true});
  toast("Aprobado ✓ ya se lo puede mostrar el bot");
  vistaControl();
}
async function aprobarTodasParaTelegram(){
  const peds=ctlPedidos().filter(p=>p.estado==="pendiente" && !pedidoListoParaTelegram(p));
  if(!peds.length) return;
  if(!await askConfirm("¿Aprobar los "+peds.length+" pedidos de esta lista para que el bot se los muestre a Claudia?")) return;
  for(const p of peds) await DB.update(p.id,{telegramAprobado:true});
  toast(peds.length+" pedidos aprobados ✓");
  vistaControl();
}
// actualiza solo el bloque de la foto (sin redibujar la pantalla, así no se pierde lo que se está editando)
function refrescarFoto(id,patch){
  const p=PEDIDOS.find(x=>x.id===id); if(p) Object.assign(p,patch);
  document.querySelectorAll(`[data-foto="${id}"]`).forEach(el=>{ el.outerHTML=fotoPedidoHTML(p||{id,...patch}); });
}
async function verFotoPedido(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p||!p.fotoPrep) return;
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  if(p.fotoDoc){ leerFotoGrande(p.fotoDoc).then(g=>{ if(g){ const i=w.document.querySelector("img"); if(i) i.src=g; } }); }
  w.document.write(`<title>Foto pedido ${esc(numOrden(p))}</title><body style="margin:0;background:#111;color:#fff;font-family:sans-serif;text-align:center">
    <div style="padding:10px">${esc(p.cliente||"")} · N° ${esc(numOrden(p))} · ${fmt(p.fotoPrepTs)}</div>
    <img src="${p.fotoPrep}" style="max-width:100%;max-height:92vh"></body>`);
}
function fotoPedidoHTML(p){
  const input=`<input type="file" accept="image/*" capture="environment" style="display:none" onchange="adjuntarFotoPedido('${p.id}',this.files[0])">`;
  if(p.fotoPrep) return `<div data-foto="${p.id}" style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <img src="${p.fotoPrep}" onclick="verFotoPedido('${p.id}')" style="width:90px;height:90px;object-fit:cover;border-radius:10px;cursor:pointer;border:1px solid var(--border)">
      <div><div style="font-size:13px;font-weight:700">📷 Foto del pedido</div><div class="muted" style="font-size:12px">${fmt(p.fotoPrepTs)}</div>
        <div class="row" style="gap:6px;margin-top:6px"><label class="btn sm ghost" style="cursor:pointer">Cambiar${input}</label>
        <button class="btn sm ghost" style="color:var(--red)" onclick="borrarFotoPedido('${p.id}')">Borrar</button></div></div>
    </div>`;
  return `<label data-foto="${p.id}" class="btn sm ghost" style="cursor:pointer;margin-top:10px">📷 Subir / sacar foto del pedido${input}</label>`;
}
/* ===== Foto del pedido armado → detectar de quién es por el QR/código de la etiqueta ===== */
// Lee todos los códigos (QR / barras) que encuentre en la foto. Prueba la foto entera y recortes
// (la etiqueta suele ocupar solo una parte), primero con el lector nativo y después con ZXing.
async function leerCodigosDeFoto(file){
  const img=await new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const i=new Image();
    i.onload=()=>res(i); i.onerror=()=>rej(new Error("No se pudo leer la imagen")); i.src=u; });
  const W=img.naturalWidth, H=img.naturalHeight;
  const recortes=[[0,0,1,1],[0,.4,1,.6],[0,.5,1,.5],[0,0,1,.5],[.1,.55,.8,.3],[0,.25,1,.5]];
  const out=new Set();
  const canvasDe=(r,max)=>{ const sw=W*r[2], sh=H*r[3], k=Math.min(1,max/Math.max(sw,sh));
    const c=document.createElement("canvas"); c.width=Math.round(sw*k); c.height=Math.round(sh*k);
    c.getContext("2d").drawImage(img,W*r[0],H*r[1],sw,sh,0,0,c.width,c.height); return c; };
  // agranda un canvas SIN suavizado (para no emborronar los bordes de los módulos) — ayuda mucho
  // cuando el código sale chico dentro de la foto
  const agrandado=(c,escala)=>{ const c2=document.createElement("canvas"); c2.width=c.width*escala; c2.height=c.height*escala;
    const ctx2=c2.getContext("2d"); ctx2.imageSmoothingEnabled=false; ctx2.drawImage(c,0,0,c2.width,c2.height); return c2; };
  for(const r of recortes){
    const c=canvasDe(r,1600);
    // jsQR primero: en fotos reales (no escaneos limpios) encuentra el QR mucho más seguido que
    // ZXing o el BarcodeDetector nativo (probado contra etiquetas reales de despacho)
    if(typeof jsQR!=="undefined"){
      for(const cc of [c, agrandado(c,2)]){
        const ctx=cc.getContext("2d"); const id=ctx.getImageData(0,0,cc.width,cc.height);
        const res=jsQR(id.data,id.width,id.height,{inversionAttempts:"attemptBoth"});
        if(res && res.data){ out.add(res.data); break; }
      }
    }
    if(!out.size && "BarcodeDetector" in window){
      try{ const det=new BarcodeDetector(); (await det.detect(c)).forEach(x=>x.rawValue&&out.add(x.rawValue)); }catch(e){ logErr("auto",e); }
    }
    if(!out.size && typeof ZXing!=="undefined"){
      const hints=new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
      const intentar=async dataUrl=>{
        try{ const rd=new ZXing.BrowserQRCodeReader(hints); const res=await rd.decodeFromImageUrl(dataUrl); if(res) out.add(res.getText()); }catch(e){ logErr("auto",e); }
        if(!out.size){
          try{ const rd=new ZXing.BrowserMultiFormatReader(hints);
            const res=await rd.decodeFromImageUrl(dataUrl); if(res) out.add(res.getText()); }catch(e){ logErr("auto",e); }
        }
      };
      await intentar(c.toDataURL("image/png"));
      if(!out.size) await intentar(agrandado(c,2).toDataURL("image/png"));
    }
    if(out.size) break;
  }
  return [...out];
}
// N° de envío de ML de un pedido: el guardado, o sacado del PDF de la etiqueta (para pedidos viejos)
const ENVIO_CACHE={}, ETQ_TXT_CACHE={};
// Texto de la etiqueta PDF guardada en el pedido (ML o Correo/Tienda Nube), cacheado
async function textoEtiquetaPedido(p){
  if(!p.etiquetaPdf || typeof pdfjsLib==="undefined") return "";
  if(ETQ_TXT_CACHE[p.id]!=null) return ETQ_TXT_CACHE[p.id];
  let t="";
  try{ const bin=atob(p.etiquetaPdf); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const pdf=await pdfjsLib.getDocument({data:arr}).promise;
    for(let n=1;n<=Math.min(pdf.numPages,3);n++){ const tc=await (await pdf.getPage(n)).getTextContent(); t+=tc.items.map(x=>x.str).join(" ")+"\n"; }
  }catch(e){ logErr("auto",e); }
  ETQ_TXT_CACHE[p.id]=t; return t;
}
async function envioDePedido(p){
  if(p.envio) return String(p.envio);
  if(ENVIO_CACHE[p.id]!=null) return ENVIO_CACHE[p.id];
  const m=(await textoEtiquetaPedido(p)).match(/Envio:\s*(\d[\d ]{4,20}\d)/i);
  return ENVIO_CACHE[p.id]=m?m[1].replace(/\D/g,""):"";
}
/* Busca el pedido de la foto con lo que traiga el QR / código de barras:
   · ML:     {"id":"48028812120",...}           → N° de envío
   · Correo: "1978130CE9ICI21901|DOM|CORDOBA|5841|HC523871123" → código TN / seguimiento / CP
   Devuelve el pedido, o null. Si solo coincide el CP y hay un único pedido de correo con ese CP, lo devuelve con .porCP */
async function buscarPedidoPorCodigos(codigos){
  const nums=new Set(), toks=new Set(); let cp="";
  codigos.forEach(c=>{ const s=String(c);
    (s.match(/\d{6,}/g)||[]).forEach(n=>nums.add(n.replace(/^0+/,"")));
    s.split(/[|;,\s"{}:]+/).forEach(x=>{ x=x.trim().toUpperCase(); if(x.length>=8 && /[A-Z]/.test(x) && /\d/.test(x)) toks.add(x.replace(/AR$/,"")); });
    const mcp=s.match(/\|(\d{4})\|/); if(mcp) cp=mcp[1]; });
  if(!nums.size && !toks.size) return null;
  const cand=soloPedidos().filter(p=>p.estado!=="anulado").sort((a,b)=>(b.creado||0)-(a.creado||0));
  const orden=cand.filter(p=>p.estado==="pendiente"||p.estado==="preparado").concat(cand.filter(p=>!["pendiente","preparado"].includes(p.estado)));
  const d=s=>String(s||"").replace(/\D/g,"").replace(/^0+/,"");
  const up=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  // 1) N° de venta / orden largo
  let hit=cand.find(p=>{ const r=d(p.ref); return r.length>=6 && nums.has(r); });
  if(hit) return hit;
  // 2) seguimiento cargado en el pedido
  hit=orden.find(p=>{ const t=up(p.tracking).replace(/AR$/,""); return t.length>=8 && (toks.has(t)||nums.has(d(p.tracking))); });
  if(hit) return hit;
  // 3) N° de envío de ML, o códigos que aparezcan en el texto de la etiqueta guardada (Correo / TN)
  for(const p of orden){
    if(!p.envio && !p.etiquetaPdf) continue;
    const e=d(await envioDePedido(p)); if(e && nums.has(e)) return p;
    if(p.etiquetaPdf && toks.size){ const t=up(await textoEtiquetaPedido(p)); for(const k of toks){ if(t.includes(k)) return p; } }
  }
  // 4) último recurso: mismo código postal y un solo pedido de correo pendiente con ese CP
  if(cp){ const mismos=orden.filter(p=>["pendiente","preparado"].includes(p.estado) && p.metodo==="correo" && String(p.cp||"").slice(0,4)===cp);
    if(mismos.length===1){ mismos[0].porCP=true; return mismos[0]; } }
  return null;
}
/* Devuelve true si la foto quedó asignada y guardada, false si no (para que quien la llama
   sepa si tiene que darla por resuelta o dejarla marcada como pendiente de revisar). */
/* opts.silencioso=true (usado al procesar en lote desde la carpeta): no abre modales por cada foto
   (si hay 15 fotos fallidas, no tiene sentido apilar 15 carteles) — el motivo del fallo queda en el
   resultado para mostrarlo en la lista de errores. Devuelve {ok, motivo}. */
async function fotoDetectarPedido(file, opts){
  opts=opts||{};
  const aviso = opts.silencioso ? (()=>{}) : notify;
  if(!file) return {ok:false, motivo:"Sin archivo"};
  if(!opts.silencioso) toast("Buscando la etiqueta en la foto…");
  let codigos=[];
  try{ codigos=await leerCodigosDeFoto(file); }catch(e){ aviso(e.message||e); return {ok:false, motivo:"Error leyendo la foto: "+(e.message||e)}; }
  if(!codigos.length){ comprimirFoto(file).then(f=>enviarTelegram("❌ FOTO SIN ASIGNAR\n\nNo se pudo leer la etiqueta en la foto",f)).catch(()=>{}); aviso("No encontré ningún código QR ni de barras en la foto.\n\nProbá de nuevo con la etiqueta más cerca, derecha y con buena luz."); return {ok:false, motivo:"No se encontró ningún código QR/barras en la foto (probable compresión de WhatsApp: mandala como Documento, no como Foto)"}; }
  const p=await buscarPedidoPorCodigos(codigos);
  if(!p){ comprimirFoto(file).then(f=>enviarTelegram("❌ FOTO SIN ASIGNAR\n\nLa etiqueta no corresponde a ningún pedido cargado\nCódigo leído: "+codigos.join(" | ").slice(0,200),f)).catch(()=>{}); aviso("Leí la etiqueta pero no encontré ese pedido cargado en la app.\n\nCódigo leído: "+codigos.join(" | ").slice(0,160)+"\n\nImportá primero la etiqueta y volvé a intentar."); return {ok:false, motivo:"Código leído ("+codigos.join(" | ").slice(0,60)+") pero no coincide con ningún pedido cargado"}; }
  return await asignarFotoAPedido(p, file);
}
/* Confirma y guarda la foto en el pedido dado (ya identificado, sea por código o a mano).
   Comparte la misma lógica de confirmación que el camino automático. */
async function asignarFotoAPedido(p, file){
  const its=(()=>{ try{ return itemsPedido(p); }catch(e){ return []; } })();
  const lista=its.map(x=>"  • "+x.cant+"× "+x.prodNombre).join("\n")||"  (sin productos cargados)";
  const foto=await comprimirFoto(file);
  if(p.estado!=="pendiente"){
    if(!await askConfirm("Pedido de "+(p.cliente||"—")+" · N° "+numOrden(p)+"\nYa está en estado: "+estObj(p.estado).label+"\n\n¿Guardar igual la foto en este pedido?")) return {ok:false, motivo:"Cancelado: pedido "+(p.cliente||"")+" ya estaba en "+estObj(p.estado).label};
    await guardarFotoPedido(p.id, foto); telegramPedido(p,foto,"📷 PEDIDO CON FOTO",["Ya estaba en estado "+estObj(p.estado).label]); toast("Foto guardada en el pedido de "+(p.cliente||"")); render(); return {ok:true};
  }
  if(!await askConfirm("✅ Es el pedido de "+(p.cliente||"—")+"\nN° "+numOrden(p)+" · "+nombreEmp(p.empresa)+"\n\nTiene que llevar:\n"+lista+"\n\nRevisá que la foto coincida.\n¿Marcarlo como PREPARADO y guardar la foto?")) return {ok:false, motivo:"Cancelado al revisar el pedido de "+(p.cliente||"")};
  await guardarFotoPedido(p.id, foto);
  await avanzar(p.id,"preparado","Preparado por foto de etiqueta");
  telegramPedido(p,foto,"✅ PEDIDO PREPARADO CON FOTO",[]);
  toast("✓ "+(p.cliente||"Pedido")+" preparado con foto 📷");
  render();
  return {ok:true};
}
/* ===== Solapa DESPACHO: quien despacha saca la foto del pedido armado, la app lo encuentra por la
   etiqueta, muestra qué tiene que llevar y avisa si algo no coincide ===== */
let DESP=null;   // {id, foto, avisos:[], check:{}}
function vistaDespachar(){
  try{ pintarSidebar(); }catch(e){ logErr("auto",e); }
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const hechos=soloPedidos().filter(p=>p.fotoPrepTs && p.fotoPrepTs>=hoy.getTime()).sort((a,b)=>b.fotoPrepTs-a.fotoPrepTs);
  const avisos=soloPedidos().filter(p=>p.despachoAviso && !p.despachoAvisoVisto).sort((a,b)=>(b.despachoAvisoTs||0)-(a.despachoAvisoTs||0));
  const pend=soloPedidos().filter(p=>p.estado==="pendiente" && !p.cerradoEn).length;
  const operador=ROL!=="admin";
  const p=DESP&&PEDIDOS.find(x=>x.id===DESP.id);
  app().innerHTML=`
    ${segOp('despachar')}
    ${operador&&!SOLO_FOTO?`<div class="seg" style="margin-bottom:12px"><button onclick="OPVIEW='prepararhoy';render()">Preparar</button><button class="on">📷 Despacho</button></div>`:''}
    <div class="title">Despacho con foto</div>
    <div class="subtitle">Sacale foto al pedido armado con la etiqueta a la vista. Te digo de quién es y qué tiene que llevar.</div>
    ${DESP&&DESP.id&&p ? despCardHTML(p) : `
      <label class="btn block green big" style="cursor:pointer;margin:14px 0 6px;padding:22px;font-size:18px">📷 Sacar / subir foto del pedido
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="despFoto(this.files[0]);this.value=''"></label>
      <div class="hint" style="text-align:center">Quedan <b>${pend}</b> pedidos pendientes · ${hechos.length} con foto hoy</div>
      ${despListaHTML()}`}
    ${ROL==="admin"?`<button class="btn ghost block" style="margin-top:12px" onclick="telegramResumenDia()">✈️ Mandar resumen del día a Telegram</button>`:''}
    ${ROL==="admin"&&avisos.length?`<div class="label" style="margin-top:20px;color:#c62828">⚠ Avisos de despacho (${avisos.length})</div>
      ${avisos.map(a=>`<div class="card" style="margin-bottom:8px;border:1px solid #e5484d">
        <div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="min-width:0"><b>${esc(a.cliente||'—')}</b> <span class="muted">· N° ${esc(numOrden(a))} · ${esc(nombreEmp(a.empresa))}</span>
            ${(a.despachoAvisoTxt||[]).map(t=>`<div style="font-size:13px;color:#7a1f1f;margin-top:3px">• ${esc(t)}</div>`).join("")}
            <div class="muted" style="font-size:12px;margin-top:3px">${fmt(a.despachoAvisoTs)}</div></div>
          ${a.fotoPrep?`<img src="${a.fotoPrep}" onclick="verFotoPedido('${a.id}')" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;flex:0 0 auto">`:''}
        </div>
        <button class="btn sm ghost" style="margin-top:8px" onclick="despAvisoVisto('${a.id}')">✓ Visto / resuelto</button>
      </div>`).join("")}`:''}
    ${hechos.length?`<div class="label" style="margin-top:20px">Fotos de hoy</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px">
      ${hechos.slice(0,40).map(h=>`<div style="position:relative;cursor:pointer" onclick="verFotoPedido('${h.id}')">
        <img src="${h.fotoPrep}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;${h.despachoAviso&&!h.despachoAvisoVisto?'outline:3px solid #e5484d':''}">
        <div style="font-size:11px;line-height:1.2;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${h.despachoAviso&&!h.despachoAvisoVisto?'⚠ ':'✓ '}${esc(h.cliente||'')}</div></div>`).join("")}
      </div>`:''}`;
}
