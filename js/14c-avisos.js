/* ============================================================
   14c-avisos — Avisos de envío por WhatsApp (sin API, con wa.me)
   Lista los pedidos de correo ya despachados con código de seguimiento
   y deja avisar al cliente con un toque. El operador revisa y envía.
   Guarda en el pedido: avisoWA = fecha (Date.now()) del aviso.
   El mensaje y los links de seguimiento se guardan en este navegador.
   ============================================================ */

const AV_KEY="avisosEnvioCfg";
const AV_CFG0={
  msg:"Hola {nombre}! 👋 Tu pedido {orden} de {empresa} ya fue despachado con {correo}.\n📦 Código de seguimiento: {codigo}\n🔎 Seguilo acá: {link}\n¡Gracias por tu compra!",
  ca:"https://www.correoargentino.com.ar/formularios/e-commerce?id={codigo}",
  an:"https://www.andreani.com/envio/{codigo}",
  ot:""
};
const AV_ESTADOS=["despachado","en_camino","entregado","confirmado"];
let AV_TAB="por", AV_Q="", AV_OTROS=false, AV_CFG=null, AV_P=null;   // AV_P = pedido abierto en el mensaje

function avCfg(){
  if(AV_CFG) return AV_CFG;
  let g={}; try{ g=JSON.parse(localStorage.getItem(AV_KEY))||{}; }catch(e){}
  AV_CFG={...AV_CFG0,...g}; return AV_CFG;
}
function avNorm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim(); }
/* Teléfono para wa.me: saca 00 y 0 inicial y deja 549 + número */
function avTel(t){
  let d=String(t||"").replace(/\D/g,"").replace(/^00/,""); if(!d) return "";
  if(d.startsWith("54")) return d.startsWith("549")?d:("549"+d.slice(2));
  d=d.replace(/^0/,"");
  if(d.length===12){ for(const i of [2,3,4]){ if(d.substr(i,2)==="15"){ d=d.slice(0,i)+d.slice(i+2); break; } } }   // saca el "15" de celular (0357 15 123456 -> 357123456)
  return "549"+d;
}
function avLink(p){
  const c=avCfg(), car=avNorm(p.correo), cod=(p.tracking||"").trim();
  const t=/andreani/.test(car)?c.an:(/correo|argentino/.test(car)?c.ca:c.ot);
  return (t&&cod)?t.replace(/\{codigo\}/g,encodeURIComponent(cod)):"";
}
function avMensaje(p){
  const l=avLink(p); let t=avCfg().msg;
  if(!l) t=t.split("\n").filter(x=>!x.includes("{link}")).join("\n");
  const o=numOrden(p), nombre=(p.cliente||"").trim().split(/\s+/)[0]||"";
  return t.replace(/\{nombre\}/g,nombre)
    .replace(/#?\{orden\}/g,o.startsWith("#")?o:("#"+o))
    .replace(/\{empresa\}/g,empresaObj(p.empresa).nombre)
    .replace(/\{codigo\}/g,(p.tracking||"").trim())
    .replace(/\{correo\}/g,p.correo||"el correo")
    .replace(/\{link\}/g,l);
}
/* Pedidos de correo ya despachados (con o sin código) */
function avBase(){
  return soloPedidos().filter(p=>p.metodo==="correo" && AV_ESTADOS.includes(p.estado)
    && (AV_OTROS || canalDe(p)==="tiendanube"));
}
function avLista(){
  const base=avBase(), q=avNorm(AV_Q);
  let r=base.filter(p=>{
    const cod=!!(p.tracking||"").trim(), av=!!p.avisoWA;
    if(AV_TAB==="por") return cod && !av;
    if(AV_TAB==="sin") return !cod && !av;
    if(AV_TAB==="av")  return av;
    return true;
  });
  if(q) r=r.filter(p=>avNorm((p.cliente||"")+" "+numOrden(p)+" "+(p.ref||"")+" "+(p.tracking||"")).includes(q));
  return r.sort((a,b)=>(b.creado||0)-(a.creado||0));
}
function avCuentas(){
  const b=avBase(); const c=p=>!!(p.tracking||"").trim();
  return {por:b.filter(p=>c(p)&&!p.avisoWA).length, sin:b.filter(p=>!c(p)&&!p.avisoWA).length,
          av:b.filter(p=>p.avisoWA).length, todos:b.length};
}
const avFecha=ts=>{ const d=new Date(ts); return d.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}); };

