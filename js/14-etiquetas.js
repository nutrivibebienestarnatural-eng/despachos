/* ============================================================
   14-etiquetas — Carga de stock, etiquetas imprimibles y etiqueta térmica 10x15
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
async function confirmarCarga(){
  const items=(window.__carga||[]).filter(i=>i.prod);
  if(!items.length){ toast("Nada para cargar"); return; }
  try{
    await agregarMovs(items.map(it=>({prod:it.prod,tipo:"entrada",cant:Math.abs(+it.cant||0),motivo:"Carga de stock"})));
    // VERIFICACIÓN REAL: releer del servidor y confirmar que quedaron
    if(true){
      const n=(stockState().movs||[]).length;
      if(n>=items.length){ notify("✅ CARGA CONFIRMADA POR EL SERVIDOR\n\nEl registro de stock tiene "+n+" movimientos guardados en Firebase.\nVersión de la app: "+APP_VERSION); }
      else { notify("⚠️ El servidor devolvió "+n+" movimientos (esperaba al menos "+items.length+").\nVersión: "+APP_VERSION+"\nSacá captura y pasásela a Claude."); return; }
    } else { toast(items.length+" productos cargados ✅"); }
  }catch(e){ notify("⚠️ No pude guardar el stock en la base: "+(e&&e.message||e)+"\nVersión: "+APP_VERSION+"\n\nSacale captura a este mensaje."); return; }
  window.__carga=null; OPVIEW="stock"; setTimeout(()=>vistaOperador(),600);
}
function ordenCompra(){ imprimirReposicion(); }
function imprimirReposicion(){
  const st=stockState();
  const lst=PRODUCTOS.map(p=>{ const stk=nivel(p.nombre,st), mn=minDe(p.nombre,st);
    const pedir=pedirDe(p.nombre,st); return pedir>0?{nombre:p.nombre,stk,pedir}:null; }).filter(Boolean)
    .sort((a,b)=>a.nombre.localeCompare(b.nombre));
  if(!lst.length){ toast("No hay nada para reponer 🎉"); return; }
  const w=window.open("","_blank","width=860,height=920");
  if(!w){ toast("Permití las ventanas emergentes"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  const total=lst.reduce((s,r)=>s+r.pedir,0);
  const filas=lst.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.nombre)}</td><td class="c">${r.stk}</td><td class="c b">${r.pedir}</td><td></td></tr>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Reposición</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:20px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}'+
    'th,td{border:1px solid #999;padding:7px 9px;text-align:left}th{background:#2c3e50;color:#fff}'+
    '.c{text-align:center}.b{font-weight:bold}tbody tr:nth-child(even) td{background:#f2f4f7}'+
    'td:last-child{width:70px}@page{size:A4;margin:14mm}</style></head><body>'+
    '<h1>Planilla de reposición</h1>'+
    '<p>Fecha: '+hoy+' · '+lst.length+' productos a pedir · '+total+' unidades en total</p>'+
    '<table><thead><tr><th class="c">#</th><th>Producto</th><th class="c">Tengo</th><th class="c">Pedir</th><th class="c">Recibido</th></tr></thead>'+
    '<tbody>'+filas+'</tbody></table>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}

/* ---------- OPERADOR · Preparación (picking + escaneo) ---------- */
let INF_PERIODO="periodo";   // por defecto: desde el último cierre
function infDesde(){ const d=new Date();
  if(INF_PERIODO==="periodo"){ return ultimoCierreTs(); }   // período abierto
  if(INF_PERIODO==="hoy"){ d.setHours(0,0,0,0); return d.getTime(); }
  if(INF_PERIODO==="7d"){ d.setDate(d.getDate()-7); return d.getTime(); }
  if(INF_PERIODO==="30d"){ d.setDate(d.getDate()-30); return d.getTime(); }
  return 0; }
