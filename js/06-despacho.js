/* ============================================================
   06-despacho — Tablero Control, avisos a Telegram y solapa Despacho
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
/* ===== CONTROL: tablero estratégico del admin ===== */
let CTL_RANGO="hoy", CTL_EMP="todas", CTL_LISTA="faltan";
const CTL_EN_CAMINO=["asignado","en_reparto","despachado","en_camino"];
function ctlRango(){
  const hoy=new Date(); hoy.setHours(0,0,0,0); const h=hoy.getTime();
  if(CTL_RANGO==="ayer") return {ini:h-864e5, fin:h};
  if(CTL_RANGO==="semana"){ const dow=(hoy.getDay()+6)%7; return {ini:h-dow*864e5, fin:Date.now()+864e5}; }
  return {ini:h, fin:Date.now()+864e5};
}
function ctlPedidos(){
  const {ini,fin}=ctlRango();
  // lo del período + todo lo que sigue abierto (aunque sea de antes: es lo que hay que resolver)
  return soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO"
    && (CTL_EMP==="todas"||(p.empresa||"")===CTL_EMP)
    && ((p.creado||0)>=ini && (p.creado||0)<fin || ["pendiente","preparado",...CTL_EN_CAMINO].includes(p.estado)));
}
function ctlEstado(p){
  if(p.despachoAviso && !p.despachoAvisoVisto) return "mal";
  if(p.estado==="pendiente") return "faltan";
  if(p.estado==="preparado") return "listos";
  if(CTL_EN_CAMINO.includes(p.estado)) return "camino";
  return "entregados";
}
function vistaControl(){
  try{ pintarSidebar(); }catch(e){ logErr("auto",e); }
  const peds=ctlPedidos();
  const by=f=>peds.filter(f);
  const cnt={faltan:0,listos:0,camino:0,entregados:0,mal:0};
  peds.forEach(p=>cnt[ctlEstado(p)]++);
  const conFoto=by(p=>p.fotoPrep && !(p.despachoAviso&&!p.despachoAvisoVisto)).length;
  const sinFotoSalida=by(p=>!p.fotoPrep && ["preparado",...CTL_EN_CAMINO].includes(p.estado));
  const sinProd=by(p=>["pendiente","preparado"].includes(p.estado) && ((()=>{ try{ return !itemsPedido(p).length; }catch(_){ return true; } })() || (p.prods||[]).some(x=>x&&x.reconocido===false)));
  const pct=(a,b)=>b?Math.round(a*100/b):0;
  const totalAct=cnt.faltan+cnt.listos+cnt.mal;
  const avance=pct(cnt.listos+cnt.camino+cnt.entregados, peds.length);
  const emps=[...new Set(soloPedidos().map(p=>p.empresa||""))].filter(Boolean);
  const btn=(on,txt,click)=>`<button class="${on?'on':''}" onclick="${click}">${txt}</button>`;
  const kpi=(n,l,color,lista)=>`<div class="kpi" style="cursor:pointer;${CTL_LISTA===lista?'outline:2px solid '+color:''}" onclick="CTL_LISTA='${lista}';vistaControl()">
      <div class="n" style="color:${color}">${n}</div><div class="l">${l}</div></div>`;
  // matriz empresa × envío
  const tipos=ENVIOS_PREP;
  const celda=g=>{ const c={faltan:0,listos:0,camino:0,entregados:0,mal:0}; g.forEach(p=>c[ctlEstado(p)]++);
    if(!g.length) return `<td class="muted" style="text-align:center">—</td>`;
    return `<td style="font-size:12.5px;line-height:1.5;white-space:nowrap">
      <b style="font-size:15px">${g.length}</b>
      ${c.faltan?`<span style="color:var(--amber)"> · ⏳${c.faltan}</span>`:''}${c.listos?`<span style="color:var(--green)"> · ✓${c.listos}</span>`:''}${c.camino?`<span style="color:var(--accent)"> · 🚚${c.camino}</span>`:''}${c.mal?`<span style="color:var(--red)"> · ⚠${c.mal}</span>`:''}${c.entregados?`<span class="muted"> · 🏁${c.entregados}</span>`:''}</td>`; };
  const filasEmp=(CTL_EMP==="todas"?emps:[CTL_EMP]).map(e=>{ const pe=peds.filter(p=>(p.empresa||"")===e); if(!pe.length) return "";
    return `<tr><td><b>${esc(nombreEmp(e))}</b></td>${tipos.map(t=>celda(pe.filter(p=>tipoEnvioPrep(p)===t.id))).join("")}${celda(pe)}</tr>`; }).join("");
  // cadetes
  const cadetes={}; by(p=>tipoEnvioPrep(p)==="cadete" && ["pendiente","preparado",...CTL_EN_CAMINO].includes(p.estado)).forEach(p=>{ const k=p.cadete||"Sin asignar"; (cadetes[k]=cadetes[k]||[]).push(p); });
  // correo, desglosado por transportista (Andreani, Correo Argentino, etc.)
  const porCorreo={}; by(p=>tipoEnvioPrep(p)==="correo" && ["pendiente","preparado",...CTL_EN_CAMINO].includes(p.estado)).forEach(p=>{ const k=p.correo||"Sin definir"; (porCorreo[k]=porCorreo[k]||[]).push(p); });
  // productos que faltan preparar
  const prods={}; by(p=>p.estado==="pendiente").forEach(p=>{ try{ itemsPedido(p).forEach(it=>{ const k=it.prodNombre||it.nombre; prods[k]=(prods[k]||0)+(it.cant||0); }); }catch(_){ logErr("auto",_); } });
  const topProds=Object.entries(prods).sort((a,b)=>b[1]-a[1]);
  // lista de detalle según la tarjeta elegida
  const listas={
    faltan:{t:"⏳ Falta preparar", arr:by(p=>ctlEstado(p)==="faltan")},
    listos:{t:"✓ Preparados, listos para salir", arr:by(p=>ctlEstado(p)==="listos")},
    camino:{t:"🚚 En camino", arr:by(p=>ctlEstado(p)==="camino")},
    entregados:{t:"🏁 Entregados", arr:by(p=>ctlEstado(p)==="entregados")},
    mal:{t:"⚠ Con problema", arr:by(p=>ctlEstado(p)==="mal")},
    bien:{t:"📷 Bien, con foto", arr:by(p=>p.fotoPrep && ctlEstado(p)!=="mal")},
    sinfoto:{t:"📷 Salieron / listos SIN foto", arr:sinFotoSalida},
    sinprod:{t:"❓ Productos sin cargar o sin reconocer", arr:sinProd},
    revisar:{t:"📷 Fotos sin revisar", arr:by(p=>p.fotoPrep && !p.fotoRevisada)},
    aprobar:{t:"📋 Para aprobar (todavía no los ve Claudia)", arr:by(p=>p.estado==="pendiente" && !pedidoListoParaTelegram(p))},
  };
  const L=listas[CTL_LISTA]||listas.faltan;
  const filaAprobar=p=>{ const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
    return `<div class="row" style="gap:12px;padding:12px 0;border-top:.5px solid var(--border);align-items:flex-start">
      <div style="min-width:0;flex:1">
        <div style="font-weight:650">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa))}</span></div>
        <div style="font-size:12.5px;color:var(--text-2);margin-top:2px">${its.map(x=>x.cant+"× "+esc(x.prodNombre)).join(" · ")||'<span style="color:var(--red)">sin productos</span>'}</div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn sm green" onclick="aprobarParaTelegram('${p.id}')">✅ Aprobar para Claudia</button>
          <button class="btn sm ghost" onclick="cambiarRuta('${p.id}')">✏️ Revisar / editar</button>
        </div>
      </div>
    </div>`; };
  const filaRevisar=p=>{ const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
    return `<div class="row" style="gap:12px;padding:12px 0;border-top:.5px solid var(--border);align-items:flex-start">
      <img src="${p.fotoPrep}" style="width:76px;height:76px;object-fit:cover;border-radius:10px;flex:0 0 auto;cursor:pointer" onclick="window.open('${p.fotoPrep}','_blank')">
      <div style="min-width:0;flex:1">
        <div style="font-weight:650">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa))}</span></div>
        <div style="font-size:12.5px;color:var(--text-2);margin-top:2px">${its.map(x=>x.cant+"× "+esc(x.prodNombre)).join(" · ")||'<span style="color:var(--red)">sin productos</span>'}</div>
        ${p.telegramVeredicto?`<div style="font-size:12.5px;margin-top:5px;padding:6px 9px;border-radius:8px;background:${/falta|revisá|de más/i.test(p.telegramVeredicto)?'#ffe8e8':'#d9f2e5'};color:${/falta|revisá|de más/i.test(p.telegramVeredicto)?'#c62828':'#0f6b40'}">🤖 ${esc(p.telegramVeredicto)}</div>`:''}
        <div style="margin-top:6px">${selectCanalEnvio(p)}</div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn sm green" onclick="marcarFotoRevisada('${p.id}')">✓ OK</button>
          <label class="btn sm ghost" style="cursor:pointer">🔄 Cambiar foto<input type="file" accept="image/*" capture="environment" style="display:none" onchange="adjuntarFotoPedido('${p.id}',this.files[0]).then(()=>vistaControl());this.value=''"></label>
          <button class="btn sm ghost" style="color:var(--red)" onclick="reportarProblemaFoto('${p.id}')">⚠ Reportar problema</button>
        </div>
      </div>
    </div>`; };
  const fila=p=>{ const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
    const est=ctlEstado(p), col={faltan:'var(--amber)',listos:'var(--green)',camino:'var(--accent)',entregados:'var(--text-3)',mal:'var(--red)'}[est];
    return `<div class="row" style="gap:10px;padding:9px 0;border-top:.5px solid var(--border);flex-wrap:nowrap;align-items:center;cursor:pointer" onclick="DESP=null;despElegir('${p.id}');OPVIEW='despachar'">
      ${p.fotoPrep?`<img src="${p.fotoPrep}" style="width:42px;height:42px;object-fit:cover;border-radius:8px;flex:0 0 auto">`:`<div style="width:42px;height:42px;border-radius:8px;border:1px dashed var(--border);flex:0 0 auto;display:flex;align-items:center;justify-content:center;opacity:.5">📷</div>`}
      <div style="min-width:0;flex:1">
        <div style="font-weight:650">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa))} · ${(ENVIOS_PREP.find(t=>t.id===tipoEnvioPrep(p))||{}).nombre||''}${p.cadete?(' · '+esc(p.cadete)):''}</span></div>
        <div style="font-size:12.5px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${its.map(x=>x.cant+"× "+esc(x.prodNombre)).join(" · ")||'<span style="color:var(--red)">sin productos</span>'}</div>
        ${p.despachoAviso&&!p.despachoAvisoVisto?`<div style="font-size:12px;color:var(--red)">⚠ ${esc((p.despachoAvisoTxt||[]).join(" · "))}</div>`:''}
        ${p.telegramVeredicto&&p.fotoRevisada?`<div style="font-size:11.5px;color:var(--green);margin-top:2px">🤖✓ Verificado por IA (Telegram)</div>`:''}
      </div>
      <button class="btn sm ghost" style="flex:0 0 auto" onclick="event.stopPropagation();cambiarRuta('${p.id}')" title="Corregir productos de este pedido">✎</button>
      ${est==="listos"?(p.revisadoAdmin
        ?`<span style="flex:0 0 auto;font-size:11px;font-weight:700;color:var(--green);text-align:right">✓ Revisado por vos</span>`
        :`<button class="btn sm green" style="flex:0 0 auto" onclick="event.stopPropagation();marcarRevisadoAdmin('${p.id}')">✓ OK</button>`)
        :`<span style="flex:0 0 auto;font-size:11.5px;font-weight:700;color:${col}">${esc(estObj(p.estado).label)}</span>`}
    </div>`; };
  app().innerHTML=`
    ${segOp('control')}
    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:10px">
      <div><div class="title" style="margin:0">🎯 Control</div>
        <div class="subtitle" style="margin:2px 0 0">${new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})} · ${peds.length} pedidos · avance ${avance}%</div></div>
      <button class="btn sm ghost" onclick="telegramResumenDia()">✈️ Resumen a Telegram</button>
    </div>
    <div class="seg" style="margin-bottom:8px">${btn(CTL_RANGO==="hoy","Hoy","CTL_RANGO='hoy';vistaControl()")}${btn(CTL_RANGO==="ayer","Ayer","CTL_RANGO='ayer';vistaControl()")}${btn(CTL_RANGO==="semana","Semana","CTL_RANGO='semana';vistaControl()")}</div>
    <div class="seg" style="margin-bottom:14px;flex-wrap:wrap">${btn(CTL_EMP==="todas","Todas","CTL_EMP='todas';vistaControl()")}${emps.map(e=>btn(CTL_EMP===e,esc(nombreEmp(e)),`CTL_EMP='${e}';vistaControl()`)).join("")}</div>

    <div style="height:10px;border-radius:6px;background:var(--bg-2);overflow:hidden;display:flex;margin-bottom:14px;border:.5px solid var(--border)">
      ${[["entregados","var(--text-3)"],["camino","var(--accent)"],["listos","var(--green)"],["faltan","var(--amber)"],["mal","var(--red)"]].map(([k,c])=>cnt[k]?`<div title="${k}" style="width:${pct(cnt[k],peds.length)}%;background:${c}"></div>`:'').join("")}
    </div>
    <div class="kpis">
      ${kpi(listas.aprobar.arr.length,"📋 Para aprobar (Claudia no los ve)",listas.aprobar.arr.length?"var(--red)":"var(--text-3)","aprobar")}
      ${kpi(cnt.faltan,"⏳ Falta preparar","var(--amber)","faltan")}
      ${kpi(cnt.listos,"✓ Listos para salir","var(--green)","listos")}
      ${kpi(cnt.camino,"🚚 En camino","var(--accent)","camino")}
      ${kpi(cnt.mal,"⚠ Con problema","var(--red)","mal")}
    </div>
    <div class="kpis">
      ${kpi(listas.revisar.arr.length,"📷 Fotos sin revisar",listas.revisar.arr.length?"var(--amber)":"var(--text-3)","revisar")}
      ${kpi(conFoto,"📷 Bien con foto","var(--green)","bien")}
      ${kpi(sinFotoSalida.length,"Sin foto al salir",sinFotoSalida.length?"var(--amber)":"var(--text-3)","sinfoto")}
      ${kpi(sinProd.length,"❓ Productos a revisar",sinProd.length?"var(--red)":"var(--text-3)","sinprod")}
      ${kpi(cnt.entregados,"🏁 Entregados","var(--text-3)","entregados")}
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between"><span class="label" style="margin:0">${L.t} · ${L.arr.length}</span>
        ${CTL_LISTA==="mal"&&L.arr.length?`<button class="btn sm ghost" onclick="OPVIEW='despachar';vistaOperador()">Ver avisos →</button>`:''}
        ${CTL_LISTA==="revisar"&&L.arr.length?`<button class="btn sm ghost" onclick="marcarTodasRevisadas()">✓ Marcar todas OK</button>`:''}
        ${CTL_LISTA==="aprobar"&&L.arr.length?`<button class="btn sm green" onclick="aprobarTodasParaTelegram()">✅ Aprobar todos</button>`:''}</div>
      ${L.arr.length?L.arr.slice(0,60).map(CTL_LISTA==="revisar"?filaRevisar:(CTL_LISTA==="aprobar"?filaAprobar:fila)).join(""):`<div class="muted" style="padding:14px 0;text-align:center">Nada acá 👍</div>`}
    </div>

    <div class="card" style="margin-bottom:12px">
      <span class="label">Por empresa y tipo de envío</span>
      <div style="overflow-x:auto"><table class="tbl2" style="width:100%">
        <tr><th style="text-align:left">Empresa</th>${tipos.map(t=>`<th>${t.nombre}</th>`).join("")}<th>Total</th></tr>
        ${filasEmp||`<tr><td class="muted">Sin pedidos</td></tr>`}
      </table></div>
      <div class="muted" style="font-size:11.5px;margin-top:6px">⏳ falta preparar · ✓ listo · 🚚 en camino · ⚠ problema · 🏁 entregado</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      <div class="card">
        <span class="label">🛵 Lo que lleva cada cadete</span>
        ${Object.keys(cadetes).length?Object.entries(cadetes).sort((a,b)=>b[1].length-a[1].length).map(([c,arr])=>`
          <div style="padding:8px 0;border-top:.5px solid var(--border)">
            <div class="row" style="justify-content:space-between">
              <span style="${c==='Sin asignar'?'color:var(--amber);font-weight:700':''}">${esc(c)}</span>
              <span><b>${arr.length}</b> <span class="muted" style="font-size:12px">· ${arr.filter(p=>p.estado==='pendiente').length} a preparar · ${arr.filter(p=>p.estado==='preparado').length} por salir · ${arr.filter(p=>CTL_EN_CAMINO.includes(p.estado)).length} en camino</span></span>
            </div>
            <div class="muted" style="font-size:12.5px;margin-top:4px;line-height:1.7">${arr.map((p,k)=>(k+1)+". "+esc(p.cliente||'—')).join("<br>")}</div>
          </div>`).join(""):`<div class="muted" style="padding:10px 0">Nada para cadetes</div>`}
      </div>
      <div class="card">
        <span class="label">✉️ Correo, por transportista</span>
        ${Object.keys(porCorreo).length?Object.entries(porCorreo).sort((a,b)=>b[1].length-a[1].length).map(([c,arr])=>`
          <div style="padding:8px 0;border-top:.5px solid var(--border)">
            <div class="row" style="justify-content:space-between">
              <span style="${c==='Sin definir'?'color:var(--amber);font-weight:700':''}">${esc(c)}</span>
              <span><b>${arr.length}</b> <span class="muted" style="font-size:12px">· ${arr.filter(p=>p.estado==='pendiente').length} a preparar · ${arr.filter(p=>!p.etiquetaPdf&&['pendiente','preparado'].includes(p.estado)).length} sin etiqueta</span></span>
            </div>
            <div class="muted" style="font-size:12.5px;margin-top:4px;line-height:1.7">${arr.map((p,k)=>(k+1)+". "+esc(p.cliente||'—')).join("<br>")}</div>
          </div>`).join(""):`<div class="muted" style="padding:10px 0">Nada por correo</div>`}
        <div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)">
          <span>📦 Pickit</span>
          <span><b>${by(p=>tipoEnvioPrep(p)==="pickit").length}</b></span>
        </div>
      </div>
      <div class="card">
        <span class="label">📦 Qué juntar para lo que falta preparar</span>
        ${topProds.length?topProds.slice(0,15).map(([n,c])=>`<div class="row" style="justify-content:space-between;padding:6px 0;border-top:.5px solid var(--border);flex-wrap:nowrap"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span><b>${c}</b></div>`).join(""):`<div class="muted" style="padding:10px 0">Nada pendiente 👍</div>`}
      </div>
    </div>`;
}
/* ===== Telegram: foto + resumen de cada pedido (el bot se configura en Vercel) ===== */
function resumenPedidoTG(p, titulo, avisos){
  const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
  const env=(ENVIOS_PREP.find(t=>t.id===tipoEnvioPrep(p))||{}).nombre||"";
  return [
    titulo,
    "👤 "+(p.cliente||"—")+"  ·  N° "+numOrden(p),
    "🏷️ "+nombreEmp(p.empresa)+"  ·  "+env,
    (p.dir||p.ciudad)?("📍 "+[p.dir,p.ciudad].filter(Boolean).join(", ")):"",
    "",
    "📦 Lleva:",
    ...(its.length?its.map(x=>"• "+x.cant+"× "+x.prodNombre):["(sin productos cargados)"]),
    ...(avisos&&avisos.length?["","⚠ AVISOS:",...avisos.map(a=>"• "+a)]:[]),
    "",
    "🕒 "+new Date().toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
  ].filter((l,i,a)=>!(l===""&&a[i-1]==="")).join("\n");
}
async function enviarTelegram(texto, foto){
  try{
    const r=await fetch("/api/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texto,foto:foto||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok){ console.warn("Telegram:",d.error||r.status); if(!window.__tgAvisado){ window.__tgAvisado=true; toast("Telegram no enviado: "+(d.error||r.status)); } return false; }
    return true;
  }catch(e){ console.warn("Telegram:",e); return false; }
}
function telegramPedido(p, foto, titulo, avisos){ if(p) enviarTelegram(resumenPedidoTG(p,titulo,avisos), foto); }   // no espero: que no frene el despacho
/* Resumen del día a Telegram: UN PDF POR EMPRESA (Nutrivibe, Suplemundo, Labs…), cada pedido con su fotito */
function fotoMiniatura(dataUrl, max=220){ return new Promise(res=>{
  if(!dataUrl) return res(null);
  const img=new Image();
  img.onload=()=>{ const k=Math.min(1,max/Math.max(img.width,img.height)); const c=document.createElement("canvas");
    c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    res({url:c.toDataURL("image/jpeg",0.6), w:c.width, h:c.height}); };
  img.onerror=()=>res(null); img.src=dataUrl; }); }
// jsPDF usa Helvetica: saco emojis y caracteres que no tiene
const pdfTxt=s=>String(s==null?"":s).replace(/[\u2013\u2014\u2022]/g,"-").replace(/[^\x20-\xFF]/g,"").replace(/\s+/g," ").trim();
/* Plata de una empresa para el resumen: total del día (cadete / correo) y unidades que salieron hoy */
function plataEmpresa(emp){
  const hoy=new Date(); hoy.setHours(0,0,0,0); const h0=hoy.getTime();
  const esCad=p=>catPedido(p)!=="correo";
  const todos=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && (p.empresa||"")===emp);
  const sumar=arr=>{ const cad=arr.filter(esCad), cor=arr.filter(p=>!esCad(p));
    const $=a=>a.reduce((s,p)=>s+(costoEnvio(p)||0),0);
    return {cadN:cad.length, cad$:$(cad), corN:cor.length, cor$:$(cor), totN:arr.length, tot$:$(arr)}; };
  const hoyP=todos.filter(p=>(p.creado||0)>=h0);
  // unidades que salieron del stock hoy para esta empresa
  const prods={}; let unid=0;
  try{ (stockState().movs||[]).filter(m=>m.tipo==="salida" && m.empresa===emp && (m.ts||0)>=h0)
    .forEach(m=>{ prods[m.prod]=(prods[m.prod]||0)+m.cant; unid+=m.cant; }); }catch(_){ logErr("auto",_); }
  return {hoy:sumar(hoyP), unid, prods:Object.entries(prods).sort((a,b)=>b[1]-a[1])};
}
async function pdfResumenEmpresa(emp, peds, fecha){
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({unit:"mm", format:"a4"});
  const W=210, M=12; let y=M;
  const salto=h=>{ if(y+h>285){ doc.addPage(); y=M; } };
  const grupos=[
    ["CON PROBLEMA", p=>p.despachoAviso&&!p.despachoAvisoVisto, [229,72,77]],
    ["FALTA PREPARAR", p=>p.estado==="pendiente"&&!(p.despachoAviso&&!p.despachoAvisoVisto), [245,147,0]],
    ["PREPARADOS - LISTOS PARA SALIR", p=>p.estado==="preparado"&&!(p.despachoAviso&&!p.despachoAvisoVisto), [47,179,80]],
    ["EN CAMINO", p=>CTL_EN_CAMINO.includes(p.estado)&&!(p.despachoAviso&&!p.despachoAvisoVisto), [0,113,227]],
    ["ENTREGADOS", p=>["entregado","confirmado"].includes(p.estado)&&!(p.despachoAviso&&!p.despachoAvisoVisto), [120,120,120]],
  ];
  // encabezado
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.text(pdfTxt("Resumen de despacho - "+nombreEmp(emp)), M, y+6);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(pdfTxt(fecha+"  ·  "+peds.length+" pedidos"), M, y+12); doc.setTextColor(0); y+=18;
  // totales
  const tot=[["Falta preparar",grupos[1][1]],["Listos",grupos[2][1]],["En camino",grupos[3][1]],["Con problema",grupos[0][1]]]
    .map(([l,f])=>[l,peds.filter(f).length]);
  const conFoto=peds.filter(p=>p.fotoPrep).length;
  tot.push(["Con foto",conFoto]);
  const porEnvio=ENVIOS_PREP.map(t=>[t.nombre.replace(/^\S+\s/,""), peds.filter(p=>tipoEnvioPrep(p)===t.id).length]).filter(x=>x[1]);
  const bw=(W-2*M-4*3)/5;
  tot.forEach(([l,n],i)=>{ const x=M+i*(bw+3); doc.setDrawColor(220); doc.roundedRect(x,y,bw,16,2,2);
    doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.text(String(n), x+4, y+8);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(110); doc.text(pdfTxt(l), x+4, y+13); doc.setTextColor(0); });
  y+=21;
  doc.setFontSize(9); doc.setTextColor(90); doc.text(pdfTxt("Por envio: "+porEnvio.map(([n,c])=>n+" "+c).join("  ·  ")), M, y); doc.setTextColor(0); y+=6;

  // ===== Plata: lo que sacó hoy y lo que debe =====
  const pl=plataEmpresa(emp);
  const $f=n=>"$ "+Math.round(n||0).toLocaleString("es-AR");
  salto(62); y+=2;
  doc.setFillColor(40,40,40); doc.rect(M,y,3,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text("CUENTA DE ENVIOS", M+5, y+4.8); y+=9;
  const colX=[M+2, M+62, M+100, M+138];
  doc.setFontSize(8.5); doc.setTextColor(110); doc.setFont("helvetica","bold");
  ["","Cadete","Correo","TOTAL"].forEach((t,i)=>doc.text(t, colX[i], y)); doc.setTextColor(0); y+=2;
  const filaPlata=(titulo,d,resaltar)=>{
    doc.setDrawColor(225); doc.line(M,y,W-M,y); y+=5.5;
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.text(pdfTxt(titulo), colX[0], y);
    doc.setFont("helvetica","normal");
    [[d.cadN,d.cad$],[d.corN,d.cor$]].forEach(([n,$],i)=>{ doc.text(n+" env.", colX[i+1], y); doc.text($f($), colX[i+1], y+4.5); });
    doc.setFont("helvetica","bold"); if(resaltar) doc.setTextColor(200,40,40);
    doc.text(d.totN+" env.", colX[3], y); doc.setFontSize(11); doc.text($f(d.tot$), colX[3], y+4.8);
    doc.setTextColor(0); doc.setFont("helvetica","normal"); y+=8; };
  filaPlata("Total del dia", pl.hoy, false);
  doc.setDrawColor(225); doc.line(M,y,W-M,y); y+=4;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Cadete: precio por zona  ·  Correo: gestion. El precio de cada orden figura abajo.", M, y); y+=5;
  if(pl.unid){
    const txtProd=doc.splitTextToSize(pdfTxt("Productos que saco hoy ("+pl.unid+" u.): "+pl.prods.map(([n,c])=>c+"x "+n).join(" · ")), W-2*M);
    salto(txtProd.length*4+2); doc.setTextColor(60); doc.setFontSize(8.5); doc.text(txtProd, M, y); y+=txtProd.length*4+1;
  }
  doc.setTextColor(0); y+=3;
  // pedidos por grupo, con fotito
  for(const [titulo,filtro,col] of grupos){
    const arr=peds.filter(filtro); if(!arr.length) continue;
    salto(14); y+=2;
    doc.setFillColor(...col); doc.rect(M,y,3,6,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text(pdfTxt(titulo+" ("+arr.length+")"), M+5, y+4.8); y+=9;
    for(const p of arr){
      const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
      const prodLines=doc.splitTextToSize(pdfTxt(its.map(x=>x.cant+"x "+x.prodNombre).join("  ·  ")||"sin productos cargados"), W-2*M-72);
      const avisoLines=(p.despachoAviso&&!p.despachoAvisoVisto)?doc.splitTextToSize(pdfTxt("AVISO: "+(p.despachoAvisoTxt||[]).join(" · ")), W-2*M-72):[];
      const S=36;   // tamaño de la fotito (mm)
      const h=Math.max(S+4, 12+prodLines.length*4+avisoLines.length*4);
      salto(h+2);
      doc.setDrawColor(230); doc.roundedRect(M,y,W-2*M,h,2,2);
      const th=await fotoMiniatura(p.fotoPrep, 360);
      if(th){ const s=Math.min(S/th.w,S/th.h); const w=th.w*s, hh=th.h*s; doc.addImage(th.url,"JPEG",M+2+(S-w)/2,y+2+(S-hh)/2,w,hh); }
      else { doc.setDrawColor(200); doc.setLineDashPattern([1,1],0); doc.rect(M+2,y+2,S,S); doc.setLineDashPattern([],0);
        doc.setFontSize(7); doc.setTextColor(150); doc.text("sin foto", M+2+S/2-5, y+2+S/2); doc.setTextColor(0); }
      const x=M+S+6;
      doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.text(pdfTxt(p.cliente||"-"), x, y+6);
      { const precio=costoEnvio(p)||0; const cat=catPedido(p);
        doc.setFontSize(11); doc.text("$ "+Math.round(precio).toLocaleString("es-AR"), W-M-3, y+6, {align:"right"});
        doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(120);
        doc.text(pdfTxt(cat==="correo"?"correo":(cat==="caba"?"cadete CABA":"cadete zona "+cat)), W-M-3, y+10, {align:"right"}); doc.setTextColor(0);
        doc.setFont("helvetica","bold"); }
      doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(100);
      const env=(ENVIOS_PREP.find(t=>t.id===tipoEnvioPrep(p))||{}).nombre||"";
      doc.text(pdfTxt(numOrden(p)+"  ·  "+env.replace(/^\S+\s/,"")+(p.cadete?("  ·  "+p.cadete):"")+"  ·  "+estObj(p.estado).label+(p.fotoPrepTs?("  ·  foto "+fmt(p.fotoPrepTs)):"")), x, y+10.5);
      doc.setTextColor(0); doc.setFontSize(9.5); doc.text(prodLines, x, y+15.5);
      if(avisoLines.length){ doc.setTextColor(200,40,40); doc.text(avisoLines, x, y+15.5+prodLines.length*4); doc.setTextColor(0); }
      y+=h+2;
    }
  }
  return doc.output("datauristring").replace(/^data:application\/pdf;[^,]*base64,/,"data:application/pdf;base64,");
}
async function telegramResumenDia(){
  if(!window.jspdf){ toast("No cargó el generador de PDF, recargá la página"); return; }
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const fecha=hoy.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const base=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO"
    && ((p.creado||0)>=hoy.getTime() || (p.fotoPrepTs||0)>=hoy.getTime() || ["pendiente","preparado",...CTL_EN_CAMINO].includes(p.estado)));
  const emps=EMPRESAS.map(e=>e.id).filter(id=>base.some(p=>(p.empresa||"")===id));
  if(!emps.length){ toast("No hay pedidos para resumir hoy"); return; }
  toast("Armando "+emps.length+" resúmenes para Telegram…");
  let ok=0;
  for(const e of emps){
    const peds=base.filter(p=>(p.empresa||"")===e);
    try{
      const pdf=await pdfResumenEmpresa(e, peds, fecha);
      const n=k=>peds.filter(k).length;
      const pl=plataEmpresa(e), $f=n=>"$ "+Math.round(n||0).toLocaleString("es-AR");
      const pie="📋 "+nombreEmp(e)+" · "+hoy.toLocaleDateString("es-AR")+"\n💰 Total del día: "+$f(pl.hoy.tot$)+"\n🛵 Cadete: "+pl.hoy.cadN+" = "+$f(pl.hoy.cad$)+"  ·  ✉️ Correo: "+pl.hoy.corN+" = "+$f(pl.hoy.cor$)+"\n"+peds.length+" pedidos · ⏳ "+n(p=>p.estado==="pendiente")+" a preparar · ✓ "+n(p=>p.estado==="preparado")+" listos · 🚚 "+n(p=>CTL_EN_CAMINO.includes(p.estado))+" en camino · ⚠ "+n(p=>p.despachoAviso&&!p.despachoAvisoVisto)+" con problema";
      const nombre="Resumen "+nombreEmp(e).replace(/[^\w ]/g,"")+" "+hoy.toISOString().slice(0,10)+".pdf";
      const r=await fetch("/api/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documento:pdf,nombre,texto:pie})});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&d.ok) ok++; else toast(nombreEmp(e)+": "+(d.error||r.status));
    }catch(err){ console.error(err); toast(nombreEmp(e)+": no se pudo armar el PDF"); }
  }
  toast(ok===emps.length?("✓ "+ok+" resúmenes enviados a Telegram"):(ok+" de "+emps.length+" enviados"));
}
/* Lista de pedidos para despachar (pendientes + preparados), por empresa y tipo de envío */
function despListaHTML(){
  const arr=soloPedidos().filter(p=>["pendiente","preparado"].includes(p.estado) && !p.cerradoEn)
    .sort((a,b)=>(a.creado||0)-(b.creado||0));
  if(!arr.length) return `<div class="card" style="margin-top:14px"><div class="muted" style="text-align:center;padding:18px">No hay pedidos para despachar 👍</div></div>`;
  const emps=[...new Set(arr.map(p=>p.empresa||""))];
  let html="";
  emps.forEach(e=>ENVIOS_PREP.forEach(t=>{
    const g=arr.filter(p=>(p.empresa||"")===e && tipoEnvioPrep(p)===t.id); if(!g.length) return;
    const conFoto=g.filter(p=>p.fotoPrep).length;
    html+=`<div class="label" style="margin:16px 0 6px">${esc(e?nombreEmp(e):"Sin empresa")} · ${t.nombre} · ${conFoto}/${g.length} con foto</div>`;
    html+=g.map(p=>{ const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
      const aviso=p.despachoAviso&&!p.despachoAvisoVisto;
      return `<div class="card" style="margin-bottom:8px;padding:10px 12px;cursor:pointer;${aviso?'border:1px solid #e5484d':''}" onclick="despElegir('${p.id}')">
        <div class="row" style="gap:10px;align-items:center;flex-wrap:nowrap">
          ${p.fotoPrep?`<img src="${p.fotoPrep}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex:0 0 auto">`
            :`<div style="width:48px;height:48px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:20px">📷</div>`}
          <div style="min-width:0;flex:1">
            <div style="font-weight:700">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:12px">· N° ${esc(numOrden(p))}</span></div>
            <div style="font-size:12.5px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${its.map(x=>x.cant+"× "+esc(x.prodNombre)).join(" · ")||'sin productos'}</div>
          </div>
          <span style="flex:0 0 auto;font-size:12px;font-weight:700;color:${aviso?'#e5484d':(p.estado==='preparado'?'var(--green)':'var(--text-3)')}">${aviso?'⚠ Aviso':(p.estado==='preparado'?'✓ Preparado':(p.fotoPrep?'📷 Con foto':'Pendiente'))}</span>
        </div></div>`; }).join("");
  }));
  return html;
}
function despElegir(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  DESP={id, foto:p.fotoPrep||"", check:{}, avisos:[], guardada:!!p.fotoPrep, manual:true};
  vistaDespachar(); window.scrollTo(0,0);
}
async function despFotoPara(id,file){
  if(!file) return;
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  try{
    const foto=await comprimirFoto(file);
    await guardarFotoPedido(id, foto);
    DESP.foto=foto; DESP.guardada=true; toast("📷 Foto guardada en el pedido de "+(p.cliente||""));
    telegramPedido(p, foto, "📷 PEDIDO CON FOTO", p.fotoPrep?["Reemplazó una foto anterior"]:[]);
    vistaDespachar();
  }catch(e){ notify("No pude guardar la foto: "+(e.message||e)); }
}
function despCardHTML(p){
  const its=(()=>{ try{ return itemsPedido(p); }catch(e){ return []; } })();
  const av=DESP.avisos||[];
  return `<div class="card" style="margin:14px 0">
    <div class="row" style="gap:12px;align-items:flex-start;flex-wrap:nowrap">
      ${DESP.foto?`<img src="${DESP.foto}" onclick="verFotoPedido('${p.id}')" style="width:110px;height:110px;object-fit:cover;border-radius:12px;flex:0 0 auto;cursor:pointer">`
        :`<label style="width:110px;height:110px;border-radius:12px;border:2px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto;cursor:pointer;font-size:12px;text-align:center">📷<span>Subir foto</span>
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="despFotoPara('${p.id}',this.files[0]);this.value=''"></label>`}
      <div style="min-width:0">
        <div style="font-size:18px;font-weight:800">${esc(p.cliente||'—')}</div>
        <div class="muted" style="font-size:13px">N° ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa))} · ${esc(ENVIOS_PREP.find(t=>t.id===tipoEnvioPrep(p)).nombre)}</div>
        <div class="muted" style="font-size:13px">Estado: ${esc(estObj(p.estado).label)}</div>
        ${DESP.guardada?`<div style="margin-top:6px;font-size:13px;font-weight:700;color:var(--green)">📷 Foto guardada en este pedido ✓</div>`:''}
      </div>
    </div>
    ${av.length?`<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#ffe8e8;color:#7a1f1f;font-size:14px">
      ${av.map(t=>`<div>⚠ ${esc(t)}</div>`).join("")}</div>`:''}
    <div class="label" style="margin-top:14px">Tiene que llevar (podés tildar para controlar)</div>
    ${its.length?its.map((x,i)=>`<label class="row" style="gap:10px;padding:9px 0;border-top:.5px solid var(--border);cursor:pointer;font-size:15px;flex-wrap:nowrap;align-items:center">
        <input type="checkbox" ${DESP.check[i]?'checked':''} onchange="DESP.check[${i}]=this.checked" style="width:22px;height:22px;accent-color:var(--green);flex:0 0 auto">
        <span><b>${x.cant}×</b> ${esc(x.prodNombre)}</span></label>`).join("")
      :`<div class="muted">Este pedido no tiene productos cargados.</div>`}
    <button class="btn block green" style="margin-top:14px" onclick="despConfirmar()">✓ Todo coincide${p.estado==="pendiente"?' → marcar PREPARADO':''}</button>
    <button class="btn block" style="margin-top:8px;background:#e5484d;color:#fff" onclick="despNoCoincide()">✗ Algo no coincide → avisar</button>
    <label class="btn block" style="margin-top:8px;cursor:pointer">📷 Siguiente foto
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="DESP=null;despFoto(this.files[0]);this.value=''"></label>
    <button class="btn block ghost" style="margin-top:8px" onclick="DESP=null;vistaDespachar()">Volver</button>
  </div>`;
}
async function despFoto(file){
  if(!file) return;
  toast("Leyendo la etiqueta…");
  let codigos=[], foto="";
  try{ [codigos,foto]=await Promise.all([leerCodigosDeFoto(file), comprimirFoto(file)]); }
  catch(e){ notify("No pude leer la foto: "+(e.message||e)); return; }
  let p=codigos.length?await buscarPedidoPorCodigos(codigos):null;
  if(!p){
    // no se leyó o no está cargado: dejo elegir el pedido a mano y queda el aviso
    const pend=soloPedidos().filter(x=>["pendiente","preparado"].includes(x.estado)).sort((a,b)=>(a.cliente||"").localeCompare(b.cliente||""));
    const motivo=codigos.length?"La etiqueta de la foto no corresponde a ningún pedido cargado":"No se pudo leer la etiqueta en la foto";
    enviarTelegram("❌ FOTO SIN ASIGNAR\n\n"+motivo+(codigos.length?("\nCódigo leído: "+codigos.join(" | ").slice(0,200)):"")+"\n\n🕒 "+new Date().toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}), foto);
    const lista=pend.map((x,i)=>(i+1)+". "+(x.cliente||"—")+" · "+numOrden(x)).join("\n");
    const r=prompt("⚠ "+motivo+".\n\nSi sabés de quién es, escribí el número de la lista (o dejalo vacío para sacar otra foto):\n\n"+lista.slice(0,1800));
    const n=parseInt(r,10); if(!n||!pend[n-1]){ toast("Probá otra foto con la etiqueta más cerca"); return; }
    p=pend[n-1];
    DESP={id:p.id, foto, check:{}, avisos:[motivo+" (se eligió a mano)"]};
  } else {
    DESP={id:p.id, foto, check:{}, avisos:p.porCP?["Encontrado solo por código postal — confirmá que sea este cliente"]:[]};
    delete p.porCP;
  }
  // controles automáticos
  if(p.estado==="anulado") DESP.avisos.push("El pedido está ANULADO");
  else if(!["pendiente","preparado"].includes(p.estado)) DESP.avisos.push("El pedido ya figura como "+estObj(p.estado).label);
  if(p.fotoPrep) DESP.avisos.push("Este pedido ya tenía foto ("+fmt(p.fotoPrepTs)+") — se reemplaza por la nueva. ¿Se armó dos veces?");
  const its=(()=>{ try{ return itemsPedido(p); }catch(e){ return []; } })();
  if(!its.length) DESP.avisos.push("El pedido no tiene productos cargados");
  if((p.prods||[]).some(x=>x&&x.reconocido===false)) DESP.avisos.push("Tiene productos sin reconocer en el catálogo");
  if(DESP.avisos.length) try{ navigator.vibrate&&navigator.vibrate([300,100,300]); }catch(e){ logErr("auto",e); }
  // la foto queda guardada en ESE pedido apenas se encuentra (aunque después no toquen nada)
  try{ await guardarFotoPedido(p.id, foto); DESP.guardada=true; toast("📷 Foto guardada en el pedido de "+(p.cliente||""));
    telegramPedido(p, foto, DESP.avisos.length?"⚠ PEDIDO CON FOTO — REVISAR":"📷 PEDIDO CON FOTO", DESP.avisos); }
  catch(e){ notify("No pude guardar la foto: "+(e.message||e)); }
  OPVIEW="despachar"; vistaDespachar();
}
async function despConfirmar(){
  const p=PEDIDOS.find(x=>x.id===DESP.id); if(!p) return;
  const its=(()=>{ try{ return itemsPedido(p); }catch(e){ return []; } })();
  const faltan=its.filter((x,i)=>!DESP.check[i]);
  if(faltan.length && !await askConfirm("¿Está todo lo del pedido en la foto?\n\n"+its.map(x=>"• "+x.cant+"× "+x.prodNombre).join("\n")+"\n\nSi falta algo, tocá Cancelar y después \"Algo no coincide\".")) return;
  if(!DESP.foto && !await askConfirm("Este pedido no tiene foto. ¿Marcarlo igual?")) return;
  if(DESP.foto&&!DESP.guardada){ try{ await guardarFotoPedido(p.id, DESP.foto); DESP.guardada=true; }catch(e){ console.warn(e); } }
  const patch={};
  if(DESP.avisos.length){ Object.assign(patch,{despachoAviso:true, despachoAvisoVisto:false, despachoAvisoTs:Date.now(), despachoAvisoTxt:DESP.avisos.slice()}); }
  if(Object.keys(patch).length) await DB.update(p.id,patch);
  if(p.estado==="pendiente" && !DESP.avisos.some(a=>/ANULADO/.test(a))) await avanzar(p.id,"preparado","Preparado · verificado con foto en Despacho");
  toast("✓ "+(p.cliente||"Pedido")+(DESP.avisos.length?" guardado con aviso ⚠":" listo 📷"));
  DESP=null; vistaDespachar();
}
async function despNoCoincide(){
  const p=PEDIDOS.find(x=>x.id===DESP.id); if(!p) return;
  const its=(()=>{ try{ return itemsPedido(p); }catch(e){ return []; } })();
  const noVistos=its.filter((x,i)=>!DESP.check[i]).map(x=>"Falta en la foto: "+x.cant+"× "+x.prodNombre);
  const nota=prompt("¿Qué no coincide? (ej: falta un frasco, mandaron otro producto, etiqueta de otro cliente)", "");
  if(nota===null) return;
  const txt=DESP.avisos.concat(noVistos, nota.trim()?["Nota: "+nota.trim()]:[]);
  if(!txt.length) txt.push("Marcado como que no coincide");
  if(DESP.foto&&!DESP.guardada){ try{ await guardarFotoPedido(p.id, DESP.foto); DESP.guardada=true; }catch(e){ console.warn(e); } }
  await DB.update(p.id,{despachoAviso:true, despachoAvisoVisto:false, despachoAvisoTs:Date.now(), despachoAvisoTxt:txt});
  telegramPedido(p, DESP.foto||p.fotoPrep, "🚨 ALGO NO COINCIDE — NO SE MARCÓ PREPARADO", txt);
  toast("⚠ Aviso enviado · el pedido NO se marcó como preparado");
  DESP=null; vistaDespachar();
}
async function despAvisoVisto(id){ await DB.update(id,{despachoAvisoVisto:true}); toast("Aviso resuelto"); vistaDespachar(); }
function abrirEtiquetaPDF(p){
  try{
    const bin=atob(p.etiquetaPdf); const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([arr],{type:"application/pdf"}));
    window.open(url,"_blank");
  }catch(e){ toast("No pude abrir el PDF adjunto"); }
}
/* Código corto para reportes: LABS#0004554 / NUTRI#... / FULLMI#... según la empresa */
function codigoOrden(p){
  const pre = p.empresa==="labs" ? "LABS" : p.empresa==="nutrivibe" ? "NUTRI" : p.empresa==="sc" ? "SC" : "FULLMI";
  const num = ((p&&p.ref)||"").replace(/\D/g,"");
  if(num) return pre+"#"+num.padStart(7,"0");
  return pre+"#"+String(p&&p.id||"").slice(-6).toUpperCase();
}
const soloReabas=()=>PEDIDOS.filter(p=>p.tipo==="reabastecimiento");