function avFila(p){
  const cod=(p.tracking||"").trim(), tel=avTel(p.tel), id=esc(p.id);
  return `<div class="card" style="margin-bottom:10px;padding:14px 16px">
    <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
      <span style="font-weight:600;min-width:0">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:13px">· ${esc(numOrden(p))}</span></span>
      ${p.avisoWA?`<span class="chip">✅ Avisado ${avFecha(p.avisoWA)}</span>`:''}
    </div>
    <div class="muted" style="font-size:13px;margin-top:3px">${tel?('+'+tel):'<b style="color:#b45309">Sin teléfono</b>'} · ${esc(p.correo||'Correo')}${AV_OTROS?(' · '+esc(empresaObj(p.empresa).nombre)):''}</div>
    <div class="row" style="gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <input value="${esc(cod)}" placeholder="Código de seguimiento" onchange="avGuardarCodigo('${id}',this.value)" style="flex:1;min-width:170px;padding:8px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">
      <button class="btn sm green" ${(cod&&tel)?'':'disabled'} onclick="avAbrir('${id}')">💬 WhatsApp</button>
      ${p.avisoWA
        ?`<button class="btn sm ghost" onclick="avMarcar('${id}',false)">Desmarcar</button>`
        :`<button class="btn sm ghost" onclick="avMarcar('${id}',true)">Ya avisé</button>`}
    </div>
  </div>`;
}
function avPintarLista(){
  const el=document.getElementById("avLista"); if(!el) return;
  const r=avLista();
  el.innerHTML=r.length?r.map(avFila).join(""):empty('check', AV_TAB==="por"?'No hay pedidos por avisar.':AV_TAB==="sin"?'No hay pedidos sin código.':'No hay pedidos en esta lista.');
}
function vistaAvisos(){
  const n=avCuentas();
  const tabs=[["por","Por avisar",n.por],["sin","Sin código",n.sin],["av","Avisados",n.av],["todos","Todos",n.todos]];
  app().innerHTML=`
    <div class="title">Avisos de envío</div>
    <div class="subtitle">Avisá por WhatsApp que el pedido salió, con el código de seguimiento. Vos revisás y apretás enviar.</div>
    <div class="row" style="gap:8px;margin:14px 0;flex-wrap:wrap;align-items:center">
      <div class="seg" style="flex-wrap:wrap">${tabs.map(t=>`<button class="${AV_TAB===t[0]?'on':''}" onclick="AV_TAB='${t[0]}';vistaAvisos()">${t[1]} (${t[2]})</button>`).join("")}</div>
    </div>
    <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <input id="avQ" value="${esc(AV_Q)}" placeholder="Buscar cliente, N° de pedido o código" oninput="AV_Q=this.value;avPintarLista()" style="flex:1;min-width:200px;padding:8px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">
      <button class="btn sm green" onclick="avSiguiente()">Avisar al siguiente</button>
      <button class="btn sm ghost" onclick="avConfig()">Mensaje y links</button>
    </div>
    <label class="muted" style="font-size:13px;display:block;margin-bottom:12px"><input type="checkbox" ${AV_OTROS?'checked':''} onchange="AV_OTROS=this.checked;vistaAvisos()"> Incluir otros canales y empresas (por defecto solo Tienda Nube)</label>
    <div id="avLista"></div>`;
  avPintarLista();
}