function setInfPeriodo(p){ INF_PERIODO=p; vistaOperador(); }
function vistaInformes(){
  const desde=infDesde();
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.creado||0)>=desde && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO");
  let unidades=0; peds.forEach(p=>{ try{ unidades+=itemsPedido(p).reduce((s,i)=>s+(i.cant||0),0); }catch(e){ logErr("auto",e); } });
  const aCobrar=peds.reduce((s,p)=>s+costoEnvio(p),0);
  const zc=zonaCosto(); const esCadeteCat=c=>["caba","1","2","3"].includes(c);
  const aCardinal=peds.reduce((s,p)=>{ const c=catPedido(p); const q=p.metodo==="correo"?"Correo":(p.cadete||"");
    return s+((esCadeteCat(c)&&p.metodo!=="correo"&&cadeteCobra(q))?costoCard(p,c,zc):0); },0);
  const cats=[["caba","CABA",0],["1","Zona 1",1],["2","Zona 2",2],["3","Zona 3",3],["correo","Correo",null],["pickit","Pickit",null]];
  const porZona=cats.map(([c,lbl,anillo])=>{ const g=peds.filter(p=>catPedido(p)===c);
    return {c,lbl,anillo,n:g.length, cobrar:g.reduce((s,p)=>s+costoEnvio(p),0), cardinal:esCadeteCat(c)?g.reduce((s,p)=>s+costoCard(p,c,zc),0):0}; }).filter(z=>z.n>0);
  const dias=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    const ini=d.getTime(), fin=ini+86400000;
    dias.push({ lbl:d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric"}), n:soloPedidos().filter(p=>(p.creado||0)>=ini&&(p.creado||0)<fin&&p.estado!=="anulado").length }); }
  const maxDia=Math.max(1,...dias.map(d=>d.n));
  const acc={}; peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>{ const k=it.prodNombre||it.nombre; acc[k]=(acc[k]||0)+(it.cant||0); }); }catch(e){ logErr("auto",e); } });
  const top=Object.entries(acc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const st=stockState(); const bajo=PRODUCTOS.map(pr=>({nombre:pr.nombre,falta:pedirDe(pr.nombre,st),nivel:nivel(pr.nombre,st)})).filter(x=>x.falta>0).sort((a,b)=>b.falta-a.falta).slice(0,12);
  const perBtn=(k,l)=>`<button class="${INF_PERIODO===k?'on':''}" ${INF_PERIODO===k?'':`onclick="setInfPeriodo('${k}')"`}>${l}</button>`;
  const cierreTs=ultimoCierreTs();
  app().innerHTML=`
    ${segOp('informes')}
    <div class="title">Informes</div>
    <div class="row" style="margin:6px 0 14px"><div class="seg">${perBtn('periodo','Período abierto')}${perBtn('hoy','Hoy')}${perBtn('7d','7 días')}${perBtn('30d','30 días')}${perBtn('todo','Todo')}</div></div>
    ${INF_PERIODO==="periodo"?`<div class="hint" style="margin:-6px 0 12px">${cierreTs?("Período abierto desde el cierre del "+new Date(cierreTs).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" hs"):"Todavía no hiciste ningún cierre: se muestra todo."}</div>`:""}
    <div class="row" style="margin-bottom:14px">
      <button class="btn ghost sm" onclick="pantallaCuenta()">💵 Cuenta · a cobrar</button>
      <button class="btn ghost sm" onclick="pantallaZonas()">🗺️ Envíos por zona</button>
      <button class="btn ghost sm" onclick="pantallaSalidas()">📦 Qué sacó cada uno</button>
      <button class="btn ghost sm" onclick="pantallaCierre()">🔒 Cierre de período</button>
    </div>
    <div class="kpis">
      <div class="kpi">${icon('store')}<div class="n">${peds.length}</div><div class="l">Pedidos</div></div>
      <div class="kpi">${icon('box')}<div class="n">${unidades}</div><div class="l">Unidades</div></div>
      <div class="kpi"><div class="n" style="color:var(--accent)">${fmtAr(aCobrar)}</div><div class="l">A cobrar (envíos)</div></div>
      <div class="kpi"><div class="n" style="color:#e5484d">${fmtAr(aCardinal)}</div><div class="l">A pagar Cardinal</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <span class="label">Por zona</span>
      ${porZona.length?porZona.map(z=>`
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:.5px solid var(--border)">
          <span style="width:11px;height:11px;border-radius:50%;background:${anilloColor(z.anillo)};flex:0 0 auto"></span>
          <div style="flex:1;min-width:0"><b>${z.lbl}</b> · ${z.n} pedido${z.n===1?'':'s'}</div>
          <div style="text-align:right;font-size:13px">
            <div>cobrás <b>${fmtAr(z.cobrar)}</b></div>
            ${z.cardinal?`<div class="muted">Cardinal ${fmtAr(z.cardinal)}</div>`:''}
          </div>
        </div>`).join(""):'<div class="hint" style="margin:8px 0 0">Sin pedidos en el período.</div>'}
    </div>
    <div class="card" style="margin-top:14px">
      <span class="label">Pedidos por día (últimos 7)</span>
      <div style="display:flex;align-items:flex-end;gap:6px;height:112px;margin-top:12px">
        ${dias.map(d=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;justify-content:flex-end;height:100%">
          <div style="font-size:12px;font-weight:700">${d.n||''}</div>
          <div style="width:100%;background:var(--accent);border-radius:6px 6px 0 0;height:${Math.round(d.n/maxDia*76)+3}px;opacity:${d.n?1:.15}"></div>
          <div class="muted" style="font-size:11px;text-transform:capitalize;text-align:center">${esc(d.lbl)}</div>
        </div>`).join("")}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <span class="label">Productos más pedidos</span>
      ${top.length?top.map(([n,c],i)=>`<div style="display:flex;gap:10px;padding:8px 0;border-top:.5px solid var(--border)">
        <span class="muted" style="width:18px;flex:0 0 auto">${i+1}</span><div style="flex:1;min-width:0">${esc(n)}</div><b style="flex:0 0 auto">${c}</b></div>`).join(""):'<div class="hint" style="margin:8px 0 0">Sin datos en el período.</div>'}
    </div>
    <div class="card" style="margin-top:14px">
      <span class="label">Stock a reponer <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· saldo actual, no se reinicia</span></span>
      ${bajo.length?bajo.map(x=>`<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:.5px solid var(--border)">
        <div style="flex:1;min-width:0">${esc(x.nombre)}</div><span class="muted" style="font-size:13px;flex:0 0 auto">tenés <b style="color:${x.nivel<0?'#e5484d':'inherit'}">${x.nivel}</b>${x.nivel<0?' ⚠':''}</span> <b style="color:#e5484d;flex:0 0 auto">faltan ${x.falta}</b></div>`).join(""):'<div class="hint" style="margin:8px 0 0">Todo el stock OK 👍</div>'}
    </div>`;
}
async function prepararDirecto(id){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(!p){ toast("No encontré el pedido"); return; }
  const desc=descuentoActivo();
  if(!await askConfirm("¿Marcar este pedido como PREPARADO?"+(desc?"\n\nSe descuenta del stock (los kits se abren en sus productos).":""))) return;
  await avanzar(id,"preparado");   // avanzar descuenta el stock nominal (kits expandidos) si el descuento está activo
  toast("Pedido preparado ✓");
}
function vistaPreparacion(){
  const pend=soloPedidos().filter(p=>p.estado==="pendiente");
  const pick=pickingConsolidado();
  const unidades=pick.reduce((s,r)=>s+r.cant,0);
  app().innerHTML=`
    ${segOp('preparacion')}
    <div class="title">Preparación</div>
    <div class="subtitle">${pend.length} pedidos por preparar · ${unidades} unidades a pickear</div>
    <div class="row" style="margin-bottom:16px;flex-wrap:wrap">
      <button class="btn ghost" onclick="hojaEnvios()">${icon('printer')} Hoja de envíos (correo)</button>
      ${pend.length?`<button class="btn ghost" onclick="pantallaEtiquetas()">${icon('printer')} Imprimir etiquetas</button>`:""}
      ${pend.length?`<button class="btn ghost" onclick="pickeoPend()">${icon('printer')} Etiquetas de pickeo</button>`:""}
    </div>
    <div class="card" style="margin-bottom:16px">
      <span class="label" style="margin:0">Lista de pickeo · qué juntar hoy</span>
      <button class="btn sm ghost" style="float:right;margin-top:-2px" onclick="imprimirChecklistDia()">🖨️ Imprimir checklist 10×15</button>
      <div class="hint" style="margin:4px 0 2px">Total de unidades a preparar de todos los pedidos pendientes (los kits ya vienen abiertos en sus productos).</div>
      ${pick.map(r=>`<div class="row" style="justify-content:space-between;padding:11px 0 0;border-top:.5px solid var(--border);margin-top:9px">
          <span class="row" style="gap:8px">${icon('box')} ${esc(r.nombre)}</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:700">${r.cant}</span>
        </div>`).join("")||empty('check','No hay nada pendiente de preparar.')}
    </div>
    <div class="label">Pedidos por preparar</div>
    ${pend.map(p=>`<div class="order">
      <div class="top"><span class="code">${esc(p.id)}</span>
        <span class="chip ${canalDe(p)==='ml_flex'?'flex':'tn'}">${esc(empresaObj(p.empresa).nombre)}</span></div>
      <div class="who">${esc(p.cliente)}</div>
      <div><span class="tag">Items</span> ${esc(p.items||'—')}</div>
      ${fotoPedidoHTML(p)}
      <div class="acts">
        <button class="btn sm green" onclick="prepararDirecto('${p.id}')">${icon('check')} Marcar preparado</button>
        <button class="btn sm ghost" onclick="imprimirPickeo('${p.id}')">${icon('printer')} Pickeo</button>
        <button class="btn sm ghost" onclick="imprimirEtiqueta('${p.id}')">${icon('printer')}Etiqueta</button>
      </div></div>`).join("")||empty('check','Todo preparado.')}`;
}
function procesarScan(code){
  if(!code||!code.trim()) return;
  const prod=prodPorBarcode(code);
  if(!prod){ toast("Código no reconocido: "+code); return; }
  const row=pickingConsolidado().find(r=>matchNombre(r.nombre,prod.nombre));
  if(!row){ toast(prod.nombre+": no está en el picking de hoy"); return; }
  const k=row.nombre.toLowerCase();
  PICK[k]=Math.min((PICK[k]||0)+1,row.cant);
  toast(prod.nombre+"  "+PICK[k]+"/"+row.cant);
  vistaPreparacion();
}

/* ===== Preparar un pedido escaneando sus productos ===== */
let PREP_ID=null, PREP_SCAN={}, PREP_REAL={};   // PREP_SCAN: progreso por renglón del pedido · PREP_REAL: producto real escaneado (para descontar lo que salió)
function itemsPedido(p){
  const out=[];
  // Si la orden tiene productos elegidos del catálogo, esos mandan — pero expandimos packs conocidos
  if(p.prods && p.prods.length){
    p.prods.filter(x=>x&&x.nombre&&x.cant>0).forEach(x=>{
      // x.noPack: cantidad puesta a mano por una persona (corrección manual, o se descartó un pack
      // aprendido que no correspondía a este pedido) — no se vuelve a buscar NINGÚN pack para esto,
      // ni por SKU ni por nombre, así no se puede volver a multiplicar solo.
      const comps=x.noPack?null:packComponentes(x.nombre, x.sku);
      // UN SOLO componente NUNCA multiplica cantidad — es nomás el vínculo SKU→nombre de catálogo
      // ("Vincular a mi producto"), aunque alguna vez se haya guardado con un cant>1 por error. Eso
      // fue la causa de varios líos (Adrelax, Inulina): un pack de un solo producto aprendido con
      // cantidad mal, que se re-aplicaba solo cada vez que se volvía a mirar el pedido. Multiplicar
      // cantidad real solo tiene sentido para kits de VARIOS productos distintos (2+ componentes).
      const esAliasSimple = comps && comps.length===1;
      if(comps && comps.length>=2){ comps.forEach(c=>out.push({nombre:c.nombre+"  (pack)", cant:(+x.cant||1)*c.cant, prodNombre:c.nombre, kit:true})); }
      else if(esAliasSimple){
        // ojo: el mismo SKU corto de ML puede haber quedado enseñado para OTRO producto en otro pedido
        // (pasó con "CURC"). Si este pedido ya tiene guardado un nombre de catálogo válido y DISTINTO
        // al del alias, confío en lo que ya quedó resuelto acá — no lo piso con un vínculo viejo/ajeno.
        const yaResuelto = x.nombre!==comps[0].nombre && PRODUCTOS.some(pp=>pp.nombre===x.nombre);
        const nombreFinal = yaResuelto ? x.nombre : comps[0].nombre;
        out.push({nombre:nombreFinal, cant:+x.cant||1, prodNombre:nombreFinal});   // cant SIEMPRE la real del pedido, nunca comps[0].cant
      }
      else out.push({nombre:x.nombre, cant:+x.cant||1, prodNombre:x.nombre});
    });
    return out;
  }
  parseItems(p.items||"").forEach(it=>{
    const aprendido=packComponentes(it.nombre);   // si ya aprendiste este kit, mandan sus componentes
    const aliasSimple = aprendido && aprendido.length===1;   // un solo componente nunca multiplica cantidad
    if(aprendido && aliasSimple){ out.push({nombre:aprendido[0].nombre, cant:it.cant||1, prodNombre:aprendido[0].nombre}); return; }
    if(aprendido && aprendido.length>=2){ aprendido.forEach(c=>out.push({nombre:c.nombre+"  (pack)", cant:(it.cant||1)*c.cant, prodNombre:c.nombre, kit:true})); return; }
    const ke=kitEspecial(it.nombre);
    if(ke){ ke.comps.forEach(cmp=>{ const prod=mejorProducto(cmp.n);
        out.push({nombre:cmp.n+"  (kit)", cant:(it.cant||1)*cmp.c, prodNombre:prod?prod.nombre:cmp.n, kit:true}); }); return; }
    if(esKit(it.nombre)){
      const comps=componentesKit(it.nombre);
      if(comps.length>=2){ comps.forEach(c=>{ const prod=mejorProducto(c);
        out.push({nombre:c+"  (kit)", cant:it.cant||1, prodNombre:prod?prod.nombre:c, kit:true}); }); return; }
    }
    const prod=mejorProducto(it.nombre);
    out.push({nombre:it.nombre, cant:it.cant||1, prodNombre:prod?prod.nombre:it.nombre});
  });
  return out;
}
async function repararProdsPedidos(){
  const sinProds=soloPedidos().filter(p=>(!p.prods||!p.prods.length) && (p.items||"").trim() && p.estado!=="anulado");
  if(!sinProds.length){ toast("Todos los pedidos ya tienen sus productos cargados 👍"); return; }
  let reparados=0, dudosos=[];
  for(const p of sinProds){
    const r=prodsDesdeTexto(p.items||""); const prods=r.ok;
    r.dudosos.forEach(x=>dudosos.push(p.cliente+": "+x));
    if(prods.length){ try{ await DB.update(p.id,{prods}); reparados++; }catch(e){ logErr("auto",e); } }
  }
  let msg="✅ "+reparados+" pedidos reparados (ahora descuentan bien).";
  if(dudosos.length) msg+="\n\n⚠ "+dudosos.length+" productos no se reconocieron y quedaron sin cargar:\n"+dudosos.slice(0,10).join("\n");
  notify(msg); render();
}
/* Tipo de envío para agrupar la preparación */
const ENVIOS_PREP=[{id:"cadete",nombre:"🛵 Cadete / Flex"},{id:"pickit",nombre:"📦 Pickit"},{id:"correo",nombre:"✉️ Correo"}];
function tipoEnvioPrep(p){ if(p.pickit) return "pickit"; if(p.metodo==="correo") return "correo"; return "cadete"; }
let PREP_EMP="todas", PREP_ENV="todos";
function vistaPrepararHoy(){
  const todos=soloPedidos().filter(p=>p.estado==="pendiente" && !p.cerradoEn).sort((a,b)=>(a.creado||0)-(b.creado||0));
  const arr=todos.filter(p=>(PREP_EMP==="todas"||(p.empresa||"")===PREP_EMP) && (PREP_ENV==="todos"||tipoEnvioPrep(p)===PREP_ENV));
  const cuenta=(fn)=>todos.filter(fn).length;
  const empsConPed=[...new Set(todos.map(p=>p.empresa||""))];
  const chip=(on,txt,n,click)=>`<button class="${on?'on':''}" onclick="${click}">${txt} <b style="opacity:.7">${n}</b></button>`;
  // grupos: empresa → tipo de envío
  const grupos=[];
  empsConPed.filter(e=>PREP_EMP==="todas"||e===PREP_EMP).forEach(e=>{
    ENVIOS_PREP.forEach(t=>{ const g=arr.filter(p=>(p.empresa||"")===e && tipoEnvioPrep(p)===t.id); if(g.length) grupos.push({e,t,g}); });
  });
  let nro=0;
  app().innerHTML=`
    ${segOp('hoy')}
    <button class="btn sm ghost" onclick="OPVIEW='hoy';vistaOperador()">← Volver a Hoy</button>
    ${ROL!=="admin"&&!SOLO_FOTO?`<div class="seg" style="margin-top:12px"><button class="on">Preparar</button><button onclick="OPVIEW='despachar';render()">📷 Despacho</button></div>`:''}
    <div class="title" style="margin-top:14px">Preparar pedidos</div>
    <div class="subtitle">Elegí empresa y tipo de envío. Entrá a uno, escaneá sus productos, y cerralo.</div>
    <label class="btn block green" style="cursor:pointer;margin-top:10px">📷 Foto del pedido armado (detecta el cliente por la etiqueta)
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="fotoDetectarPedido(this.files[0]);this.value=''"></label>
    <div class="hint" style="margin:6px 0 4px;text-align:center">Que se vea el QR de la etiqueta. Te muestro de quién es y lo marcás como preparado.</div>
    <div class="seg" style="flex-wrap:wrap;margin:10px 0 8px">
      ${chip(PREP_EMP==="todas","Todas",todos.length,"PREP_EMP='todas';vistaPrepararHoy()")}
      ${empsConPed.map(e=>chip(PREP_EMP===e,esc(e?nombreEmp(e):"Sin empresa"),cuenta(p=>(p.empresa||"")===e),`PREP_EMP='${e}';vistaPrepararHoy()`)).join("")}
    </div>
    <div class="seg" style="flex-wrap:wrap;margin-bottom:14px">
      ${chip(PREP_ENV==="todos","Todos los envíos",cuenta(p=>PREP_EMP==="todas"||(p.empresa||"")===PREP_EMP),"PREP_ENV='todos';vistaPrepararHoy()")}
      ${ENVIOS_PREP.map(t=>chip(PREP_ENV===t.id,t.nombre,cuenta(p=>(PREP_EMP==="todas"||(p.empresa||"")===PREP_EMP)&&tipoEnvioPrep(p)===t.id),`PREP_ENV='${t.id}';vistaPrepararHoy()`)).join("")}
    </div>
    ${!arr.length?`<div class="card"><div class="muted" style="text-align:center;padding:24px">No hay pedidos para preparar con este filtro 👍</div></div>`:
      grupos.map(({e,t,g})=>`<div class="label" style="margin:16px 0 8px;font-size:14px">${esc(e?nombreEmp(e):"Sin empresa")} · ${t.nombre} · ${g.length} ${g.length===1?'pedido':'pedidos'}</div>`+
      g.map(p=>{ const i=nro++; const it=(()=>{try{return itemsPedido(p);}catch(e){return[];}})();
        const uds=it.reduce((s,x)=>s+x.cant,0);
        return `<div class="card" style="margin-bottom:10px;cursor:pointer" onclick="abrirPreparar('${p.id}')">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div style="min-width:0">
              <b style="font-size:16px">${i+1}. ${esc(p.cliente||'—')}</b>
              <div class="muted" style="font-size:12px">N° ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa).split(" ")[0])} · ${uds} ${uds===1?'producto':'productos'}</div>
              <div style="font-size:13px;color:var(--text-2);margin-top:4px">${it.map(x=>x.cant+"× "+esc(x.prodNombre)).join(" · ")}</div>
            </div>
            <button class="btn sm" style="flex:0 0 auto" onclick="event.stopPropagation();abrirPreparar('${p.id}')">Preparar →</button>
          </div>
        </div>`; }).join("")).join("")}`;
}
function abrirPreparar(id){ PREP_ID=id; PREP_SCAN={}; PREP_REAL={}; PREP_ALERTAS=[]; OPVIEW='preparar'; render(); }
/* muestra en Listados/Hoy los pedidos que se cerraron con inconsistencias autorizadas */
function pedidosConAviso(){ return soloPedidos().filter(p=>p.prepConAviso && p.prepAlertas && p.prepAlertas.length); }
function pantallaPreparar(id){
  const p=PEDIDOS.find(x=>x.id===id);
  if(!p){ PREP_ID=null; OPVIEW='prepararhoy'; return vistaOperador(); }
  PREP_ID=id;
  const items=itemsPedido(p);
  const kitsND=kitsSinAprender(p);           // kits de este pedido que todavía no sé qué descuentan
  const sinProds=!items.length;
  const total=items.reduce((s,i)=>s+i.cant,0);
  const hechas=items.reduce((s,i)=>s+Math.min(PREP_SCAN[i.prodNombre]||0,i.cant),0);
  const completo=items.length>0 && !kitsND.length && items.every(i=>(PREP_SCAN[i.prodNombre]||0)>=i.cant);
  const cam=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  app().innerHTML=`
    <button class="btn sm ghost" onclick="PREP_ID=null;PREP_SCAN={};PREP_REAL={};PREP_MANUAL={};PREP_ALERTAS=[];OPVIEW='prepararhoy';vistaOperador()">← Volver a la lista</button>
    <div class="title" style="margin-top:14px">Preparar pedido</div>
    <div class="subtitle">${esc(p.cliente||'—')} · N° ${esc(numOrden(p))} · ${esc(empresaObj(p.empresa).nombre)}</div>
    ${kitsND.length?`<div class="card" style="border:1.5px solid #e0b000;background:#fff8e6;margin-top:14px;padding:16px 18px">
      <b style="color:#7a5a00;font-size:15.5px">📦 Hay ${kitsND.length===1?'un kit que todavía no sé':'kits que todavía no sé'} qué descuenta${kitsND.length===1?'':'n'}</b>
      <div style="font-size:13.5px;color:#5a4400;margin:6px 0 12px">Enseñame los frascos que lleva cada uno (una sola vez) y a partir de ahí se abren solos y descuentan bien el stock. No se puede confirmar el pedido hasta enseñarlos.</div>
      ${kitsND.map(k=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;margin-top:8px;background:#fff;border:1px solid #e6c65a;border-radius:10px">
        <span style="font-size:14px;font-weight:600;min-width:0;color:#5a4400">${esc(k.nombre)}</span>
        <button class="btn sm" style="flex:0 0 auto;padding:7px 12px" onclick="enseniarKitPrep('${encodeURIComponent(k.nombre)}','${encodeURIComponent(k.sku||'')}')">Enseñar qué descuenta</button>
      </div>`).join("")}
    </div>`:''}
    ${sinProds?`<div class="card" style="border:1.5px solid #e5484d;background:#fff5f5;text-align:center;padding:24px">
      <b style="color:#c62828;font-size:16px">⚠ Este pedido no tiene productos cargados</b>
      <div style="font-size:13.5px;color:#7a1f1f;margin-top:8px">No se puede preparar así. Avisale al encargado para que cargue los productos de este pedido antes de despacharlo.</div>
      ${p.items?`<div class="muted" style="font-size:12px;margin-top:10px">La etiqueta decía: "${esc(p.items)}"</div>`:''}
      <button class="btn ghost block" style="margin-top:14px" onclick="PREP_ID=null;PREP_MANUAL={};PREP_ALERTAS=[];OPVIEW='prepararhoy';vistaOperador()">← Volver a la lista</button>
    </div>` : `
    ${(()=>{ const faltan=items.filter(i=>(PREP_SCAN[i.prodNombre]||0)<i.cant);
      if(completo) return `<div style="padding:14px;border-radius:12px;background:#d9f2e5;color:#0f6b40;font-weight:800;text-align:center;font-size:16px;margin:14px 0">✅ ¡Todo marcado! Ya podés confirmar</div>`;
      return `<div style="padding:14px 16px;border-radius:12px;background:#fff3cd;border:1px solid #e0b000;margin:14px 0">
        <b style="color:#7a5a00;font-size:15px">Todavía falta marcar:</b>
        ${faltan.map(i=>{ const f=i.cant-(PREP_SCAN[i.prodNombre]||0); return `<div style="font-size:14px;color:#5a4400;margin-top:5px">• <b>${f}</b> de ${i.cant} · ${esc(i.prodNombre)}</div>`; }).join("")}
      </div>`; })()}
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="label" style="margin:0">Tocá cada producto a medida que lo ponés en la caja</span><b style="color:${completo?'var(--green)':'inherit'}">${hechas}/${total}</b></div>
      ${items.map(it=>{ const done=Math.min(PREP_SCAN[it.prodNombre]||0,it.cant), ok=done>=it.cant;
        if(kitPorAprender(it.prodNombre)){
          return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 14px;margin-top:8px;border-radius:12px;background:#fff8e6;border:1.5px solid #e0b000">
            <span style="min-width:0;font-size:15px;font-weight:600;color:#7a5a00">📦 ${esc(it.nombre.replace(/\s*\((kit|pack)\)$/,''))}<div style="font-size:12px;font-weight:500;color:#5a4400;margin-top:2px">kit sin enseñar — no sé qué frascos lleva</div></span>
            <button class="btn sm" style="flex:0 0 auto;padding:7px 12px" onclick="enseniarKitPrep('${encodeURIComponent(it.prodNombre)}','')">Enseñar</button></div>`;
        }
        return `<div onclick="tocarItem('${encodeURIComponent(it.prodNombre)}',1)" style="display:flex;justify-content:space-between;align-items:center;padding:16px 14px;margin-top:8px;border-radius:12px;cursor:pointer;background:${ok?'#d9f2e5':'var(--bg-3)'};border:1.5px solid ${ok?'var(--green)':'var(--border)'};transition:.15s">
          <span style="display:flex;gap:12px;align-items:center;min-width:0">
            <span style="font-size:22px;flex:0 0 auto">${ok?'✅':'⬜'}</span>
            <span style="min-width:0;font-size:15px;font-weight:600;${ok?'color:#0f6b40':''}">${esc(it.nombre)}</span>
          </span>
          <span style="display:flex;gap:10px;align-items:center;flex:0 0 auto">
            <b style="font-size:18px;min-width:44px;text-align:center;color:${ok?'var(--green)':'var(--text-2)'}">${done}/${it.cant}</b>
            <button class="btn sm ghost" style="padding:8px 12px;font-size:16px" onclick="event.stopPropagation();tocarItem('${encodeURIComponent(it.prodNombre)}',-1)">−</button>
          </span></div>`; }).join("")}
      <div style="text-align:center;margin-top:12px">
        <button class="btn sm ghost" onclick="escanearParaPedido()">${cam}O escanear con la cámara</button>
      </div>
    </div>
    ${PREP_ALERTAS.length?`<div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#ffe8e8;border:1px solid #e5484d">
      <b style="color:#c62828;font-size:14px">⚠ ${PREP_ALERTAS.length} ${PREP_ALERTAS.length===1?'aviso':'avisos'} en esta preparación</b>
      ${PREP_ALERTAS.slice(-4).map(a=>`<div style="font-size:13px;color:#7a1f1f;margin-top:4px">• ${esc(a.texto)}</div>`).join("")}
      <div style="font-size:12px;color:#7a1f1f;margin-top:6px;opacity:.8">Para cerrar con avisos hace falta la clave del encargado.</div>
    </div>`:''}
    ${!p.stockBajado ? `
      ${(()=>{ if(completo) return `<div style="margin-top:14px;padding:12px;border-radius:12px;background:#d9f2e5;color:#0f6b40;font-weight:800;text-align:center;font-size:15px">✅ Todo marcado — confirmá para imprimir</div>`;
        return ''; })()}
      ${kitsND.length
        ? `<button class="btn block" style="margin-top:10px;opacity:.55" onclick="toast('Enseñá primero los kits de arriba 📦')">📦 Enseñá los kits primero</button>`
        : `<button class="btn block ${completo?'green':''}" style="margin-top:10px;${completo?'':'opacity:.55'}" onclick="${completo?`intentarCerrar('${id}')`:`avisarFaltantes('${id}')`}">${completo?'✓ Confirmar preparado':'Faltan productos'}</button>`}
    ` : `
      <div style="margin-top:14px;padding:14px;border-radius:12px;background:#d9f2e5;color:#0f6b40;font-weight:800;text-align:center;font-size:16px">🎉 ¡Preparado! Ahora imprimí la etiqueta</div>
      <div style="margin-top:10px;padding:12px;border-radius:12px;border:1px dashed var(--border);text-align:center">
        ${p.fotoPrep?'':'<div style="font-size:13px;margin-bottom:4px">Sacale una foto al pedido armado para que quede registrado</div>'}
        ${fotoPedidoHTML(p)}
      </div>
      <button class="btn block green big" style="margin-top:10px" onclick="${p.etiquetaPdf?`bajarEtiqueta1015('${id}')`:`imprimirEtiqueta('${id}')`}">🏷️ Imprimir etiqueta</button>
      <button class="btn block" style="margin-top:8px" onclick="siguientePedidoPrep()">Siguiente pedido →</button>
    `}`}`;
}
/* Va al próximo pedido pendiente de preparar, o vuelve a la lista si no queda ninguno */
function siguientePedidoPrep(){
  const quedan=soloPedidos().filter(p=>p.estado==="pendiente" && !p.cerradoEn
    && (PREP_EMP==="todas"||(p.empresa||"")===PREP_EMP) && (PREP_ENV==="todos"||tipoEnvioPrep(p)===PREP_ENV)).sort((a,b)=>(a.creado||0)-(b.creado||0));
  if(quedan.length){ abrirPreparar(quedan[0].id); }
  else { PREP_ID=null; toast("¡No quedan pedidos para preparar! 🎉"); OPVIEW="prepararhoy"; vistaOperador(); }
}
/* clave para autorizar cierres con inconsistencias (cambiala por la que quieras) */
const CLAVE_AUTORIZA="1234";
async function intentarCerrar(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const its=itemsPedido(p);
  const problemas=[...PREP_ALERTAS.map(a=>a.texto)];
  its.forEach(i=>{
    const total=PREP_SCAN[i.prodNombre]||0;              // lo marcado
    if(total!==i.cant) problemas.push("Cantidad distinta en "+i.nombre.replace(/\s*\((kit|pack)\)$/,"")+": marcó "+total+", pedía "+i.cant);
  });
  if(!problemas.length){ marcarListo(id); return; }   // todo escaneado y correcto → cierra directo
  const lista=problemas.map(t=>"• "+t).join("\n");
  if(ROL==="operador" || EMPLEADO){
    notify("⚠ ESTE PEDIDO TIENE INCONSISTENCIAS:\n\n"+lista+"\n\nPara cerrarlo hace falta la autorización del encargado.");
    const clave=prompt("Ingresá la clave de autorización para cerrar este pedido con avisos:");
    if(clave===null) return;
    if(clave!==CLAVE_AUTORIZA){ toast("🚫 Clave incorrecta — el pedido no se cerró"); return; }
    p._prepAlertas=problemas.slice(); marcarListo(id, problemas);
  } else {
    if(await askConfirm("⚠ ESTE PEDIDO TIENE INCONSISTENCIAS:\n\n"+lista+"\n\n¿Autorizás cerrarlo igual?\n(Aceptar = lo cierro y queda registrado · Cancelar = reviso)")){
      p._prepAlertas=problemas.slice(); marcarListo(id, problemas);
    }
  }
}
function avisarFaltantes(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const faltan=itemsPedido(p).map(i=>({n:i.nombre.replace(/\s*\(kit\)$/,''), f:i.cant-Math.min(PREP_SCAN[i.prodNombre]||0,i.cant)})).filter(x=>x.f>0);
  if(!faltan.length){ toast("Está completo ✅"); return; }
  notify("FALTA ESCANEAR:\n\n"+faltan.map(x=>"• "+x.f+" x "+x.n).join("\n"));
}
function escanearParaPedido(){ abrirEscaner(scanPrep,{continuo:true,hint:"Escaneá los productos del pedido"}); }
let PREP_ALERTAS=[];   // inconsistencias detectadas en esta preparación
function alertaPrep(tipo, texto){
  PREP_ALERTAS.push({tipo, texto, ts:Date.now()});
  try{ navigator.vibrate && navigator.vibrate([300,100,300]); }catch(e){ logErr("auto",e); }
}
async function scanPrep(code){
  const p=PEDIDOS.find(x=>x.id===PREP_ID); if(!p) return;
  const prod=prodPorBarcode(code);
  if(!prod){ const c=String(code||"").replace(/\D/g,"");
    // código desconocido: ofrezco vincularlo a un producto que FALTA en este pedido
    const faltantes=itemsPedido(p).filter(i=>(PREP_SCAN[i.prodNombre]||0)<i.cant);
    if(faltantes.length===1){
      // si falta uno solo, pregunto si este frasco es ese
      if(await askConfirm("Código "+c+" no está registrado.\n\n¿Este frasco es \""+faltantes[0].prodNombre+"\"?\n\n(Aceptar = lo aprendo y lo cuento · Cancelar = no)")){
        await aprenderBarcode(c, faltantes[0].prodNombre);
        toast("Aprendido ✓ La próxima lo reconoce solo");
        return scanPrep(code);   // reintento: ahora sí lo encuentra
      }
      pantallaPreparar(PREP_ID); return;
    } else if(faltantes.length>1){
      const lista=faltantes.map((f,i)=>(i+1)+") "+f.prodNombre).join("\n");
      const r=prompt("Código "+c+" no está registrado.\n\n¿Cuál de estos es este frasco? Poné el número:\n\n"+lista);
      const idx=parseInt(r,10)-1;
      if(idx>=0 && faltantes[idx]){ await aprenderBarcode(c, faltantes[idx].prodNombre); toast("Aprendido ✓"); return scanPrep(code); }
      pantallaPreparar(PREP_ID); return;
    }
    alertaPrep("desconocido","Código "+c+" no está en el catálogo"); toast("⚠ Código "+c+" no está en el catálogo"); pantallaPreparar(PREP_ID); return; }
  let it=itemsPedido(p).find(i=>i.prodNombre===prod.nombre);
  if(!it){ it=itemsPedido(p).find(i=>baseProducto(i.prodNombre)===baseProducto(prod.nombre)); }
  if(!it){ alertaPrep("nova","⚠ "+prod.nombre+" NO va en este pedido"); toast("🚫 "+prod.nombre.split(" ").slice(0,3).join(" ")+" NO es de este pedido"); pantallaPreparar(PREP_ID); return; }
  const cur=PREP_SCAN[it.prodNombre]||0;
  if(cur>=it.cant){ alertaPrep("demas","De más: "+prod.nombre+" (el pedido pedía "+it.cant+")"); toast("🚫 Ya escaneaste los "+it.cant+" de "+it.nombre.split(" ").slice(0,2).join(" ")); pantallaPreparar(PREP_ID); return; }
  PREP_SCAN[it.prodNombre]=cur+1;
  PREP_REAL[prod.nombre]=(PREP_REAL[prod.nombre]||0)+1;
  const its=itemsPedido(p);
  const completo=its.length && its.every(i=>(PREP_SCAN[i.prodNombre]||0)>=i.cant);
  if(completo){ try{ navigator.vibrate && navigator.vibrate([180,80,180]); }catch(e){ logErr("auto",e); }
    toast("🎉 ¡PEDIDO COMPLETO! Tocá el botón verde e imprimí la etiqueta");
  } else { toast("✓ "+prod.nombre.split(" ").slice(0,2).join(" ")+" "+(cur+1)+"/"+it.cant); }
  pantallaPreparar(PREP_ID);
}
function tocarItem(enc,delta){ const n=decodeURIComponent(enc);
  PREP_SCAN[n]=Math.max(0,(PREP_SCAN[n]||0)+delta); pantallaPreparar(PREP_ID); }
async function marcarListo(id, inconsistencias){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(p && descuentoActivo()){
    const nominal=itemsPedido(p).reduce((s,i)=>s+i.cant,0);
    const real=Object.values(PREP_REAL).reduce((s,n)=>s+n,0);
    const scanMap = (real>0 && real>=nominal) ? PREP_REAL : null;
    await descontarStockPedido(id, scanMap);
  }
  const nota=(inconsistencias&&inconsistencias.length)?("Preparado CON avisos autorizados: "+inconsistencias.join(" | ")):"Preparado (verificado con escáner)";
  // guardo las inconsistencias en el pedido para poder revisarlas después
  if(inconsistencias&&inconsistencias.length){ try{ await DB.update(id,{prepAlertas:inconsistencias, prepConAviso:true}); }catch(e){ logErr("auto",e); } }
  await avanzar(id,'preparado',nota);
  PREP_ID=null; PREP_SCAN={}; PREP_REAL={}; PREP_ALERTAS=[];
  toast(inconsistencias&&inconsistencias.length?"Pedido cerrado con avisos ⚠":"Pedido listo ✅");
  OPVIEW='prepararhoy'; vistaOperador();
}

/* ---------- CADETE ---------- */
function vistaElegirCadete(){
  app().innerHTML=`<div class="title">¿Quién sos?</div>
    <div class="subtitle">Elegí tu nombre para ver tus repartos</div>
    <div class="grid">${CADETES.map(c=>`<button class="role-card" onclick="CADETE_ACTIVO='${esc(c)}';render()"><h3>${esc(c)}</h3></button>`).join("")}</div>`;
}
function vistaCadete(){
  const mios=soloPedidos().filter(p=>p.metodo==="cadete"&&p.cadete===CADETE_ACTIVO&&["preparado","asignado","en_reparto"].includes(p.estado));   // preparado ya lo ve directo, sin paso de asignación; entregados: afuera de la ruta
  const hechos=soloPedidos().filter(p=>p.cadete===CADETE_ACTIVO&&["entregado","confirmado"].includes(p.estado)).length;
  app().innerHTML=`<div class="title">${esc(CADETE_ACTIVO)}</div>
    <div class="subtitle">${mios.length} para repartir · ${hechos} entregados</div>
    ${mios.some(p=>["preparado","asignado","en_reparto"].includes(p.estado))?`<button class="btn block" style="margin-bottom:14px" onclick="escanearEntrega()">${icon('check')} Escanear entrega</button>`:""}
    <div class="cardgrid">${mios.map(cardCadete).join("")||empty('check','No tenés pedidos asignados ahora.')}</div>`;
}
function cardCadete(p){
  const e=estObj(p.estado);
  let acts="";
  if(p.estado==="asignado"||p.estado==="preparado")  acts=`<button class="btn amber" onclick="salirReparto('${p.id}')">Salí a repartir</button>`;
  if(p.estado==="en_reparto")acts=`<button class="btn green" onclick="marcarEntregado('${p.id}')">Marcar entregado</button><button class="btn sm ghost" onclick="adjuntarFoto('${p.id}')">Foto</button>`;
  if(p.estado==="entregado")acts=`<span class="muted" style="font-size:13px;align-self:center">Esperando confirmación</span><button class="btn sm ghost" onclick="pedirConfirmacion('${p.id}')">Reenviar confirmación</button>`;
  const mapa=`https://maps.google.com/?q=${encodeURIComponent((p.dir||"")+", "+(p.ciudad||"")+", "+(p.provincia||""))}`;
  return `<div class="order">
    <div class="top"><span class="code">${esc(p.id)}</span>
      <span class="badge"><span class="dot" style="background:${e.color}"></span>${e.label}</span></div>
    <div class="who">${esc(p.cliente)}</div>
    <div class="addr">${esc(p.dir)} — ${esc(p.ciudad)}, ${esc(p.provincia)}</div>
    <div><span class="tag">Items</span> ${esc(p.items||"—")}</div>
    <div class="acts">${acts}
      <a class="btn sm ghost" href="${mapa}" target="_blank">Mapa</a>
      <button class="btn sm ghost" onclick="imprimirEtiqueta('${p.id}')">${icon('printer')}Etiqueta</button>
      ${p.tel?`<a class="btn sm ghost" href="https://wa.me/${waTel(p.tel)}" target="_blank">WhatsApp</a>`:""}
    </div></div>`;
}
const msgConfirma=p=>`Hola ${p.cliente}! Te dejamos tu pedido ${p.id}. Por favor confirmá que lo recibiste tocando acá: ${linkCliente(p.id)}`;
function marcarEntregado(id){ const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  window.open(`https://wa.me/${waTel(p.tel)}?text=${encodeURIComponent(msgConfirma(p))}`,"_blank"); // sincrónico: sin bloqueo
  avanzar(id,"entregado","Entregado · confirmación pedida por WhatsApp"); }
function pedirConfirmacion(id){ const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  window.open(`https://wa.me/${waTel(p.tel)}?text=${encodeURIComponent(msgConfirma(p))}`,"_blank"); }
function adjuntarFoto(id){
  const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.capture="environment";
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ const img=new Image();
      img.onload=()=>{ const max=600,s=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement("canvas"); c.width=img.width*s; c.height=img.height*s;
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        DB.update(id,{foto:c.toDataURL("image/jpeg",.6)}).then(()=>toast("Foto guardada")); };
      img.src=r.result; };
    r.readAsDataURL(f); };
  inp.click();
}
/* Marca un pedido como entregado a partir del código escaneado (barcode o QR) */
function confirmarPorCodigo(code){
  if(!code) return false;
  code=String(code).trim();
  const m=code.match(/[?&]p=([^&]+)/); if(m) code=decodeURIComponent(m[1]); // si escanea el QR de seguimiento
  const U=code.toUpperCase().replace(/^#/,"");
  const p=PEDIDOS.find(x=>(x.id||"").toUpperCase()===U)||PEDIDOS.find(x=>(x.ref||"").toUpperCase().replace(/^#/,"")===U);
  if(!p){ toast("No encontré el paquete "+code); return false; }
  if(["entregado","confirmado"].includes(p.estado)){ toast(p.id+" ya estaba entregado"); return true; }
  avanzar(p.id,"entregado","Entregado · escaneado por el cadete");
  toast("Entregado: "+p.id+" — tocá WhatsApp para avisar al cliente");
  return true;
}
/* Escáner de cámara reutilizable. onCode(codigo) se llama en cada lectura.
   opts.continuo=true: sigue escaneando sin cerrar (para pickear varios productos). */
async function abrirEscaner(onCode, opts){
  opts=opts||{};
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    const c=prompt("Este teléfono no permite usar la cámara. Ingresá el código a mano:");
    if(c) onCode(c); return;
  }
  const ov=document.createElement("div"); ov.className="scan-ov";
  ov.innerHTML=`<video class="scan-vid" autoplay playsinline muted></video>
    <div class="scan-frame"></div>
    <div class="scan-hint">${esc(opts.hint||"Apuntá al código de barras")}</div>
    <div class="scan-last" id="scanLast"></div>
    <button class="btn scan-x">${opts.continuo?"Listo":"Cerrar"}</button>`;
  document.body.appendChild(ov);
  const vid=ov.querySelector("video");
  let reader=null, stop=false, ult="", ultTs=0;
  const cerrar=()=>{ if(stop)return; stop=true;
    try{ reader && reader.reset && reader.reset(); }catch(e){ logErr("auto",e); }
    try{ const s=vid.srcObject; if(s) s.getTracks().forEach(t=>t.stop()); }catch(e){ logErr("auto",e); }
    ov.remove(); };
  ov.querySelector(".scan-x").onclick=cerrar;
  const manejar=raw=>{ if(!raw) return; const now=Date.now();
    if(raw===ult && now-ultTs<1400) return;      // no repetir la misma lectura al toque
    ult=raw; ultTs=now;
    try{ navigator.vibrate && navigator.vibrate(60); }catch(e){ logErr("auto",e); }   // vibra al leer, así sabe que contó
    if(opts.continuo){ onCode(raw); const el=document.getElementById("scanLast"); if(el){ el.textContent="✓ leído"; el.style.color="#1d9e75"; setTimeout(()=>{ if(el) el.style.color=""; },500); } }
    else { cerrar(); onCode(raw); } };
  try{
    if(typeof ZXing!=="undefined" && ZXing.BrowserMultiFormatReader){
      reader=new ZXing.BrowserMultiFormatReader();
      await reader.decodeFromConstraints({video:{facingMode:"environment"}}, vid, r=>{
        if(r && !stop) manejar((r.getText&&r.getText())||r.text||""); });
    } else if("BarcodeDetector" in window){
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      vid.srcObject=stream;
      const det=new BarcodeDetector({formats:["code_128","qr_code","ean_13","code_39"]});
      const loop=async()=>{ if(stop)return;
        try{ const codes=await det.detect(vid); if(codes&&codes.length) manejar(codes[0].rawValue||""); }catch(e){ logErr("auto",e); }
        requestAnimationFrame(loop); };
      vid.onloadedmetadata=()=>loop();
    } else { cerrar(); const c=prompt("Ingresá el código a mano:"); if(c) onCode(c); }
  }catch(e){ cerrar(); toast("No pude abrir la cámara. Revisá los permisos del navegador."); }
}
/* Cadete: escanea el paquete para confirmar la entrega (una lectura) */
function escanearEntrega(){ abrirEscaner(confirmarPorCodigo,{hint:"Apuntá al código de barras del paquete"}); }
/* Operador: escanea productos con la cámara mientras arma el pedido (continuo) */
function escanearProducto(){ abrirEscaner(procesarScan,{continuo:true,hint:"Apuntá al código de barras del producto"}); }

/* ---------- CLIENTE ---------- */
async function vistaCliente(id){
  $("#roleBtn").style.display="none";
  let p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(!p){ app().innerHTML=`<div class="center" style="margin-top:60px"><div class="title">Pedido no encontrado</div><p class="muted">Revisá el link.</p></div>`; return; }
  const fl=flujo(p), actual=idxEst(p);
  const tl=fl.map((eid,i)=>{ const e=estObj(eid);
    const cls=i<actual?"done":i===actual?"current":"pending";
    const ev=(p.eventos||[]).find(x=>x.estado===eid);
    return `<div class="step ${cls}"><div class="pt"></div>
      <div class="s-t">${e.label}</div><div class="s-d">${e.desc}</div>
      ${ev?`<div class="s-ts">${fmt(ev.ts)}</div>`:""}</div>`; }).join("");
  const evEnt=(p.eventos||[]).find(x=>x.estado==="entregado");
  const rev=empresaObj(p.empresa).review||"";
  app().innerHTML=`
    <div class="center" style="margin-top:10px">
      <span class="tag">Pedido ${esc(p.id)}</span>
      <div class="title" style="margin-top:10px">Hola, ${esc(p.cliente)}</div>
      <div class="subtitle">${p.metodo==='correo'?('Envío por '+esc(p.correo||'correo')):'Envío a domicilio'}</div>
    </div>
    <div class="card">
      <span class="label">Estado actual</span>
      <span class="badge"><span class="dot" style="background:${estObj(p.estado).color}"></span>${estObj(p.estado).label}</span>
      ${p.metodo==='correo'&&p.tracking?`<div class="hint" style="margin-top:12px">Seguimiento ${esc(p.correo)}: <b>${esc(p.tracking)}</b></div>`:""}
      <div class="tl">${tl}</div>
      ${p.foto&&evEnt?`<div class="proof"><span class="label">Comprobante de entrega</span><img src="${p.foto}"></div>`:""}
    </div>
    ${p.estado==="entregado"?`<div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:20px;font-weight:600">¿Recibiste tu paquete?</div>
        <p class="muted" style="margin:6px 0 16px">Confirmá la recepción para cerrar el pedido.</p>
        <button class="btn green block" onclick="confirmarRecepcion('${p.id}')">Sí, lo recibí ✓</button></div>`:""}
    ${p.estado==="confirmado"?`<div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:20px;font-weight:600">¡Gracias! Recepción confirmada</div>
        ${rev?`
          <p class="muted" style="margin:8px 0 14px">¿Cómo estuvo la entrega? Tu opinión nos ayuda muchísimo.</p>
          <div style="font-size:30px;letter-spacing:7px;line-height:1;margin-bottom:14px">
            ${[1,2,3,4,5].map(()=>`<a href="${rev}" target="_blank" style="text-decoration:none;color:#ffb800">★</a>`).join("")}
          </div>
          <a class="btn block" href="${rev}" target="_blank">Calificar en Google</a>
          <div style="margin-top:16px"><img alt="QR reseña" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(rev)}" width="118" height="118" style="border-radius:10px">
          <div class="hint" style="margin-top:6px">o escaneá para calificarnos</div></div>
        `:`<p class="muted" style="margin-top:6px">Que lo disfrutes.</p>`}
      </div>`:""}`;
}
async function confirmarRecepcion(id){ await avanzar(id,"confirmado","Cliente confirmó recepción");
  toast("¡Gracias!"); setTimeout(()=>vistaCliente(id),300); }

/* =========================================================================
   8) ETIQUETA IMPRIMIBLE
   etiquetaBody(p) -> el contenido de la etiqueta (se usa en pantalla y al imprimir)
   imprimirEtiqueta(id) -> abre una ventana solo con la etiqueta y manda a imprimir
   ========================================================================= */
/* --- Código de barras Code128 (vectorial: escanea siempre, sin internet) --- */
const C128=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
function code128B(text){
  const vals=[104]; let sum=104,pos=1;            // Start B
  for(const ch of String(text)){ let v=ch.charCodeAt(0)-32; if(v<0||v>94) v=0;
    vals.push(v); sum+=v*pos; pos++; }
  vals.push(sum%103); vals.push(106);             // checksum + Stop
  return vals.map(v=>C128[v]).join("");
}
function barcodeSVG(text,h){ h=h||44;
  const w=code128B(text); let x=0,total=0,rects="";
  for(let i=0;i<w.length;i++) total+=+w[i];
  for(let i=0;i<w.length;i++){ const n=+w[i];
    if(i%2===0) rects+=`<rect x="${x}" y="0" width="${n}" height="${h}" fill="#000"/>`; x+=n; }
  return `<svg class="bc" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none">${rects}</svg>`;
}

/* =========================================================================
   8) ETIQUETA PARA IMPRESORA TÉRMICA
   · Tamaño exacto del rollo (LABEL_MM) · todo negro puro de alto contraste
   · Código de barras vectorial del pedido · QR de seguimiento opcional
   ========================================================================= */
const ETQ_CSS=`
.etq{width:${LABEL_MM.w}mm;height:${LABEL_MM.h}mm;box-sizing:border-box;padding:4mm;color:#000;background:#fff;
  display:flex;flex-direction:column;font-family:"Inter",-apple-system,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.etq *{box-sizing:border-box}
.etq-h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:.7mm solid #000;padding-bottom:2mm}
.etq-brand{font-size:4.6mm;font-weight:800;letter-spacing:-.02em;line-height:1}
.etq-sub{font-size:2.6mm;font-weight:700;margin-top:1mm;letter-spacing:.02em}
.etq-id{font-size:5mm;font-weight:800;text-align:right;line-height:1}
.etq-met{margin:2.5mm 0 1.2mm;font-size:3mm;font-weight:800;letter-spacing:.08em;border:.5mm solid #000;
  display:inline-block;padding:1mm 2.5mm;border-radius:1.5mm}
.etq-meta{font-size:2.9mm;font-weight:600;margin-bottom:2mm}
.etq-nota{font-size:4mm;font-weight:900;margin:1.5mm 0;padding:1.6mm 2mm;border:.8mm solid #000;text-transform:uppercase;letter-spacing:.2mm}
.etq-lbl{font-size:2.6mm;font-weight:800;letter-spacing:.1em}
.etq-name{font-size:5.4mm;font-weight:800;line-height:1.1;margin-top:.5mm}
.etq-addr{font-size:4mm;font-weight:600;line-height:1.3;margin:1mm 0 .5mm}
.etq-tel{font-size:3.4mm;font-weight:700}
.etq-items{font-size:3.2mm;font-weight:500;border-top:.4mm solid #000;padding-top:1.5mm;margin-top:2.5mm;line-height:1.3}
.etq-items .etq-lbl{display:block;margin-bottom:1.4mm}
.etq-it{display:flex;align-items:center;gap:1.8mm;padding:.7mm 0;font-size:3.4mm}
.etq-it .etq-chk{flex:0 0 auto;width:3.4mm;height:3.4mm;border:.35mm solid #000;border-radius:.6mm}
.etq-it b{font-weight:800;min-width:6mm}
.etq-track{margin-top:2.5mm;border:.5mm solid #000;border-radius:1.5mm;padding:1.5mm 2.5mm;
  display:flex;justify-content:space-between;align-items:center}
.etq-track .t-c{font-size:2.8mm;font-weight:800;letter-spacing:.06em}
.etq-track .t-n{font-size:4.6mm;font-weight:800;letter-spacing:.02em}
.etq-spacer{flex:1;min-height:2mm}
.bc{display:block;height:13mm;width:100%}
.etq-bc-t{text-align:center;font-size:3.2mm;font-weight:800;letter-spacing:.22em;margin-top:.5mm}
.etq-foot{display:flex;align-items:center;gap:3mm;margin-top:2mm;border-top:.7mm solid #000;padding-top:2mm}
.etq-qr{width:18mm;height:18mm;flex:none}
.etq-foot-t{font-size:3mm;font-weight:700;flex:1;line-height:1.3}
.etq-anillo{width:15mm;height:15mm;border-radius:50%;color:#fff;font-weight:800;font-size:4.2mm;
  display:flex;align-items:center;justify-content:center;flex:0 0 auto;margin-bottom:1mm}
.etq-anillo small{font-size:2.2mm;font-weight:700}`;
function etiquetaBody(p){
  const origen=p.origen==="riotercero"?"RÍO TERCERO":"BUENOS AIRES";
  const metodo=p.metodo==="correo"?("CORREO · "+(p.correo||"")):"CADETE · CARDINAL";
  const marca=LOGISTICA.toUpperCase();
  const remitente=p.empresa?empresaObj(p.empresa).nombre:"";
  const esCABA=p.metodo!=="correo";
  const fecha=p.despacho||new Date().toLocaleDateString("es-AR");
  const qr=LABEL_QR?("https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data="+encodeURIComponent(linkCliente(p.id))):"";
  const an=anilloDe(p);
  const esSC=p.empresa==="sc";
  const logoSC=`<div style="text-align:left;margin-bottom:.6mm">
      <svg width="34mm" height="11mm" viewBox="0 0 340 110" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="40" x2="95" y2="40" stroke="#000" stroke-width="3"/>
        <text x="170" y="52" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="52" letter-spacing="4" fill="#000">SC</text>
        <line x1="245" y1="40" x2="340" y2="40" stroke="#000" stroke-width="3"/>
        <text x="170" y="92" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="21" letter-spacing="9" fill="#000">CANDLE COMPANY</text>
      </svg></div>`;
  return `<div class="etq">
    <div class="etq-h">
      <div>
        ${esSC?logoSC:`<div class="etq-brand"><svg width="4.4mm" height="4.4mm" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.6mm;margin-right:1.2mm"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>${esc(marca)}</div>`}
        <div class="etq-sub">${remitente?("Envía: "+esc(remitente)+" · "):""}${origen}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end">
        <div class="etq-anillo" style="background:${anilloColor(an.n)}">${an.n===0?"CABA":(an.n>=1&&an.n<=3?("<span>"+an.n+"<br><small>zona</small></span>"):"<small>rev.</small>")}</div>
        <div class="etq-id">${esc(numOrden(p))}</div>
      </div>
    </div>
    <div class="etq-met">${esc(metodo)}</div>
    ${esSC?`<div style="border:1.2mm solid #000;padding:1.6mm 2mm;text-align:center;font-weight:900;font-size:6mm;letter-spacing:1.5mm;margin:1.5mm 0">⚠ FRÁGIL ⚠<div style="font-size:2.8mm;letter-spacing:.4mm;font-weight:700;margin-top:.5mm">MANIPULAR CON CUIDADO · NO GOLPEAR · ESTE LADO ARRIBA</div></div>`:''}
    <div class="etq-meta">Despacho ${esc(fecha)}${p.cadete?(" · Cadete: "+esc(p.cadete)):""}</div>
    <div class="etq-lbl">DESTINATARIO</div>
    <div class="etq-name">${esc(p.cliente)}</div>
    <div class="etq-addr">${esc(p.dir)}<br>${esc(p.ciudad)}, ${esc(p.provincia)} · <b>${esc(an.label)}</b></div>
    <div class="etq-tel">Tel: ${esc(p.tel||"-")}</div>
    ${p.nota?`<div class="etq-nota">⚠ ${esc(p.nota)}</div>`:""}
    ${esCABA?`<div class="etq-items"><span class="etq-lbl">CONTENIDO</span>${parseItems(p.items).map(it=>`<div class="etq-it"><span class="etq-chk"></span><b>${it.cant}×</b>${esc(it.nombre)}</div>`).join("")||esc(p.items||"-")}</div>`:""}
    ${p.metodo==="correo"?`<div class="etq-track"><span class="t-c">${esc(p.correo||"CORREO")}</span><span class="t-n">${esc(p.tracking||"s/ número")}</span></div>`:""}
    <div class="etq-spacer"></div>
    ${barcodeSVG(p.id,44)}
    <div class="etq-bc-t">${esc(numOrden(p))}</div>
    <div class="etq-foot">
      ${qr?`<img class="etq-qr" src="${qr}" onerror="this.style.display='none'">`:""}
      <div class="etq-foot-t">Seguimiento en vivo${qr?"<br>escaneá el QR":""}${p.ref?("<br>Ref: "+esc(p.ref)):""}</div>
    </div>
  </div>`;
}
/* Imprime una o varias etiquetas, cada una en su propia etiqueta del rollo */
function printLabels(arr){
  if(!arr||!arr.length){ toast("No hay etiquetas para imprimir"); return; }
  const w=window.open("","_blank","width=460,height=760");
  if(!w){ toast("Permití las ventanas emergentes para imprimir"); return; }
  const body=arr.map(p=>`<div class="page">${etiquetaBody(p)}</div>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">'+
    '<style>@page{size:'+LABEL_MM.w+'mm '+LABEL_MM.h+'mm;margin:0}html,body{margin:0;padding:0}'+
    '.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}'+
    ETQ_CSS+'</style></head><body>'+body+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function imprimirEtiqueta(id){
  const p=PEDIDOS.find(x=>x.id===id) || ((SIM&&SIM.id===id)?SIM:null);
  if(!p){ toast("No encontré el pedido"); return; }
  if(p.etiquetaPdf){ abrirEtiquetaPDF(p); return; }   // usa la etiqueta del correo (Tienda Nube)
  if((p.correo||"")==="Punto de retiro"){ notify("Este pedido es CORREO A SUCURSAL: va con la etiqueta del correo, no la nuestra.\n\nAdjuntale el PDF de Tienda Nube (botón 📎 Adjuntar) y volvé a imprimir."); return; }
  printLabels([p]);
}
/* Genera el PDF 10x15 de la última etiqueta preparada */
function descargarEtiquetaPDF(){
  const e=window.__etqUltima;
  if(!e){ toast("Abrí primero la etiqueta"); return; }
  if(typeof window.jspdf==="undefined"){ toast("La librería de PDF no cargó, recargá la página"); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({orientation:"portrait", unit:"mm", format:[100,150]});
  // encajo la imagen dentro de los 100x150 sin deformarla
  const rImg=e.w/e.h, rPag=100/150;
  let w,h,x,y;
  if(rImg>rPag){ w=100; h=100/rImg; x=0; y=(150-h)/2; }
  else { h=150; w=150*rImg; y=0; x=(100-w)/2; }
  doc.addImage(e.img,"PNG",x,y,w,h);
  doc.save("etiqueta-"+String(e.cliente).replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()+".pdf");
}
/* Imprime SOLO la etiqueta de envío de ML (página 1, recortada) en 10x15 cm */
/* Toma el PDF original de ML (página 1 = etiqueta de envío) y lo mete en una hoja 10x15
   SIN rasterizar: el QR y el código de barras quedan vectoriales y nítidos. */
async function etiqueta10x15Bytes(pedidos){
  if(typeof PDFLib==="undefined") throw new Error("pdf-lib no cargó");
  const { PDFDocument }=PDFLib;
  const MM=2.83465; const W=100*MM, H=150*MM;      // 10x15 cm en puntos
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const salida=await PDFDocument.create();
  for(const p of pedidos){
    if(!p.etiquetaPdf) continue;
    const bin=atob(p.etiquetaPdf); const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    try{
      const pdf=await pdfjsLib.getDocument({data:arr.slice(0)}).promise;
      const page=await pdf.getPage(1);
      // 1) mido el recuadro con contenido (en baja) para recortar el blanco
      const box=await recorteEtiqueta(arr);
      const vpU=page.getViewport({scale:1});
      const rx=box? box.x : 0, rw=box? box.w : vpU.width, rh=box? box.h : vpU.height;
      const ry=box? (vpU.height-box.y-box.h) : 0;   // paso a coords desde arriba
      // 2) rasterizo alineado a la resolución de impresoras térmicas (203 DPI) para que no rompa el QR
      //    uso 4x (812 DPI) → múltiplo exacto de 203, la térmica lo baja limpio sin moiré
      const DPI_TERMICA=203, MULT=4;
      const anchoMM=rw/MM;                          // ancho del recorte en mm
      const target=Math.round(anchoMM/25.4*DPI_TERMICA*MULT);
      const scale=Math.max(4, target/rw);
      const vp=page.getViewport({scale});
      const cv=document.createElement("canvas");
      cv.width=Math.round(rw*scale); cv.height=Math.round(rh*scale);
      const cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
      // desplazo el render para que quede solo el recorte
      await page.render({ canvasContext:cx, viewport:vp,
        transform:[1,0,0,1, -rx*scale, -ry*scale] }).promise;
      const png=cv.toDataURL("image/png");
      const bytes=Uint8Array.from(atob(png.split(",")[1]), c=>c.charCodeAt(0));
      const img=await salida.embedPng(bytes);
      // 3) meto la imagen en la hoja 10x15, ajustada sin deformar
      const esc=Math.min(W/rw, H/rh);
      const w=rw*esc, h=rh*esc;
      const pg=salida.addPage([W,H]);
      pg.drawImage(img, { x:(W-w)/2, y:(H-h)/2, width:w, height:h });
    }catch(e){ console.warn("etiqueta:", e); }
  }
  if(salida.getPageCount()===0) throw new Error("sin etiquetas");
  return await salida.save();
}
/* Mide (en puntos PDF) el rectángulo con contenido de la página 1, para recortar el blanco */
async function recorteEtiqueta(arr){
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await pdfjsLib.getDocument({data:arr.slice(0)}).promise;
  const page=await pdf.getPage(1);
  const vpUnit=page.getViewport({scale:1});           // tamaño real en puntos
  const S=2; const vp=page.getViewport({scale:S});
  const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
  const cx=cv.getContext("2d"); cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
  await page.render({canvasContext:cx, viewport:vp}).promise;
  const d=cx.getImageData(0,0,cv.width,cv.height).data;
  let x0=cv.width,y0=cv.height,x1=0,y1=0;
  for(let y=0;y<cv.height;y+=2){ for(let x=0;x<cv.width;x+=2){ const i=(y*cv.width+x)*4;
    if(d[i]<235||d[i+1]<235||d[i+2]<235){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } }
  if(x1<=x0||y1<=y0) return null;
  const m=6*S; x0=Math.max(0,x0-m); y0=Math.max(0,y0-m); x1=Math.min(cv.width,x1+m); y1=Math.min(cv.height,y1+m);
  // paso de píxeles (canvas, origen arriba) a puntos PDF (origen abajo)
  const H=vpUnit.height;
  return { x:x0/S, y:H-(y1/S), w:(x1-x0)/S, h:(y1-y0)/S };
}
function descargarBytesPDF(bytes, nombre){
  const blob=new Blob([bytes], {type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
async function bajarEtiqueta1015(id){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(!p||!p.etiquetaPdf){ toast("Este pedido no tiene etiqueta de ML guardada"); return; }
  toast("Preparando etiqueta 10×15…");
  try{
    const bytes=await etiqueta10x15Bytes([p]);
    descargarBytesPDF(bytes, "etiqueta-"+(p.cliente||"ml").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()+".pdf");
    toast("Listo ✓ QR intacto, lista para WhatsApp");
  }catch(e){ console.error(e); toast("No pude preparar la etiqueta"); }
}
/* Etiquetas 10x15 del día: UN PDF POR PEDIDO, numerado y con el nombre del cliente
   ej: "01 - Andres Manchado - 2000018489188852.pdf" (mismo orden que la lista de preparar) */
async function bajarEtiquetasDelDia(){
  const arr=soloPedidos().filter(p=>p.etiquetaPdf && ["pendiente","preparado","asignado","en_reparto"].includes(p.estado))
    .sort((a,b)=>(a.creado||0)-(b.creado||0));
  if(!arr.length){ toast("No hay etiquetas de ML pendientes"); return; }
  const limpio=s=>String(s||"").replace(/[\\/:*?"<>|#]+/g," ").replace(/\s+/g," ").trim().slice(0,60);
  const dig=String(arr.length).length<2?2:String(arr.length).length;
  toast("Armando "+arr.length+" etiquetas separadas…");
  let ok=0;
  for(let i=0;i<arr.length;i++){
    const p=arr[i];
    try{
      const bytes=await etiqueta10x15Bytes([p]);
      const nombre=String(i+1).padStart(dig,"0")+" - "+(limpio(p.cliente)||"Sin nombre")+" - "+limpio(numOrden(p))+".pdf";
      descargarBytesPDF(bytes, nombre);
      ok++;
      await new Promise(r=>setTimeout(r,450));   // pausa: el navegador baja mejor varios archivos de a uno
    }catch(e){ console.error(e); toast("No pude armar la etiqueta de "+(p.cliente||"")); }
  }
  toast(ok+" etiquetas descargadas por separado ✓"+(ok>1?" (si Chrome pregunta, tocá Permitir)":""));
}
async function imprimirEtiquetaML(id, soloPDF){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(!p||!p.etiquetaPdf){ toast("Este pedido no tiene etiqueta de ML guardada"); return; }
  if(typeof pdfjsLib==="undefined"){ toast("El lector de PDF no cargó, probá de nuevo"); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  toast("Preparando la etiqueta 10×15…");
  try{
    const bin=atob(p.etiquetaPdf); const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const pdf=await pdfjsLib.getDocument({data:arr}).promise;
    const page=await pdf.getPage(1);                          // hoja 1 = la etiqueta de envío
    const vp=page.getViewport({scale:3});                     // buena resolución para térmica
    const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
    const cx=cv.getContext("2d");
    cx.fillStyle="#fff"; cx.fillRect(0,0,cv.width,cv.height);
    await page.render({canvasContext:cx, viewport:vp}).promise;
    // recorte automático: busco el rectángulo con contenido (saca todo el blanco de alrededor)
    const d=cx.getImageData(0,0,cv.width,cv.height).data;
    let x0=cv.width,y0=cv.height,x1=0,y1=0;
    for(let y=0;y<cv.height;y+=2){ for(let x=0;x<cv.width;x+=2){
      const i=(y*cv.width+x)*4;
      if(d[i]<235||d[i+1]<235||d[i+2]<235){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } }
    if(x1<=x0||y1<=y0){ x0=0;y0=0;x1=cv.width;y1=cv.height; }
    const m=18;                                                // margencito
    x0=Math.max(0,x0-m); y0=Math.max(0,y0-m); x1=Math.min(cv.width,x1+m); y1=Math.min(cv.height,y1+m);
    const c2=document.createElement("canvas"); c2.width=x1-x0; c2.height=y1-y0;
    c2.getContext("2d").drawImage(cv,x0,y0,c2.width,c2.height,0,0,c2.width,c2.height);
    const img=c2.toDataURL("image/png");
    window.__etqUltima={img, cliente:(p.cliente||"ml"), w:c2.width, h:c2.height};
    if(soloPDF){ descargarEtiquetaPDF(); toast("PDF descargado ✓"); return; }
    const w=window.open("","_blank","width=440,height=640");
    if(!w){ toast("Permití las ventanas emergentes para imprimir"); return; }
    const nomArch=("etiqueta-"+(p.cliente||"ml").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()+".png");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta '+esc(p.cliente||"")+'</title>'+
      '<style>@page{size:100mm 150mm;margin:0}html,body{margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,system-ui,Segoe UI,sans-serif}'+
      '#et{width:100mm;height:150mm;object-fit:contain;display:block;margin:0 auto;background:#fff}'+
      '#bar{position:sticky;top:0;display:flex;gap:8px;padding:10px;background:#fff;border-bottom:1px solid #ddd;justify-content:center}'+
      'a,button{font:inherit;font-size:14px;padding:8px 16px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;text-decoration:none;color:#111}'+
      'button{background:#0a84ff;color:#fff;border-color:#0a84ff}'+
      '@media print{#bar{display:none}body{background:#fff}}</style></head><body>'+
      '<div id="bar"><button onclick="window.print()">🖨️ Imprimir 10×15</button>'+
      '<button onclick="window.opener.descargarEtiquetaPDF()">📄 Descargar PDF</button>'+
      '<a href="'+img+'" download="'+nomArch+'">⬇️ PNG</a></div>'+
      '<img id="et" src="'+img+'">'+
      '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},600)}<\\/scr'+'ipt></body></html>');
    w.document.close();
  }catch(e){ console.error(e); toast("No pude preparar la etiqueta"); }
}
function imprimirLote(){ pantallaEtiquetas(); }
/* Abre las etiquetas de Mercado Libre de los pedidos pendientes (una pestaña por etiqueta) */
async function etiquetasML(){
  const arr=soloPedidos().filter(p=>p.etiquetaPdf && ["pendiente","preparado","asignado"].includes(p.estado));
  if(!arr.length){ toast("No hay etiquetas de ML pendientes"); return; }
  if(arr.length>6 && !await askConfirm("Se van a abrir "+arr.length+" pestañas (una por etiqueta). ¿Seguimos?")) return;
  arr.forEach((p,i)=>setTimeout(()=>imprimirEtiquetaML(p.id), i*900));
  toast("Abriendo "+arr.length+" etiqueta"+(arr.length===1?"":"s"));
}
/* ---- ETIQUETA DE PICKEO: para armar el paquete (Cardinal imprime la de envío) ---- */
function etiquetaPickeoBody(p){
  const an=anilloDe(p);
  const marca=p.empresa?empresaObj(p.empresa).nombre:LOGISTICA;
  const metodo=p.metodo==="correo"?("CORREO"+(p.correo?(" · "+p.correo):"")):"CARDINAL";
  const esSC=p.empresa==="sc";
  const items=parseItems(p.items);
  return `<div class="etq">
    <div class="etq-h">
      <div>
        <div class="etq-brand">🧺 PICKEO</div>
        <div class="etq-sub">${esc(marca)}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end">
        <div class="etq-anillo" style="background:${anilloColor(an.n)}">${an.n===0?"CABA":(an.n>=1&&an.n<=3?("<span>"+an.n+"<br><small>zona</small></span>"):"<small>rev.</small>")}</div>
        <div class="etq-id">${esc(numOrden(p))}</div>
      </div>
    </div>
    <div class="etq-met">${esc(metodo)}</div>
    ${esSC?`<div style="border:1.1mm solid #000;padding:1.2mm 2mm;text-align:center;font-weight:900;font-size:5mm;letter-spacing:1.1mm;margin:1.1mm 0">⚠ FRÁGIL ⚠</div>`:''}
    <div class="etq-lbl">PARA</div>
    <div class="etq-name">${esc(p.cliente||"-")}</div>
    <div class="etq-addr">${esc(p.ciudad||"")}${p.provincia?(", "+esc(p.provincia)):""} · <b>${esc(an.label)}</b></div>
    ${p.nota?`<div class="etq-nota">⚠ ${esc(p.nota)}</div>`:""}
    <div class="etq-items"><span class="etq-lbl">A PREPARAR</span>${items.length?items.map(it=>`<div class="etq-it"><span class="etq-chk"></span><b>${it.cant}×</b>${esc(it.nombre)}</div>`).join(""):esc(p.items||"-")}</div>
    <div class="etq-spacer"></div>
    ${barcodeSVG(p.id,42)}
    <div class="etq-bc-t">${esc(numOrden(p))}</div>
  </div>`;
}
function printPickeo(arr){
  if(!arr||!arr.length){ toast("No hay pedidos para etiqueta de pickeo"); return; }
  const w=window.open("","_blank","width=460,height=760");
  if(!w){ toast("Permití las ventanas emergentes para imprimir"); return; }
  const body=arr.map(p=>`<div class="page">${etiquetaPickeoBody(p)}</div>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de pickeo</title>'+
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">'+
    '<style>@page{size:'+LABEL_MM.w+'mm '+LABEL_MM.h+'mm;margin:0}html,body{margin:0;padding:0}'+
    '.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}'+
    ETQ_CSS+'</style></head><body>'+body+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\\/scr'+'ipt></body></html>');
  w.document.close();
}
function imprimirPickeo(id){ const p=PEDIDOS.find(x=>x.id===id)||((SIM&&SIM.id===id)?SIM:null); if(!p){ toast("No encontré el pedido"); return; } printPickeo([p]); }
function pickeoPend(){ printPickeo(soloPedidos().filter(p=>p.estado==="pendiente")); }
/* ---- REPORTE: pedidos de Mercado Libre que quedaron SIN etiqueta (ya guardados o recién traídos) ---- */
function sinEtiquetaML(){ return soloPedidos().filter(p=>canalDe(p)==="ml_flex" && !p.etiquetaPdf && ["pendiente","preparado","asignado"].includes(p.estado)); }
function filasSinEtiqueta(arr){
  return arr.map(p=>({ref:String(p.ref||"").replace(/^#?/,"#"), marca:empresaObj(p.empresa).nombre, cliente:p.cliente||"",
    tel:p.tel||"", dir:[p.dir,p.ciudad,p.provincia].filter(Boolean).join(", "), items:p.items||"",
    motivo:p.etiquetaMotivo||"No se pudo bajar la etiqueta de ML (sin detalle: pedido importado antes de este reporte)"}));
}
function reporteSinEtiqueta(arr,csv){
  if(arr===false||arr===true){ csv=arr; arr=null; }
  const filas=filasSinEtiqueta(arr||sinEtiquetaML());
  if(!filas.length){ toast("Todos los pedidos de ML tienen etiqueta ✓"); return; }
  const hoy=new Date().toLocaleString("es-AR");
  if(csv){
    const head=["N Venta","Marca","Cliente","Telefono","Direccion","Items","Motivo"];
    descargarArchivo("pedidos-sin-etiqueta.csv","\uFEFF"+[head.join(","),...filas.map(f=>[f.ref,f.marca,f.cliente,f.tel,f.dir,f.items,f.motivo].map(csvCampo).join(","))].join("\r\n")+"\r\n");
    return;
  }
  const w=window.open("","_blank","width=900,height=900");
  if(!w){ toast("Permití las ventanas emergentes para ver el reporte"); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Pedidos sin etiqueta</title>'+
    '<style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}.m{color:#666;font-size:12px;margin-bottom:14px}'+
    'table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eee}.mo{color:#b00020}</style></head><body>'+
    '<h1>Pedidos importados SIN etiqueta ('+filas.length+')</h1><div class="m">Mercado Libre · '+esc(hoy)+'</div>'+
    '<table><tr><th>Venta</th><th>Marca</th><th>Cliente</th><th>Dirección</th><th>Items</th><th>Por qué falta</th></tr>'+
    filas.map(f=>'<tr><td>'+esc(f.ref)+'</td><td>'+esc(f.marca)+'</td><td>'+esc(f.cliente)+(f.tel?'<br>'+esc(f.tel):'')+'</td><td>'+esc(f.dir)+'</td><td>'+esc(f.items)+'</td><td class="mo">'+esc(f.motivo)+'</td></tr>').join("")+
    '</table><scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function reporteSinEtiquetaImport(csv){ reporteSinEtiqueta(IMP_FILAS.filter(f=>f.canal==="ml_flex" && !f.etiquetaPdf),csv); }
function avisoSinEtiquetaHTML(n,fn){
  if(!n) return "";
  return `<div class="card" style="margin:14px 0;padding:14px 16px;border:1px solid #e5484d;background:#ffe8e8">
    <div style="font-weight:700;color:#c62828">⚠ ${n} pedido${n===1?'':'s'} de Mercado Libre sin etiqueta</div>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn sm" onclick="${fn}(false)">📋 Ver / imprimir reporte</button>
      <button class="btn sm ghost" onclick="${fn}(true)">⬇ Descargar CSV</button>
    </div></div>`;
}
let SEL_ETQ={};
function etqImprimibles(){ return soloPedidos().filter(p=>!["entregado","confirmado","anulado"].includes(p.estado)); }
function pantallaEtiquetas(){
  const arr=etqImprimibles();
  const n=arr.filter(p=>SEL_ETQ[p.id]).length;
  app().innerHTML=`
    <button class="btn sm ghost" onclick="vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Imprimir etiquetas</div>
    <div class="subtitle">Marcá las que querés imprimir. Podés corregir cada una con “Editar”.</div>
    ${avisoSinEtiquetaHTML(sinEtiquetaML().length,"reporteSinEtiqueta")}
    <div class="row" style="gap:8px;margin:14px 0">
      <button class="btn sm ghost" onclick="selEtq(true)">Marcar todas</button>
      <button class="btn sm ghost" onclick="selEtq(false)">Ninguna</button>
    </div>
    ${arr.length?arr.map(p=>{ const suc=(p.correo||"")==="Punto de retiro";
      return `
      <div class="card" style="margin-bottom:10px;padding:14px 16px;display:flex;gap:12px;align-items:center">
        <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer;flex:1;min-width:0;margin:0">
          <input type="checkbox" ${SEL_ETQ[p.id]?'checked':''} onchange="toggleEtq('${p.id}')" style="width:22px;height:22px;margin-top:2px;flex:0 0 auto;accent-color:var(--accent)">
          <span style="min-width:0">
            <span style="font-weight:600;display:block">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400">· N° ${esc(numOrden(p))}</span>${suc?` <span class="chip" style="background:#fff3cd;color:#7a5a00;font-weight:700">🏤 SUCURSAL</span>`:''}${p.etiquetaPdf?` <span class="chip" style="background:#d9f2e5;color:#0f6b40;font-weight:700">📎 ETIQUETA CORREO</span>`:''}</span>
            <span class="muted" style="font-size:13px;display:block;margin-top:2px">${esc(p.dir||'')}${p.ciudad?(' — '+esc(p.ciudad)):''}</span>
            <span class="muted" style="font-size:13px;display:block;margin-top:2px">${esc(p.items||'—')}</span>
            ${(p.metodo==='correo'&&!p.etiquetaPdf)?`<span class="muted" style="font-size:12px;display:block;margin-top:2px;color:#a06a00">⚠ Falta el PDF del correo (adjuntalo acá →)</span>`:''}
          </span>
        </label>
        ${p.metodo==='correo'?(p.etiquetaPdf
          ?`<button class="btn sm ghost" style="flex:0 0 auto;color:var(--green)" onclick='abrirEtiquetaPDF(PEDIDOS.find(x=>x.id==="${p.id}"))'>📎 Ver PDF</button>`
          :`<label class="btn sm ghost" style="flex:0 0 auto;cursor:pointer">📎 Adjuntar<input type="file" accept="application/pdf" style="display:none" onchange="adjuntarEtiquetaCorreo('${p.id}',this.files[0])"></label>`)
          :`<button class="btn sm ghost" style="flex:0 0 auto" onclick="cambiarRuta('${p.id}')">Editar</button>`}
      </div>`; }).join(""):empty('box','No hay pedidos para etiquetar.')}
    ${arr.length?`<div style="position:sticky;bottom:16px;margin-top:18px">
      <button class="btn block" onclick="imprimirSeleccionadas()">${icon('printer')} Imprimir ${n} etiqueta${n===1?'':'s'}</button>
    </div>`:''}`;
}
function toggleEtq(id){ SEL_ETQ[id]=!SEL_ETQ[id]; pantallaEtiquetas(); }
function selEtq(v){ SEL_ETQ={}; if(v) etqImprimibles().forEach(p=>SEL_ETQ[p.id]=true); pantallaEtiquetas(); }
function imprimirSeleccionadas(){ const arr=soloPedidos().filter(p=>SEL_ETQ[p.id]);
  if(!arr.length){ toast("Marcá al menos una etiqueta"); return; }
  const conPdf=arr.filter(p=>p.etiquetaPdf);
  const sucSinPdf=arr.filter(p=>!p.etiquetaPdf && (p.correo||"")==="Punto de retiro");
  const sinPdf=arr.filter(p=>!p.etiquetaPdf && (p.correo||"")!=="Punto de retiro");
  if(sinPdf.length) printLabels(sinPdf);                       // nuestras etiquetas
  conPdf.forEach(p=>abrirEtiquetaPDF(p));                      // las del correo (PDF de Tienda Nube)
  if(conPdf.length) toast(conPdf.length+" con etiqueta del correo (se abren aparte)");
  if(sucSinPdf.length) notify(sucSinPdf.length+" pedido(s) de CORREO A SUCURSAL sin PDF adjunto:\n\n"+sucSinPdf.map(p=>"• "+(p.cliente||"")+" ("+numOrden(p)+")").join("\n")+"\n\nA esos no les imprimo nuestra etiqueta: adjuntales el PDF del correo (📎) y volvé a imprimir."); }

/* =========================================================================
   9) SIMULACIÓN DEL CICLO COMPLETO (modo demostración, no toca tus datos)
   ========================================================================= */