async function avGuardarCodigo(id,v){
  v=(v||"").trim(); const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  if(v===(p.tracking||"")) return;
  try{ await DB.update(id,{tracking:v}); toast("Código guardado"); }catch(e){ logErr("avisos",e); toast("No se pudo guardar el código"); }
}
async function avMarcar(id,si){
  try{ await DB.update(id,{avisoWA:si?Date.now():null}); toast(si?"Marcado como avisado":"Desmarcado"); }catch(e){ logErr("avisos",e); toast("No se pudo guardar"); }
  vistaAvisos();
}
function avSiguiente(){
  const p=avBase().filter(x=>(x.tracking||"").trim() && avTel(x.tel) && !x.avisoWA).sort((a,b)=>(a.creado||0)-(b.creado||0))[0];
  if(!p){ toast("No queda nadie por avisar"); return; }
  avAbrir(p.id);
}
/* Ventana con el mensaje para revisar/editar antes de abrir WhatsApp */
function avAbrir(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return; AV_P=p;
  avCerrar();
  const ov=document.createElement("div"); ov.id="avOv";
  ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px";
  ov.innerHTML=`<div class="card" style="max-width:520px;width:100%;padding:18px">
    <b>${esc(numOrden(p))} · ${esc(p.cliente||'')}</b>
    <div class="muted" style="font-size:13px;margin:2px 0 10px">+${avTel(p.tel)}</div>
    <textarea id="avMsg" rows="9" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">${esc(avMensaje(p))}</textarea>
    <div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn sm ghost" onclick="avCerrar()">Cancelar</button>
      <button class="btn sm green" onclick="avEnviar()">Abrir WhatsApp y marcar</button>
    </div></div>`;
  document.body.appendChild(ov);
}
function avCerrar(){ const o=document.getElementById("avOv"); if(o) o.remove(); const c=document.getElementById("avCfgOv"); if(c) c.remove(); }
function avEnviar(){
  const p=AV_P, t=document.getElementById("avMsg"); if(!p||!t) return;
  window.open("https://wa.me/"+avTel(p.tel)+"?text="+encodeURIComponent(t.value),"_blank");   // sincrónico: evita bloqueo de popup
  avCerrar();
  avMarcar(p.id,true);
}
function avConfig(){
  avCerrar(); const c=avCfg();
  const ov=document.createElement("div"); ov.id="avCfgOv";
  ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto";
  const inp=(id,v)=>`<input id="${id}" value="${esc(v)}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">`;
  ov.innerHTML=`<div class="card" style="max-width:560px;width:100%;padding:18px">
    <b>Mensaje y links de seguimiento</b>
    <div class="muted" style="font-size:12.5px;margin:4px 0 10px">Variables: {nombre} {orden} {empresa} {codigo} {correo} {link}. Si no hay link, esa línea se omite. Se guarda en este navegador.</div>
    <span class="label">Mensaje</span><textarea id="avcM" rows="7" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">${esc(c.msg)}</textarea>
    <span class="label" style="margin-top:8px;display:block">Link Correo Argentino ({codigo})</span>${inp("avcCA",c.ca)}
    <span class="label" style="margin-top:8px;display:block">Link Andreani ({codigo})</span>${inp("avcAN",c.an)}
    <span class="label" style="margin-top:8px;display:block">Link otros correos (opcional)</span>${inp("avcOT",c.ot)}
    <div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn sm ghost" onclick="avRestaurar()">Restaurar</button>
      <button class="btn sm ghost" onclick="avCerrar()">Cancelar</button>
      <button class="btn sm green" onclick="avGuardarCfg()">Guardar</button>
    </div></div>`;
  document.body.appendChild(ov);
}
function avGuardarCfg(){
  AV_CFG={msg:document.getElementById("avcM").value, ca:document.getElementById("avcCA").value.trim(),
          an:document.getElementById("avcAN").value.trim(), ot:document.getElementById("avcOT").value.trim()};
  try{ localStorage.setItem(AV_KEY,JSON.stringify(AV_CFG)); }catch(e){}
  avCerrar(); toast("Guardado");
}
function avRestaurar(){ AV_CFG={...AV_CFG0}; try{ localStorage.removeItem(AV_KEY); }catch(e){} avCerrar(); toast("Restaurado"); }
