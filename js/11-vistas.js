/* ============================================================
   11-vistas — Vistas del admin: hoy, pedidos, listados, exportaciones y kanban
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
function cadetesRaros(){
  const set=new Set();
  soloPedidos().forEach(p=>{ if(p.metodo==="cadete" && p.cadete && !CADETES.includes(p.cadete)) set.add(p.cadete); });
  return [...set];
}
async function reasignarCadete(viejo,nuevo){
  const peds=soloPedidos().filter(p=>p.cadete===viejo);
  if(!peds.length){ toast("No hay pedidos con "+viejo); return; }
  if(!await askConfirm("¿Pasar los "+peds.length+" pedidos de \""+viejo+"\" a \""+nuevo+"\"?")) return;
  toast("Actualizando "+peds.length+" pedidos…");
  for(const p of peds){ try{ await DB.update(p.id,{cadete:nuevo}); }catch(e){ logErr("auto",e); } }
  toast("Listo ✓"); render();
}
/* ===== LISTADOS: una pantalla, período rápido + calendario, 3 solapas en lista ===== */
let LST_TAB="envios", LST_DESDE="", LST_HASTA="", LST_RANGO="hoy";
function lstRango(){
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  if(LST_RANGO==="rango" && (LST_DESDE||LST_HASTA)){
    const d=LST_DESDE?new Date(LST_DESDE+"T00:00:00").getTime():0;
    const h=LST_HASTA?new Date(LST_HASTA+"T23:59:59").getTime():Date.now()+864e5;
    return {ini:d, fin:h};
  }
  if(LST_RANGO==="ayer"){ const a=hoy.getTime()-864e5; return {ini:a, fin:hoy.getTime()}; }
  if(LST_RANGO==="semana"){ const dow=(new Date().getDay()+6)%7; const lun=hoy.getTime()-dow*864e5; return {ini:lun, fin:Date.now()+864e5}; }
  if(LST_RANGO==="mes"){ const m=new Date(); const p=new Date(m.getFullYear(),m.getMonth(),1).getTime(); return {ini:p, fin:Date.now()+864e5}; }
  if(LST_RANGO==="todo"){ return {ini:0, fin:Date.now()+864e5}; }
  return {ini:hoy.getTime(), fin:Date.now()+864e5};   // hoy
}
function setLstRango(r){ LST_RANGO=r; if(r!=="rango"){ LST_DESDE=""; LST_HASTA=""; } vistaListados(); }
function vistaCorteCaja(){
  const hoy0=new Date(); hoy0.setHours(0,0,0,0); const ini=hoy0.getTime(), fin=Date.now()+1000;
  const arr=soloPedidos().filter(p=>despachadoEnRango(p,ini,fin) && !p.esReenvio).sort((a,b)=>(a.creado||0)-(b.creado||0));
  const tot=arr.reduce((s,p)=>s+costoEnvio(p),0);
  // agrupo por quién cobra (cadete/correo)
  const porQuien={};
  arr.forEach(p=>{ const q=p.metodo==="correo"?"Correo":(p.cadete||"Sin asignar"); if(!porQuien[q]) porQuien[q]={n:0,monto:0}; porQuien[q].n++; porQuien[q].monto+=costoEnvio(p); });
  // agrupo por marca
  const porMarca={};
  arr.forEach(p=>{ const m=nombreEmp(p.empresa); if(!porMarca[m]) porMarca[m]={n:0,monto:0}; porMarca[m].n++; porMarca[m].monto+=costoEnvio(p); });
  app().innerHTML=`
    ${segOp('listados')}
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Corte de caja de hoy</div>
    <div class="subtitle">${new Date().toLocaleDateString("es-AR",{weekday:'long',day:'numeric',month:'long'})} · ${arr.length} envíos despachados</div>
    ${!arr.length?`<div class="card"><div class="muted" style="text-align:center;padding:24px">Todavía no despachaste nada hoy.</div></div>`:`
    <div class="card" style="text-align:center;padding:22px;margin-bottom:14px;border:1.5px solid var(--green)">
      <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Total a cobrar hoy</div>
      <div style="font-size:38px;font-weight:800;color:var(--green);margin-top:4px">${fmtAr(tot)}</div>
      <div class="muted" style="font-size:13px;margin-top:2px">${arr.length} envíos</div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <span class="label">Por quién reparte</span>
      ${Object.entries(porQuien).map(([q,d])=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)">
        <span style="font-size:14px">${esc(q)} <span class="muted">· ${d.n} env\u00edos</span></span>
        <b style="font-size:15px">${fmtAr(d.monto)}</b></div>`).join("")}
    </div>
    <div class="card" style="margin-bottom:12px">
      <span class="label">Por marca</span>
      ${Object.entries(porMarca).map(([m,d])=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)">
        <span style="font-size:14px">${esc(m)} <span class="muted">· ${d.n}</span></span>
        <b style="font-size:15px">${fmtAr(d.monto)}</b></div>`).join("")}
    </div>
    <button class="btn block" onclick="imprimirCorteCaja()">${icon('printer')} Imprimir corte de caja</button>`}`;
}
function imprimirCorteCaja(){
  const hoy0=new Date(); hoy0.setHours(0,0,0,0); const ini=hoy0.getTime(), fin=Date.now()+1000;
  const arr=soloPedidos().filter(p=>despachadoEnRango(p,ini,fin) && !p.esReenvio).sort((a,b)=>(a.creado||0)-(b.creado||0));
  if(!arr.length){ toast("No despachaste nada hoy"); return; }
  const tot=arr.reduce((s,p)=>s+costoEnvio(p),0);
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const filas=arr.map((p,i)=>{ const q=p.metodo==="correo"?"Correo":(p.cadete||"—");
    return `<tr><td>${i+1}</td><td>${esc(p.cliente||"")}</td><td>${esc(numOrden(p))}</td><td>${esc(nombreEmp(p.empresa))}</td><td>${esc(anilloDe(p).label)} · ${esc(q)}</td><td style="text-align:right">${fmtAr(costoEnvio(p))}</td></tr>`; }).join("");
  const dia=new Date().toLocaleDateString("es-AR");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Corte de caja ${dia}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:14px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:6px}
  td{padding:6px;border-bottom:.5px solid #ddd}tfoot td{border-top:2px solid #111;font-weight:700;font-size:15px}
  </style></head><body>
  <h1>Corte de caja</h1><div class="sub">${dia} · ${arr.length} envíos</div>
  <table><thead><tr><th>#</th><th>Cliente</th><th>Orden</th><th>Marca</th><th>Reparto</th><th style="text-align:right">A cobrar</th></tr></thead>
  <tbody>${filas}</tbody>
  <tfoot><tr><td colspan="5">TOTAL A COBRAR</td><td style="text-align:right">${fmtAr(tot)}</td></tr></tfoot></table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
let EXP_EMP="", EXP_DESDE="", EXP_HASTA="";
function vistaExportar(){
  const inp="padding:9px 11px;border:1px solid var(--border);border-radius:10px;font:inherit;background:var(--bg);width:100%";
  app().innerHTML=`
    ${segOp('listados')}
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Exportar a Excel</div>
    <div class="subtitle">Descargá qué productos despachaste de cada empresa en un período. Sirve para rendir, controlar y facturar.</div>
    <div class="card" style="margin-bottom:14px">
      <span class="label">Empresa</span>
      <select id="expEmp" style="${inp};margin-bottom:12px" onchange="EXP_EMP=this.value">
        <option value="">Todas las empresas</option>
        ${EMPRESAS.map(e=>`<option value="${e.id}" ${EXP_EMP===e.id?'selected':''}>${esc(e.nombre)}</option>`).join("")}
      </select>
      <div class="row" style="gap:10px">
        <div style="flex:1"><span class="label">Desde</span><input type="date" value="${EXP_DESDE}" onchange="EXP_DESDE=this.value" style="${inp}"></div>
        <div style="flex:1"><span class="label">Hasta</span><input type="date" value="${EXP_HASTA}" onchange="EXP_HASTA=this.value" style="${inp}"></div>
      </div>
      <div class="hint" style="margin-top:8px">Si no elegís fechas, exporta todo lo despachado.</div>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn block" onclick="exportarExcel('detalle')">📊 Excel detallado (pedido x pedido)</button>
    </div>
    <button class="btn block ghost" style="margin-top:8px" onclick="exportarExcel('resumen')">📋 Excel resumen (productos y cantidades)</button>
    <div id="expPreview" style="margin-top:14px"></div>`;
  actualizarPreviewExport();
}
function rangoExport(){
  const ini=EXP_DESDE?new Date(EXP_DESDE+"T00:00:00").getTime():0;
  const fin=EXP_HASTA?new Date(EXP_HASTA+"T23:59:59").getTime():Date.now()+864e5;
  return {ini,fin};
}
function pedidosExport(){
  const {ini,fin}=rangoExport();
  return soloPedidos().filter(p=>{
    if(p.estado==="anulado" || p.esReenvio) return false;
    if(EXP_EMP && p.empresa!==EXP_EMP) return false;
    return despachadoEnRango(p,ini,fin);
  }).sort((a,b)=>(a.creado||0)-(b.creado||0));
}
function actualizarPreviewExport(){
  const el=document.getElementById("expPreview"); if(!el) return;
  const arr=pedidosExport();
  let uds=0; arr.forEach(p=>{ try{ uds+=itemsPedido(p).reduce((s,i)=>s+i.cant,0); }catch(e){ logErr("auto",e); } });
  el.innerHTML=`<div class="card"><div class="muted" style="text-align:center;font-size:13px">Se van a exportar <b>${arr.length}</b> envíos · <b>${uds}</b> unidades${EXP_EMP?(' de '+esc(nombreEmp(EXP_EMP))):''}</div></div>`;
}
function exportarExcel(tipo){
  if(typeof XLSX==="undefined"){ toast("El exportador no cargó, probá de nuevo"); return; }
  const arr=pedidosExport();
  if(!arr.length){ toast("No hay envíos para exportar en ese período/empresa"); return; }
  const empTxt=EXP_EMP?nombreEmp(EXP_EMP):"Todas";
  const per=(EXP_DESDE||EXP_HASTA)?((EXP_DESDE||"inicio")+"_a_"+(EXP_HASTA||"hoy")):"todo";
  let ws, nombreArch;
  if(tipo==="resumen"){
    // resumen: producto → cantidad total
    const acc={};
    arr.forEach(p=>{ try{ itemsPedido(p).forEach(i=>{ acc[i.prodNombre]=(acc[i.prodNombre]||0)+i.cant; }); }catch(e){ logErr("auto",e); } });
    const rows=[["Producto","Cantidad despachada"]];
    Object.entries(acc).sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>rows.push([n,c]));
    rows.push([]); rows.push(["TOTAL UNIDADES", Object.values(acc).reduce((s,n)=>s+n,0)]);
    ws=XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=[{wch:45},{wch:20}];
    nombreArch=`resumen_${empTxt}_${per}.xlsx`;
  } else {
    // detallado: una fila por producto de cada pedido
    const rows=[["Fecha","Cliente","N° Orden","Empresa","Producto","Cantidad","Zona","Reparto","Envío $"]];
    arr.forEach(p=>{ const fecha=p.creado?new Date(p.creado).toLocaleDateString("es-AR"):"";
      const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
      let its=[]; try{ its=itemsPedido(p); }catch(e){ logErr("auto",e); }
      if(!its.length) its=[{prodNombre:(p.items||"—"),cant:""}];
      its.forEach((it,idx)=>{ rows.push([ idx===0?fecha:"", idx===0?(p.cliente||""):"", idx===0?numOrden(p):"",
        idx===0?nombreEmp(p.empresa):"", it.prodNombre, it.cant, idx===0?anilloDe(p).label:"", idx===0?quien:"", idx===0?costoEnvio(p):"" ]); });
    });
    ws=XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=[{wch:11},{wch:22},{wch:16},{wch:14},{wch:40},{wch:9},{wch:9},{wch:12},{wch:10}];
    nombreArch=`despachos_${empTxt}_${per}.xlsx`;
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, empTxt.slice(0,28));
  XLSX.writeFile(wb, nombreArch.replace(/[^a-zA-Z0-9._-]/g,"-"));
  toast("Excel descargado ✓");
}
async function cambiarOrigen(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const nuevo = p.origen==="riotercero" ? "bsas" : "riotercero";
  await DB.update(id,{origen:nuevo});
  toast(nuevo==="riotercero"?"📍 Ahora sale de Río Tercero (no descuenta stock Bs As)":"📍 Ahora sale de Bs As");
  render();
}
/* ¿Qué pedidos van al laboratorio de Río Tercero?
   Regla: Labs Nutrition + canal Tienda Nube + destino interior (otra provincia, por correo).
   Se respeta lo que elijas a mano: si marcaste 📍 "sale de Río Tercero" entra siempre;
   si marcaste que sale de Bs As, no entra. Nutrivibe nunca (siempre sale de Bs As). */
function pedidosConsolidadoRT(){
  return soloPedidos().filter(p=>{
    if(["entregado","confirmado","anulado"].includes(p.estado) || p.cerradoEn) return false;
    if(saleSiempreBsAs(p.empresa)) return false;           // Nutrivibe/Suplemundo: siempre salen de Bs As
    if(p.origen==="riotercero") return true;               // lo marcaste a mano → va sí o sí
    if(p.origen==="bsas") return false;                    // lo marcaste a mano por Bs As → no va
    // por defecto: Labs · Tienda Nube · interior (otra provincia) → se produce en Río Tercero
    return p.empresa==="labs" && canalDe(p)==="tiendanube" && anilloDe(p).n===null;
  });
}
/* Consolidado: productos sumados de los pedidos que salen de Río Tercero, para el laboratorio */
function vistaConsolidado(){
  const arr=pedidosConsolidadoRT();
  const acc={};
  arr.forEach(p=>{ try{ itemsPedido(p).forEach(i=>{ acc[i.prodNombre]=(acc[i.prodNombre]||0)+i.cant; }); }catch(e){ logErr("auto",e); } });
  const prods=Object.entries(acc).sort((a,b)=>b[1]-a[1]);
  const totU=prods.reduce((s,[,c])=>s+c,0);
  app().innerHTML=`
    ${segOp('listados')}
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Consolidado Río Tercero</div>
    <div class="subtitle">Productos a preparar en el laboratorio de Río Tercero: pedidos de Labs Nutrition (Tienda Nube) al interior. Los kits ya vienen abiertos en sus frascos.</div>
    ${!arr.length?`<div class="card"><div class="muted" style="text-align:center;padding:24px">No hay pedidos de Labs (Tienda Nube) al interior para producir en Río Tercero.<br><span style="font-size:12px">Los del interior entran solos. Con el botón 📍 en cada pedido podés forzar que uno salga de Río Tercero o de Bs As.</span></div></div>`:`
    <div class="card" style="text-align:center;padding:18px;margin-bottom:14px;border:1.5px solid var(--accent)">
      <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Total a preparar</div>
      <div style="font-size:32px;font-weight:800;color:var(--accent);margin-top:4px">${totU} unidades</div>
      <div class="muted" style="font-size:13px;margin-top:2px">${prods.length} productos · ${arr.length} pedidos</div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-3);padding:11px 12px">Producto</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;color:var(--text-3);padding:11px 12px">Cantidad</th>
        </tr></thead>
        <tbody>${prods.map(([n,c])=>`<tr style="border-top:.5px solid var(--border)">
          <td style="padding:11px 12px;font-size:14px">${esc(n)}</td>
          <td style="padding:11px 12px;text-align:right;font-weight:800;font-size:16px">${c}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>
    <button class="btn block" onclick="imprimirConsolidado()">${icon('printer')} Imprimir / enviar al laboratorio</button>
    <button class="btn block ghost" style="margin-top:8px" onclick="exportarConsolidadoExcel()">📊 Descargar en Excel</button>`}`;
}
function consolidadoRT(){
  const arr=pedidosConsolidadoRT();
  const acc={}; arr.forEach(p=>{ try{ itemsPedido(p).forEach(i=>{ acc[i.prodNombre]=(acc[i.prodNombre]||0)+i.cant; }); }catch(e){ logErr("auto",e); } });
  return {arr, prods:Object.entries(acc).sort((a,b)=>b[1]-a[1])};
}
function imprimirConsolidado(){
  const {arr,prods}=consolidadoRT();
  if(!prods.length){ toast("No hay nada para consolidar"); return; }
  const totU=prods.reduce((s,[,c])=>s+c,0);
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const dia=new Date().toLocaleDateString("es-AR");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Consolidado Río Tercero ${dia}</title>
  <style>@page{size:A4;margin:16mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:13px}
  h1{font-size:22px;margin:0 0 2px}.sub{color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:8px}
  td{padding:9px 8px;border-bottom:.5px solid #ddd;font-size:15px}tfoot td{border-top:2px solid #111;font-weight:700;font-size:16px}
  .c{text-align:right}</style></head><body>
  <h1>Consolidado a preparar · Río Tercero</h1><div class="sub">${dia} · ${arr.length} pedidos · ${prods.length} productos</div>
  <table><thead><tr><th>Producto</th><th class="c">Cantidad</th></tr></thead>
  <tbody>${prods.map(([n,c])=>`<tr><td>${esc(n)}</td><td class="c">${c}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td>TOTAL UNIDADES</td><td class="c">${totU}</td></tr></tfoot></table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function exportarConsolidadoExcel(){
  if(typeof XLSX==="undefined"){ toast("El exportador no cargó"); return; }
  const {prods}=consolidadoRT();
  if(!prods.length){ toast("No hay nada para consolidar"); return; }
  const rows=[["Producto","Cantidad a preparar"]];
  prods.forEach(([n,c])=>rows.push([n,c]));
  rows.push([]); rows.push(["TOTAL", prods.reduce((s,[,c])=>s+c,0)]);
  const ws=XLSX.utils.aoa_to_sheet(rows); ws["!cols"]=[{wch:45},{wch:20}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Consolidado RT");
  XLSX.writeFile(wb, "consolidado-riotercero-"+new Date().toLocaleDateString("es-AR").replace(/\//g,"-")+".xlsx");
  toast("Excel descargado ✓");
}
function vistaListados(){
  const {ini,fin}=lstRango();
  const rBtn=(k,l)=>`<button class="${LST_RANGO===k?'on':''}" onclick="setLstRango('${k}')">${l}</button>`;
  const tBtn=(k,l)=>`<button class="${LST_TAB===k?'on':''}" onclick="LST_TAB='${k}';vistaListados()">${l}</button>`;
  const inp="padding:7px 9px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg);font-size:13px";
  app().innerHTML=`
    ${segOp('listados')}
    <div class="title">Listados</div>
    <div class="subtitle">Todo lo del día en una lista. Elegí el período y la solapa.</div>
    <div class="card" style="margin-bottom:12px">
      <div class="seg" style="flex-wrap:wrap">${rBtn('hoy','Hoy')}${rBtn('ayer','Ayer')}${rBtn('semana','Esta semana')}${rBtn('mes','Este mes')}${rBtn('todo','Todo')}</div>
      <div class="row" style="gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
        <span class="muted" style="font-size:12px">o entre fechas:</span>
        <input type="date" value="${LST_DESDE}" onchange="LST_DESDE=this.value;LST_RANGO='rango';vistaListados()" style="${inp}">
        <span class="muted">→</span>
        <input type="date" value="${LST_HASTA}" onchange="LST_HASTA=this.value;LST_RANGO='rango';vistaListados()" style="${inp}">
      </div>
    </div>
    <button class="btn block" style="margin-bottom:8px;background:var(--green);color:#fff" onclick="OPVIEW='cortecaja';vistaOperador()">🧾 Corte de caja de hoy</button>
    <button class="btn block ghost" style="margin-bottom:8px" onclick="OPVIEW='exportar';vistaOperador()">📊 Exportar a Excel (por empresa)</button>
    <button class="btn block ghost" style="margin-bottom:8px" onclick="OPVIEW='consolidado';vistaOperador()">🏭 Consolidado Río Tercero (laboratorio)</button>
    <button class="btn block" style="margin-bottom:8px;background:var(--green);color:#fff" onclick="pantallaCuenta()">💵 Ver cuenta · detalle a cobrar y recibos</button>
    <button class="btn block ghost" style="margin-bottom:8px" onclick="cerrarHastaAnteayer()">📅 Dejar a cobrar solo ayer y hoy (cerrar lo anterior)</button>
    <div class="row" style="gap:8px;margin-bottom:12px">
      <button class="btn ghost sm" style="flex:1" onclick="pantallaZonas()">🗺️ Envíos por zona</button>
      <button class="btn ghost sm" style="flex:1" onclick="pantallaCierre()">🔒 Cierre de período</button>
    </div>
    <div class="seg" style="margin-bottom:12px">${tBtn('envios','🚚 Envíos')}${tBtn('caja','💵 Cobros y pagos')}${tBtn('stock','📦 Salió de stock')}</div>
    <div id="lstBody">${lstContenido(ini,fin)}</div>`;
}
function lstContenido(ini,fin){
  if(LST_TAB==="envios") return lstEnvios(ini,fin);
  if(LST_TAB==="caja") return lstCaja(ini,fin);
  return lstStock(ini,fin);
}
function lstFechaTit(){
  const {ini,fin}=lstRango();
  if(LST_RANGO==="hoy") return "hoy";
  if(LST_RANGO==="ayer") return "ayer";
  if(LST_RANGO==="rango") return (LST_DESDE||"…")+" al "+(LST_HASTA||"…");
  return {semana:"esta semana",mes:"este mes",todo:"todo"}[LST_RANGO]||"";
}
function despachadoEnRango(p,ini,fin){
  if(["pendiente","anulado"].includes(p.estado)) return false;
  const ev=(p.eventos||[]).filter(e=>["preparado","asignado","en_reparto","despachado","en_camino","entregado"].includes(e.estado));
  const t=ev.length?Math.min(...ev.map(e=>e.ts||0)):0;
  return t>=ini && t<fin;
}
function chipEstado(p){
  const e=p.estado, m={pendiente:['#e0b000','Pendiente'],preparado:['var(--accent)','Preparado'],asignado:['#7f77dd','Asignado'],en_reparto:['#7f77dd','En reparto'],despachado:['#7f77dd','Despachado'],en_camino:['#7f77dd','En camino'],entregado:['var(--green)','Entregado'],confirmado:['var(--green)','Confirmado']};
  const c=m[e]||['var(--text-3)',e];
  return `<span style="display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:${c[0]}22;color:${c[0]}">${c[1]}</span>`;
}
function lstEnvios(ini,fin){
  const todos=soloPedidos().filter(p=>despachadoEnRango(p,ini,fin)).sort((a,b)=>(b.creado||0)-(a.creado||0));
  if(!todos.length) return `<div class="card"><div class="muted" style="text-align:center;padding:28px">No hay envíos despachados ${lstFechaTit()}.</div></div>`;
  const arr=todos.filter(p=>!p.esReenvio);           // ventas reales (se cobran)
  const reenvios=todos.filter(p=>p.esReenvio);       // reenvíos (costo, no se cobran)
  const uds=arr.reduce((s,p)=>{ try{ return s+itemsPedido(p).reduce((x,i)=>x+i.cant,0); }catch(e){ return s; } },0);
  const tot=arr.reduce((s,p)=>s+costoEnvio(p),0);
  const costoReenvios=reenvios.reduce((s,p)=>s+costoEnvio(p),0);
  const th=(t,r)=>`<th style="text-align:${r?'right':'left'};font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);font-weight:600;padding:0 4px 8px">${t}</th>`;
  const filaPed=p=>{ const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
    return `<tr onclick="toggleExp('${p.id}')" style="cursor:pointer;border-top:.5px solid var(--border)">
      <td style="padding:11px 4px"><b style="font-size:13.5px">${esc(p.cliente||'—')}</b><div class="muted" style="font-size:11px">N° ${esc(numOrden(p))}</div></td>
      <td style="padding:11px 4px;font-size:12.5px;color:var(--text-2)">${esc(nombreEmp(p.empresa).split(" ")[0])}</td>
      <td style="padding:11px 4px;font-size:12.5px">${esc(anilloDe(p).label)}<div class="muted" style="font-size:11px">${esc(quien)}</div></td>
      <td style="padding:11px 4px">${chipEstado(p)}</td>
      <td style="padding:11px 4px;text-align:right;font-weight:700;font-size:13.5px">${fmtAr(costoEnvio(p))}</td></tr>`; };
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:grid;grid-template-columns:repeat(${reenvios.length?4:3},1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${arr.length}</div><div class="muted" style="font-size:11px">Envíos</div></div>
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${uds}</div><div class="muted" style="font-size:11px">Unidades</div></div>
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:var(--green)">${fmtAr(tot)}</div><div class="muted" style="font-size:11px">A cobrar</div></div>
      ${reenvios.length?`<div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:#e5484d">${fmtAr(costoReenvios)}</div><div class="muted" style="font-size:11px">🔁 ${reenvios.length} reenvío${reenvios.length>1?'s':''}</div></div>`:''}
    </div>
    <div style="padding:14px 16px 4px;display:flex;justify-content:flex-end"><button class="btn sm ghost" onclick="imprimirListado('envios')">${icon('printer')} Imprimir listado</button></div>
    <div style="overflow-x:auto;padding:0 6px 6px"><table style="width:100%;border-collapse:collapse;min-width:560px">
      <thead><tr>${th('Cliente')}${th('Marca')}${th('Zona / Reparto')}${th('Estado')}${th('Envío',1)}</tr></thead>
      <tbody>${arr.map(filaPed).join("")}</tbody>
      <tfoot><tr style="border-top:1.5px solid var(--text-3)"><td colspan="4" style="padding:12px 4px;font-weight:700">Total a cobrar ${lstFechaTit()}</td><td style="padding:12px 4px;text-align:right;font-weight:800;font-size:15px;color:var(--green)">${fmtAr(tot)}</td></tr></tfoot>
    </table></div>
    ${reenvios.length?`<div style="padding:6px 16px 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#e5484d;font-weight:700;margin:8px 0">🔁 Reenvíos del período (no se cobran)</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:560px">
        <tbody>${reenvios.map(p=>{ const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
          return `<tr onclick="toggleExp('${p.id}')" style="cursor:pointer;border-top:.5px solid var(--border)">
            <td style="padding:11px 4px"><b style="font-size:13.5px">${esc(p.cliente||'—')}</b><div class="muted" style="font-size:11px">N° ${esc(numOrden(p))}${p.motivoReenvio?' · '+esc(p.motivoReenvio):''}</div></td>
            <td style="padding:11px 4px;font-size:12.5px">${esc(anilloDe(p).label)} · ${esc(quien)}</td>
            <td style="padding:11px 4px;text-align:right;font-weight:700;font-size:13.5px;color:#e5484d">${fmtAr(costoEnvio(p))}</td></tr>`; }).join("")}</tbody>
        <tfoot><tr style="border-top:1.5px solid #e5484d"><td style="padding:12px 4px;font-weight:700">Te costaron</td><td></td><td style="padding:12px 4px;text-align:right;font-weight:800;color:#e5484d">${fmtAr(costoReenvios)}</td></tr></tfoot>
      </table></div>
    </div>`:''}
  </div>`;
}
function lstCaja(ini,fin){
  const movs=cajaMovs().filter(m=>(m.ts||0)>=ini && (m.ts||0)<fin);
  if(!movs.length) return `<div class="card"><div class="muted" style="text-align:center;padding:28px">No hay cobros ni pagos ${lstFechaTit()}.</div></div>`;
  const cob=movs.filter(m=>m.clase==="cobro").reduce((s,m)=>s+(m.monto||0),0);
  const pag=movs.filter(m=>m.clase!=="cobro").reduce((s,m)=>s+(m.monto||0),0);
  const th=(t,r)=>`<th style="text-align:${r?'right':'left'};font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);font-weight:600;padding:0 4px 8px">${t}</th>`;
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:var(--green)">${fmtAr(cob)}</div><div class="muted" style="font-size:11px">Cobrado</div></div>
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:#e5484d">${fmtAr(pag)}</div><div class="muted" style="font-size:11px">Pagado</div></div>
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${fmtAr(cob-pag)}</div><div class="muted" style="font-size:11px">Neto</div></div>
    </div>
    <div style="padding:14px 16px 4px;display:flex;justify-content:flex-end"><button class="btn sm ghost" onclick="imprimirListado('caja')">${icon('printer')} Imprimir listado</button></div>
    <div style="overflow-x:auto;padding:0 6px 6px"><table style="width:100%;border-collapse:collapse;min-width:420px">
      <thead><tr>${th('Quién / Comprobante')}${th('Tipo')}${th('Monto',1)}</tr></thead>
      <tbody>${movs.map(m=>`<tr style="border-top:.5px solid var(--border)">
        <td style="padding:11px 4px"><b style="font-size:13.5px">${esc(m.quien||'—')}</b><div class="muted" style="font-size:11px">${esc(m.nro||'')} · ${m.ts?new Date(m.ts).toLocaleDateString("es-AR"):''}</div></td>
        <td style="padding:11px 4px">${m.clase==="cobro"?'<span style="display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:#1d9e7522;color:var(--green)">Cobro</span>':'<span style="display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:#e5484d22;color:#e5484d">Pago</span>'}</td>
        <td style="padding:11px 4px;text-align:right;font-weight:700;font-size:13.5px;color:${m.clase==="cobro"?'var(--green)':'#e5484d'}">${m.clase==="cobro"?'+':'−'}${fmtAr(m.monto)}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>`;
}
function lstStock(ini,fin){
  const desde=fDia(ini), hasta=fDia(fin-1);
  const res=salidasResumen(desde,hasta);
  if(!res.length) return `<div class="card"><div class="muted" style="text-align:center;padding:28px">No salió stock ${lstFechaTit()}.</div></div>`;
  const uds=res.reduce((s,r)=>s+r.total,0);
  const orden=res.sort((a,b)=>b.total-a.total);
  const max=Math.max(1,...orden.map(r=>r.total));
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${res.length}</div><div class="muted" style="font-size:11px">Productos distintos</div></div>
      <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${uds}</div><div class="muted" style="font-size:11px">Unidades que salieron</div></div>
    </div>
    <div style="padding:14px 16px 4px;display:flex;justify-content:flex-end"><button class="btn sm ghost" onclick="imprimirListado('stock')">${icon('printer')} Imprimir listado</button></div>
    <div style="padding:0 16px 14px">
      ${orden.map(r=>`<div style="padding:10px 0;border-top:.5px solid var(--border)">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:13.5px;min-width:0">${esc(r.prod)}</span>
          <b style="font-size:14px;flex:0 0 auto;margin-left:10px">${r.total}</b>
        </div>
        <div style="height:5px;background:var(--bg-3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round(r.total/max*100)}%;background:var(--accent);border-radius:3px"></div></div>
      </div>`).join("")}
    </div>
  </div>`;
}
function imprimirListado(tab){
  const {ini,fin}=lstRango();
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  let titulo, filas, cabeceras;
  if(tab==="envios"){
    const arr=soloPedidos().filter(p=>despachadoEnRango(p,ini,fin)).sort((a,b)=>(a.creado||0)-(b.creado||0));
    titulo="Envíos despachados"; cabeceras=["#","Cliente","Orden","Marca","Reparto","Productos","Envío"];
    filas=arr.map((p,i)=>{ let it=[]; try{it=itemsPedido(p);}catch(e){ logErr("auto",e); } const q=p.metodo==="correo"?"Correo":(p.cadete||"—");
      return [i+1,p.cliente||"",numOrden(p),nombreEmp(p.empresa),anilloDe(p).label+" · "+q, it.map(x=>x.cant+"× "+x.prodNombre).join("<br>"), fmtAr(costoEnvio(p))]; });
  } else if(tab==="caja"){
    const movs=cajaMovs().filter(m=>(m.ts||0)>=ini && (m.ts||0)<fin).sort((a,b)=>(a.ts||0)-(b.ts||0));
    titulo="Cobros y pagos"; cabeceras=["Fecha","Comprobante","Quién","Tipo","Monto"];
    filas=movs.map(m=>[m.ts?new Date(m.ts).toLocaleDateString("es-AR"):"", m.nro||"", m.quien||"", m.clase==="cobro"?"Cobro":"Pago", (m.clase==="cobro"?"+":"−")+fmtAr(m.monto)]);
  } else {
    const res=salidasResumen(fDia(ini),fDia(fin-1)).sort((a,b)=>b.total-a.total);
    titulo="Salió de stock"; cabeceras=["Producto","Unidades"];
    filas=res.map(r=>[r.prod, r.total]);
  }
  const th=cabeceras.map(c=>`<th>${c}</th>`).join("");
  const tr=filas.map(f=>`<tr>${f.map((c,i)=>`<td${i===f.length-1&&tab!=='stock'?' style="text-align:right"':''}>${c}</td>`).join("")}</tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:6px}
  td{padding:6px;border-bottom:.5px solid #ddd;vertical-align:top}</style></head><body>
  <h1>${titulo} · ${lstFechaTit()}</h1><div class="sub">Fullminet · ${new Date().toLocaleDateString("es-AR")}</div>
  <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
/* Detecta productos en riesgo de quedarse sin stock: se acaban en <=3 días, venta disparada, o bajo mínimo */
function alertasQuiebre(){
  const st=stockState();
  const salidas=(st.movs||[]).filter(m=>m.tipo==="salida");
  if(!salidas.length) return [];
  const ahora=Date.now();
  const tsList=salidas.map(m=>m.ts||0).filter(Boolean);
  const primero=Math.min(...tsList), ultimo=Math.max(...tsList);
  const diasHist=Math.max(1,(ultimo-primero)/86400000);
  // ventas totales y ventas de los últimos 7 días, por producto
  const total={}, reciente={};
  const hace7=ahora-7*86400000;
  salidas.forEach(m=>{ total[m.prod]=(total[m.prod]||0)+m.cant;
    if((m.ts||0)>=hace7) reciente[m.prod]=(reciente[m.prod]||0)+m.cant; });
  const res=[];
  Object.keys(total).forEach(prod=>{
    const stk=nivel(prod,st);
    if(stk<=0) { res.push({prod, stk, dias:0, motivo:"sin stock", nivel:3}); return; }
    const promDia=total[prod]/diasHist;              // ritmo histórico
    const recDia=(reciente[prod]||0)/7;              // ritmo últimos 7 días
    const ritmo=Math.max(promDia, recDia);           // uso el más alto (si se disparó, ese manda)
    const diasRestantes=ritmo>0 ? Math.floor(stk/ritmo) : 999;
    const mn=minDe(prod,st);
    const disparo = recDia > promDia*1.8 && recDia>0.5;   // vende 80%+ más que su promedio
    let motivo="", nivel=0;
    if(diasRestantes<=3){ motivo="se acaba en "+diasRestantes+(diasRestantes===1?" día":" días"); nivel=3; }
    else if(disparo){ motivo="se disparó la venta"; nivel=2; }
    else if(mn>0 && stk<mn){ motivo="bajo el mínimo ("+stk+"/"+mn+")"; nivel=1; }
    if(nivel>0) res.push({prod, stk, dias:diasRestantes, motivo, nivel, disparo});
  });
  return res.sort((a,b)=>b.nivel-a.nivel || a.dias-b.dias);
}
function vistaHoy(){
  const ped=soloPedidos().filter(p=>!p.cerradoEn);
  const act=ped.filter(p=>!["entregado","confirmado","anulado"].includes(p.estado));
  const nSinAsig=act.filter(p=>p.estado==="pendiente" && !p.metodo).length;
  const nPrep=act.filter(p=>p.estado==="pendiente").length;   // pendientes de preparar (con o sin método)
  const nListos=act.filter(p=>p.estado==="preparado").length;             // preparados, falta despachar
  const nReparto=act.filter(p=>["asignado","en_reparto","despachado","en_camino"].includes(p.estado)).length;
  LISTA_OP=act;   // para poder imprimir esta misma lista

  // determino el paso actual
  let paso, titulo, sub, accion, colorPaso;
  if(act.length===0){ paso=0; titulo="Todo al día 👍"; sub="No hay pedidos pendientes. Cuando importes, van a aparecer acá."; }
  else if(nSinAsig>0){ paso=2; colorPaso="var(--amber)"; titulo=nSinAsig+" pedido"+(nSinAsig>1?"s":"")+" sin asignar"; sub="Elegí quién lleva cada uno: Cardinal, Claudia o Correo."; accion=`<button class="btn block big" onclick="OPVIEW='pedidos';FILTRO='pendiente';vistaOperador()">Asignar reparto →</button>`; }
  else if(nPrep>0){ paso=3; colorPaso="var(--accent)"; titulo=nPrep+" pedido"+(nPrep>1?"s":"")+" para preparar"; sub="Entrá a cada pedido y escaneá sus productos. De a uno, así no se mezclan."; accion=`<button class="btn block big" onclick="OPVIEW='prepararhoy';vistaOperador()">📦 Preparar con escáner →</button><button class="btn ghost block" style="margin-top:8px" onclick="imprimirChecklistDia()">🖨️ O imprimir checklist en papel</button>`; }
  else if(nListos>0){ paso=4; colorPaso="#7f77dd"; titulo=nListos+" listo"+(nListos>1?"s":"")+" para despachar"; sub="Entregá los paquetes al cadete o llevalos al correo. Marcá cada uno como despachado."; accion=`<button class="btn block big" onclick="OPVIEW='pedidos';FILTRO='preparado';vistaOperador()">Despachar →</button>`; }
  else { paso=5; colorPaso="var(--green)"; titulo="Todo despachado 🚚"; sub=nReparto+" en camino. Cuando confirmes que llegaron, marcalos como entregados."; accion=`<button class="btn ghost block" onclick="OPVIEW='pedidos';FILTRO='todos';vistaOperador()">Ver pedidos →</button>`; }

  const pasos=[["Importar","↓",true],["Asignar","⇄",nSinAsig===0&&act.length>0],["Preparar","☑",nPrep===0&&nListos+nReparto>0],["Despachar","🚚",nListos===0&&nReparto>0]];
  app().innerHTML=`
    ${segOp('hoy')}
    <div class="title">Hoy</div>
    <div class="subtitle">${new Date().toLocaleDateString("es-AR",{weekday:'long',day:'numeric',month:'long'})}</div>
    ${(()=>{ const aq=alertasQuiebre(); if(!aq.length) return "";
      const criticos=aq.filter(a=>a.nivel>=2);
      if(!criticos.length) return "";
      return `<div class="card" style="margin-bottom:16px;border:1.5px solid #e5484d;background:#fff5f5">
        <b style="color:#c62828;font-size:15px">⚠ ${criticos.length} ${criticos.length===1?'producto en riesgo de quiebre':'productos en riesgo de quiebre'}</b>
        <div style="font-size:12.5px;color:#7a1f1f;margin:4px 0 8px">Reponé pronto para no quedarte sin stock:</div>
        ${criticos.slice(0,6).map(a=>`<div style="font-size:13.5px;color:#7a1f1f;padding:4px 0;border-top:.5px solid #f0caca">
          ${a.disparo?'🔥':'📉'} <b>${esc(a.prod)}</b> — quedan ${a.stk} · ${esc(a.motivo)}</div>`).join("")}
        <button class="btn sm ghost" style="margin-top:8px" onclick="OPVIEW='stock';vistaOperador()">Ver stock →</button>
      </div>`; })()}
    ${(()=>{ const arch=PEDIDOS.filter(p=>p.tipo==="pedido" && p.cerradoEn); if(!arch.length) return "";
      return `<div class="card" style="margin-bottom:16px;border:1.5px solid var(--amber);background:#fffbea">
        <b style="color:#b58600;font-size:14px">📦 Hay ${arch.length} pedidos archivados</b>
        <div style="font-size:12.5px;color:#7a5a00;margin:6px 0 10px">Si cerraste el período sin querer, no se borró nada. Podés devolverlos a la lista:</div>
        <div class="row" style="gap:8px">
          <button class="btn sm" style="flex:1;background:var(--amber);color:#3a2e00" onclick="revertirUltimoCierre()">↩️ Revertir último cierre</button>
          <button class="btn sm ghost" style="flex:1" onclick="verArchivados()">👁️ Ver archivados</button>
        </div>
        <button class="btn sm block" style="margin-top:8px;background:var(--accent);color:#fff" onclick="cerrarAnterioresAEstaSemana()">📅 Dejar solo esta semana a la vista (archivar lo viejo)</button>
        <div style="margin-top:10px;padding-top:10px;border-top:.5px dashed #e0c060">
          <div style="font-size:12px;color:#7a5a00;margin-bottom:6px">O elegí una fecha exacta de corte (deja a la vista desde ese día en adelante):</div>
          <div class="row" style="gap:8px;align-items:center">
            <input type="date" onchange="FECHA_CORTE=this.value" style="padding:7px 9px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg);flex:1">
            <button class="btn sm" style="background:#7a5a00;color:#fff;flex:0 0 auto" onclick="cerrarDesdeFecha()">Aplicar corte</button>
          </div>
        </div>
      </div>`; })()}

    <div class="card" style="text-align:center;padding:26px 20px;margin-bottom:16px;border:1.5px solid ${colorPaso||'var(--border)'}">
      ${paso>0?`<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${colorPaso};margin-bottom:10px">Paso ${paso-1} de 4</div>`:''}
      <div style="font-size:24px;font-weight:800;line-height:1.15;margin-bottom:6px">${titulo}</div>
      <div class="muted" style="font-size:15px;margin-bottom:20px;max-width:400px;margin-left:auto;margin-right:auto">${sub}</div>
      ${accion||''}
    </div>

    <div class="card" style="margin-bottom:16px">
      <span class="label">El día en números</span>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;margin-top:4px">
        <div><div style="font-size:26px;font-weight:800;color:${nSinAsig?'var(--amber)':'var(--text-3)'}">${nSinAsig}</div><div class="muted" style="font-size:11px">Sin asignar</div></div>
        <div><div style="font-size:26px;font-weight:800;color:${nPrep?'var(--accent)':'var(--text-3)'}">${nPrep}</div><div class="muted" style="font-size:11px">Preparar</div></div>
        <div><div style="font-size:26px;font-weight:800;color:${nListos?'#7f77dd':'var(--text-3)'}">${nListos}</div><div class="muted" style="font-size:11px">Despachar</div></div>
        <div><div style="font-size:26px;font-weight:800;color:${nReparto?'var(--green)':'var(--text-3)'}">${nReparto}</div><div class="muted" style="font-size:11px">En camino</div></div>
      </div>
    </div>

    ${(()=>{ const ca=pedidosConAviso(); if(!ca.length) return "";
      return `<div class="card" style="margin-bottom:16px;border:1px solid #e5484d;background:#fff5f5">
        <b style="color:#c62828">⚠ ${ca.length} ${ca.length===1?'pedido preparado con avisos':'pedidos preparados con avisos'}</b>
        ${ca.slice(0,4).map(p=>`<div style="font-size:13px;color:#7a1f1f;margin-top:6px;padding-top:6px;border-top:.5px solid #f0caca">
          <b>${esc(p.cliente||'—')}</b> · N° ${esc(numOrden(p))}<br>
          ${p.prepAlertas.map(t=>"• "+esc(t)).join("<br>")}</div>`).join("")}
      </div>`; })()}
    <span class="label" style="display:block;margin-bottom:8px">Acciones rápidas</span>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn ghost" onclick="formImportar()">↓ Importar etiquetas</button>
      <button class="btn ghost" onclick="bajarEtiquetasDelDia()">🏷️ Bajar etiquetas 10×15</button>
      <button class="btn ghost" onclick="imprimirChecklistDia()">🖨️ Checklist preparación</button>
      <button class="btn ghost" onclick="OPVIEW='pedidos';vistaOperador()">▤ Ver todos los pedidos</button>
    </div>
    <button class="btn block" style="margin-top:8px;background:var(--accent);color:#fff" onclick="copiarAcceso('operador')">🔗 Copiar link para mi empleada (solo preparar)</button>
    ${act.length?`<div class="card" style="margin-top:16px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <span class="label" style="margin:0">Pedidos activos por marca · ${act.length}</span>
          <div class="row" style="gap:8px">
            <button class="btn sm ghost" onclick="imprimirTablaPedidos(LISTA_OP,'Pedidos activos por marca')">${icon('printer')} Imprimir</button>
            ${zenBtn()}
          </div>
        </div>
        <div class="hint" style="margin-bottom:8px">Tocá la zona o el reparto de cualquier fila para corregirlos al toque, sin entrar al pedido.</div>
        ${tablaPedidos(act)}
      </div>`:''}
    ${(()=>{
      const hoy0=new Date(); hoy0.setHours(0,0,0,0); const hoyIni=hoy0.getTime();
      const despHoy=soloPedidos().filter(p=>{
        if(["pendiente","anulado"].includes(p.estado)) return false;
        const ev=(p.eventos||[]).filter(e=>["preparado","asignado","en_reparto","despachado","en_camino","entregado"].includes(e.estado));
        const primero=ev.length?Math.min(...ev.map(e=>e.ts||0)):0;
        return primero>=hoyIni;
      }).sort((a,b)=>(b.creado||0)-(a.creado||0));
      if(!despHoy.length) return "";
      const uds=despHoy.reduce((s,p)=>{ try{ return s+itemsPedido(p).reduce((x,i)=>x+i.cant,0); }catch(e){ return s; } },0);
      return `<div class="card" style="margin-top:16px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <span class="label" style="margin:0">Despachados hoy · ${despHoy.length} · ${uds} u</span>
          <button class="btn sm ghost" onclick="imprimirDespachadosHoy()">${icon('printer')} Imprimir</button>
        </div>
        <div style="overflow-x:auto"><table class="tbl2" style="min-width:520px">
          ${despHoy.map(p=>{ const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
            return `<tr onclick="toggleExp('${p.id}')" style="cursor:pointer">
              <td><b>${esc(p.cliente||'—')}</b><div class="muted" style="font-size:11px">N° ${esc(numOrden(p))}</div></td>
              <td class="muted" style="font-size:12px">${esc(nombreEmp(p.empresa).split(" ")[0])}</td>
              <td style="font-size:12px">${esc(anilloDe(p).label)} · ${esc(quien)}</td>
              <td style="text-align:right"><span class="chip" style="font-size:11px">${esc(estObj(p.estado).label||p.estado)}</span></td>
              <td style="text-align:right;font-weight:700">${fmtAr(costoEnvio(p))}</td></tr>`; }).join("")}
        </table></div>
      </div>`;
    })()}
    <div style="text-align:center;margin-top:20px;padding-top:12px;border-top:.5px solid var(--border)">
      <span class="muted" style="font-size:11px">Fullminet · versión <b>${APP_VERSION}</b></span>
    </div>`;
}
function imprimirDespachadosHoy(){
  const hoy0=new Date(); hoy0.setHours(0,0,0,0); const hoyIni=hoy0.getTime();
  const arr=soloPedidos().filter(p=>{
    if(["pendiente","anulado"].includes(p.estado)) return false;
    const ev=(p.eventos||[]).filter(e=>["preparado","asignado","en_reparto","despachado","en_camino","entregado"].includes(e.estado));
    const primero=ev.length?Math.min(...ev.map(e=>e.ts||0)):0;
    return primero>=hoyIni;
  }).sort((a,b)=>(a.creado||0)-(b.creado||0));
  if(!arr.length){ toast("No despachaste nada hoy todavía"); return; }
  let uds=0; arr.forEach(p=>{ try{ uds+=itemsPedido(p).reduce((s,i)=>s+i.cant,0); }catch(e){ logErr("auto",e); } });
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const filas=arr.map((p,i)=>{ let it=[]; try{ it=itemsPedido(p); }catch(e){ logErr("auto",e); }
    const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
    return `<tr><td>${i+1}</td><td>${esc(p.cliente||"")}</td><td>${esc(numOrden(p))}</td>
      <td>${esc(nombreEmp(p.empresa))}</td><td>${esc(anilloDe(p).label)} · ${esc(quien)}</td>
      <td>${it.map(x=>x.cant+"× "+esc(x.prodNombre)).join("<br>")}</td><td style="text-align:right">${fmtAr(costoEnvio(p))}</td></tr>`; }).join("");
  const dia=new Date().toLocaleDateString("es-AR");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Despachados ${dia}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:6px}
  td{padding:6px;border-bottom:.5px solid #ddd;vertical-align:top}tfoot td{border-top:2px solid #111;font-weight:700}
  </style></head><body>
  <h1>Envíos despachados hoy</h1><div class="sub">${dia} · ${arr.length} envíos · ${uds} unidades</div>
  <table><thead><tr><th>#</th><th>Cliente</th><th>Orden</th><th>Marca</th><th>Reparto</th><th>Productos</th><th style="text-align:right">Envío</th></tr></thead>
  <tbody>${filas}</tbody>
  <tfoot><tr><td colspan="6">Total a cobrar</td><td style="text-align:right">${fmtAr(arr.reduce((s,p)=>s+costoEnvio(p),0))}</td></tr></tfoot></table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
/* Imprime cualquier lista de pedidos, agrupada por marca (para "Pedidos activos por marca" en Hoy, y la tabla de Pedidos) */
function imprimirTablaPedidos(lista, titulo){
  if(!lista||!lista.length){ toast("No hay pedidos para imprimir"); return; }
  const ordEmp={}; EMPRESAS.forEach((e,i)=>ordEmp[e.id]=i);
  const rk=x=>(ordEmp[x]!=null?ordEmp[x]:99);
  const arr=lista.slice().sort((a,b)=>{ const oa=rk(a.empresa), ob=rk(b.empresa); return oa!==ob?oa-ob:(b.creado||0)-(a.creado||0); });
  const w=window.open("","_blank"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  let ult=null, filas="";
  arr.forEach(p=>{ const e=estObj(p.estado), an=anilloDe(p);
    const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
    if(p.empresa!==ult){ ult=p.empresa; const cnt=arr.filter(x=>x.empresa===p.empresa).length;
      filas+=`<tr><td colspan="8" style="background:#eee;font-weight:700;text-transform:uppercase;font-size:11px;padding:7px 6px">${esc(p.empresa?empresaObj(p.empresa).nombre:'Sin marca')} · ${cnt} env${cnt===1?'ío':'íos'}</td></tr>`; }
    let it=[]; try{ it=itemsPedido(p); }catch(err){ logErr("auto",err); }
    filas+=`<tr>
      <td>${p.creado?fmtFechaCorta(p.creado):'—'}</td>
      <td>${esc(numOrden(p))}</td>
      <td>${esc(p.cliente||'—')}</td>
      <td>${it.map(x=>x.cant+"× "+esc(x.prodNombre)).join("<br>")||esc(p.items||'—')}</td>
      <td>${esc(an.label)}</td>
      <td>${esc(quien)}</td>
      <td>${esc(e.label||p.estado)}</td>
      <td style="text-align:right">${fmtAr(costoEnvio(p))}</td></tr>`; });
  const dia=new Date().toLocaleDateString("es-AR");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo||'Pedidos')} ${dia}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:6px}
  td{padding:6px;border-bottom:.5px solid #ddd;vertical-align:top}
  </style></head><body>
  <h1>${esc(titulo||'Pedidos')}</h1><div class="sub">${dia} · ${arr.length} pedido${arr.length===1?'':'s'}</div>
  <table><thead><tr><th>Fecha</th><th>N°</th><th>Cliente</th><th>Productos</th><th>Zona</th><th>Reparto</th><th>Estado</th><th style="text-align:right">Envío</th></tr></thead>
  <tbody>${filas}</tbody></table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function vistaPanel(){
  const ped=soloPedidos();
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const ACTIVOS_EST=["pendiente","preparado","asignado","en_reparto","despachado","en_camino","entregado"];
  const activos=ped.filter(p=>ACTIVOS_EST.includes(p.estado));   // solo estados de trabajo reales
  const porPrep=ped.filter(p=>p.estado==="pendiente").length;
  const enRuta=ped.filter(p=>["asignado","en_reparto"].includes(p.estado)).length;
  const entregadosHoy=ped.filter(p=>(p.eventos||[]).some(e=>e.estado==="entregado"&&e.ts>=hoy.getTime())).length;
  const rutaStops=ped.filter(p=>p.metodo==="cadete"&&(p.provincia||"").toLowerCase().includes("caba")&&!["entregado","confirmado"].includes(p.estado)).length;
  const reabas=soloReabas().filter(r=>r.estado!=="recibido").length;
  const facturacion=activos.reduce((s,p)=>s+costoEnvio(p),0);
  const st=stockState(), pick=pickingConsolidado();
  const conMov=new Set((st.movs||[]).map(m=>m.prod));   // solo productos que realmente manejás
  const reponer=PRODUCTOS.filter(p=>conMov.has(p.nombre)&&pedirDe(p.nombre,st)>0).length;
  const fecha=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const zc=zonaCosto(), esCad=c=>["caba","1","2","3"].includes(c);
  const repHoy={}; activos.forEach(p=>{ const q=p.metodo==="correo"?"Correo":(p.cadete||"Sin asignar");
    const c=catPedido(p); if(!repHoy[q]) repHoy[q]={q,n:0,$:0};
    repHoy[q].n++; repHoy[q].$ += (esCad(c)&&p.metodo!=="correo"&&cadeteCobra(q))?costoCard(p,c,zc):0; });
  const estados=[["pendiente","Por preparar"],["preparado","Preparados"],["asignado","Asignados"],["en_reparto","En reparto"],["despachado","Despachados"],["en_camino","En camino"],["entregado","Entregados"]];
  const filaEst=estados.map(([k,l])=>{ const n=ped.filter(p=>p.estado===k).length; if(!n) return "";
    const e=estObj(k);
    return `<tr onclick="FILTRO='${k}';OPVIEW='pedidos';vistaOperador()" style="cursor:pointer">
      <td><span class="dot" style="background:${e.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px"></span>${l}</td>
      <td style="text-align:right;font-weight:700">${n}</td>
      <td style="text-align:right;color:var(--text-3)">›</td></tr>`; }).join("");
  const mods=[["pedidos","store","Pedidos","Gestionar y facturar",activos.length],
    ["preparacion","box","Preparación","Lista de pickeo",porPrep],
    ["stock","panel","Stock","Inventario y remitos",reponer||null],
    ["informes","panel","Informes","Cuentas, cierres y salidas",null],
    ["ruta","route","Ruta","Hoja de ruta CABA",rutaStops||null],
    ["deposito","truck","Depósito","Reabastecimientos",reabas||null]];
  app().innerHTML=`
    ${segOp('panel')}
    <div class="title">Panel de control</div>
    <div class="subtitle" style="text-transform:capitalize">${fecha}</div>
    <div class="hero">
      ${EMPLEADO?`<span class="label" style="margin-bottom:6px">Pedidos activos</span>
        <div class="n">${activos.length}</div>
        <div class="c">${porPrep} por preparar · ${entregadosHoy} entregados hoy</div>`
      :`<span class="label" style="margin-bottom:6px">A facturar · pedidos activos</span>
        <div class="n" style="color:var(--accent)">${fmtAr(facturacion)}</div>
        <div class="c">${activos.length} pedidos activos · ${entregadosHoy} entregados hoy</div>`}
    </div>
    <div class="two" style="margin-top:14px;align-items:start">
      <div class="card" style="padding:14px 16px">
        <span class="label" style="margin:0 0 6px">Estado de los pedidos</span>
        <table class="tbl2">${filaEst||`<tr><td class="muted" style="padding:14px 0">Todo al día 👍 <span style="opacity:.7">· ${ped.filter(p=>p.estado==="confirmado").length} pedidos cerrados</span></td></tr>`}
        </table>
      </div>
      <div class="card" style="padding:14px 16px">
        <span class="label" style="margin:0 0 6px">Reparto · pedidos activos</span>
        <table class="tbl2">
          ${Object.values(repHoy).sort((a,b)=>b.n-a.n).map(x=>`<tr>
            <td>${esc(x.q)}</td>
            <td style="text-align:right;font-weight:700">${x.n}</td>
            <td style="text-align:right;color:${x.$?'#e5484d':'var(--text-3)'};font-size:12.5px">${x.$?fmtAr(x.$):'—'}</td></tr>`).join("")
            ||'<tr><td class="muted">Sin pedidos activos</td></tr>'}
        </table>
        ${(()=>{ const raros=cadetesRaros(); if(!raros.length) return "";
          return `<div style="margin-top:10px;padding-top:9px;border-top:.5px solid var(--border)">
            <div class="muted" style="font-size:12.5px;margin-bottom:6px">⚠ Repartidores de antes. Pasalos a los actuales:</div>
            ${raros.map(r=>`<div class="row" style="gap:6px;align-items:center;margin-bottom:5px">
              <span style="flex:1;min-width:0;font-size:13px">${esc(r)}</span>
              <select onchange="if(this.value)reasignarCadete('${esc(r)}',this.value)" style="max-width:130px;padding:4px 7px;font-size:12.5px">
                <option value="">pasar a…</option>${CADETES.map(c=>`<option>${esc(c)}</option>`).join("")}
              </select></div>`).join("")}
          </div>`; })()}
        ${reponer?`<div style="margin-top:10px;padding-top:9px;border-top:.5px solid var(--border);font-size:13px">
          <span style="color:var(--amber);font-weight:600">⚠ ${reponer} producto${reponer===1?'':'s'} a reponer</span>
          <button class="btn sm ghost" style="margin-left:6px" onclick="OPVIEW='stock';vistaOperador()">Ver stock</button></div>`:''}
      </div>
    </div>
    <span class="label" style="margin-top:20px">Módulos</span>
    <div class="card" style="padding:4px 16px">
      <table class="tbl2">
        ${mods.map(([v,ic,n,s,b])=>`<tr onclick="OPVIEW='${v}';vistaOperador()" style="cursor:pointer">
          <td style="width:26px;color:var(--text-2)">${icon(ic)}</td>
          <td><b>${n}</b><div class="muted" style="font-size:12px">${s}</div></td>
          <td style="text-align:right">${b!=null?`<span class="badge-n">${b}</span>`:''}</td>
          <td style="text-align:right;width:14px;color:var(--text-3)">›</td></tr>`).join("")}
      </table>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn" onclick="formImportar()">${icon('upload')} Importar pedidos</button>
      <button class="btn ghost" onclick="formNuevo()">${icon('plus')} Pedido manual</button>
    </div>
    ${EMPLEADO?'':`
    <span class="label" style="margin-top:26px">Accesos del equipo</span>
    ${DB.modo==="firebase"?`
    <div class="card">
      <div class="hint" style="margin:0">Todos entran a la <b>misma dirección</b> y se identifican con su email y contraseña. Cada uno ve solo lo de su rol.</div>
      <button class="btn ghost block" style="margin-top:12px" onclick="copiarLinkApp()">Copiar link de la app</button>
      <div class="label" style="margin-top:18px">Previsualizar (solo vos)</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm ghost" onclick="verComo('operador')">Ver como Operador</button>
        <button class="btn sm ghost" onclick="verComo('cadete')">Ver como Reparto</button>
      </div>
      <div class="hint" style="margin-top:12px">Para crear o cambiar usuarios: consola de Firebase (o pedímelo y lo armamos).</div>
    </div>`:`
    <div class="card">
      <div class="row" style="justify-content:space-between;padding:4px 0"><span>Reparto <span class="muted">· ve y entrega sus repartos</span></span><button class="btn sm ghost" onclick="copiarAcceso('cadete')">Copiar link</button></div>
      <div class="row" style="justify-content:space-between;padding:10px 0 4px;border-top:.5px solid var(--border);margin-top:8px"><span>Operador <span class="muted">· solo prepara, sin precios ni stock</span></span><button class="btn sm ghost" onclick="copiarAcceso('operador')">Copiar link</button></div>
      <div class="row" style="justify-content:space-between;padding:10px 0 4px;border-top:.5px solid var(--border);margin-top:8px"><span>Vos / Admin <span class="muted">· acceso a todo</span></span><button class="btn sm ghost" onclick="copiarAcceso('admin')">Copiar link</button></div>
    </div>
    <div class="hint" style="margin-top:10px">Modo demo (sin login). Al activar Firebase, cada uno entra con su usuario.</div>`}`}`;
}
/* ¿el pedido es de HOY? (por fecha de creación) */
function esEnvioDeHoy(p){ const d=new Date(); d.setHours(0,0,0,0); const ini=d.getTime(); return (p.creado||0)>=ini && (p.creado||0)<ini+86400000; }
/* cartelito de estado de descuento de stock, para cada fila */
function badgeDescuento(p){
  if(p.stockBajado && p.noDescuenta) return '<span style="font-size:10.5px;font-weight:700;color:#0a84ff">🟡 Río Tercero (no toca stock)</span>';
  if(p.stockBajado) return '<span style="font-size:10.5px;font-weight:700;color:var(--green)">✓ descontó</span>';
  return '<span style="font-size:10.5px;font-weight:700;color:var(--amber)">⚠ sin descontar</span>';
}
function vistaOperador(){
  try{ pintarSidebar(); }catch(e){ logErr("auto",e); }
  if(OPVIEW==="hoy") return vistaHoy();
  if(OPVIEW==="prepararhoy") return vistaPrepararHoy();
  if(OPVIEW==="despachar") return vistaDespachar();
  if(OPVIEW==="control") return vistaControl();
  if(OPVIEW==="preparar" && PREP_ID) return pantallaPreparar(PREP_ID);
  if(OPVIEW==="listados") return vistaListados();
  if(OPVIEW==="cortecaja") return vistaCorteCaja();
  if(OPVIEW==="exportar") return vistaExportar();
  if(OPVIEW==="consolidado") return vistaConsolidado();
  if(OPVIEW==="panel") return vistaPanel();
  if(OPVIEW==="deposito") return vistaDeposito();
  if(OPVIEW==="ruta") return vistaRuta();
  if(OPVIEW==="preparacion") return vistaPreparacion();
  if(OPVIEW==="stock") return vistaStock();
  if(OPVIEW==="cupones") return vistaCupones();
  if(OPVIEW==="minimos") return vistaMinimos();
  if(OPVIEW==="informes") return vistaInformes();
  const ped=soloPedidos();
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const entregadosHoy=ped.filter(p=>(p.eventos||[]).some(e=>e.estado==="entregado"&&e.ts>=hoy.getTime())).length;
  const k={
    activos: ped.filter(p=>p.estado!=="confirmado").length,
    porPrep: ped.filter(p=>["pendiente","preparado"].includes(p.estado)).length,
    enRuta:  ped.filter(p=>["asignado","en_reparto","despachado","en_camino"].includes(p.estado)).length,
    hoy: entregadosHoy
  };
  const activosArr=ped.filter(p=>["pendiente","preparado","asignado","en_reparto","despachado","en_camino","entregado"].includes(p.estado));
  const grupos=[];
  EMPRESAS.forEach(e=>CANALES.forEach(c=>{
    const arr=activosArr.filter(p=>(p.empresa||"")===e.id && canalDe(p)===c.id);
    if(arr.length) grupos.push({empresa:e.nombre, canalId:c.id, canalNombre:c.nombre, n:arr.length, costo:c.costo, total:arr.length*c.costo});
  }));
  const costoTotal=grupos.reduce((s,g)=>s+g.total,0);
  const q=(PED_Q||"").toLowerCase().trim();
  const lista=ped.filter(p=>{
    if(q){   // buscador: cliente, N° de orden, o producto (texto de items o lista elegida)
      const prods=(p.prods||[]).map(x=>x.nombre).join(" ");
      const txt=[p.cliente,p.ref,numOrden(p),p.items,prods,p.dir,p.ciudad,p.tel].filter(Boolean).join(" ").toLowerCase();
      if(!txt.includes(q)) return false;
    }
    if(FILTRO==="archivados") return !!p.cerradoEn;                  // solo las cerradas
    if(p.cerradoEn) return false;                                     // archivadas: fuera de las demás vistas
    if(FILTRO==="hoy") return esEnvioDeHoy(p) && p.estado!=="anulado";  // los envíos del día
    if(FILTRO.startsWith("emp:")){                                    // filtro por marca: solo lo que falta despachar
      if((p.empresa||"")!==FILTRO.slice(4)) return false;
      return !["entregado","confirmado","anulado"].includes(p.estado);
    }
    if(FILTRO==="todos") return !["entregado","confirmado","anulado"].includes(p.estado);   // por defecto: sin entregados
    if(FILTRO==="activos") return !["confirmado","anulado"].includes(p.estado);
    if(FILTRO==="cadete") return p.metodo==="cadete" && !["entregado","confirmado","anulado"].includes(p.estado);
    if(FILTRO==="correo") return p.metodo==="correo" && !["entregado","confirmado","anulado"].includes(p.estado);
    return p.estado===FILTRO;
  });
  LISTA_OP=lista;
  app().innerHTML=`
    ${segOp('pedidos')}
    <div class="title">Panel de despacho</div>
    <div class="subtitle">${ped.length} pedidos · ${soloReabas().length} reabastecimientos</div>
    <div class="kpis">
      <div class="kpi accent">${icon('clock')}<div class="n">${k.activos}</div><div class="l">Activos</div></div>
      <div class="kpi">${icon('box')}<div class="n">${k.porPrep}</div><div class="l">Por preparar</div></div>
      <div class="kpi">${icon('route')}<div class="n">${k.enRuta}</div><div class="l">En ruta</div></div>
      <div class="kpi">${icon('check')}<div class="n">${k.hoy}</div><div class="l">Entregados hoy</div></div>
    </div>
    ${EMPLEADO?'':`<div class="card" style="margin-bottom:22px;padding:18px 20px">
      <div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span class="label" style="margin:0">A facturar · pedidos activos</span>
        <div style="font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${fmtAr(costoTotal)}</div>
      </div>
      ${grupos.map(g=>`
        <div class="row" style="justify-content:space-between;padding:10px 0 0;border-top:.5px solid var(--border);margin-top:8px">
          <span class="row" style="gap:8px"><span class="chip ${g.canalId==='ml_flex'?'flex':'tn'}">${g.canalNombre}</span>${esc(g.empresa)}</span>
          <span class="muted" style="font-variant-numeric:tabular-nums">${g.n} × ${fmtAr(g.costo)} = <b style="color:var(--text)">${fmtAr(g.total)}</b></span>
        </div>`).join("")}
    </div>`}
    <div class="row" style="margin-bottom:12px">
      <button class="btn" onclick="formImportar()">${icon('upload')} Importar pedidos</button>
      <button class="btn ghost" onclick="formNuevo()">${icon('plus')} Pedido manual</button>
      <button class="btn ghost" onclick="toggleAcc()">${ACC_OPEN?'▲ Menos':'⋯ Más acciones'}</button>
    </div>
    ${ACC_OPEN?`<div class="card" style="margin-bottom:16px;padding:14px 16px">
      <div class="label" style="margin:0 0 8px">🖨️ Imprimir</div>
      <div class="row" style="margin-bottom:14px">
        <button class="btn ghost sm" onclick="imprimirLote()">Etiquetas de envío</button>
        <button class="btn ghost sm" onclick="pickeoPend()">Etiquetas de pickeo</button>
        <button class="btn ghost sm" onclick="bajarEtiquetasDelDia()">🏷️ Bajar etiquetas del día (10×15)</button>
        <button class="btn ghost sm" onclick="hojaEnvios()">Hoja de envíos</button>
        <button class="btn ghost sm" onclick="imprimirComprobante()">Comprobante cadete</button>
      </div>
      <div class="label" style="margin:0 0 8px">📤 Exportar / Cardinal</div>
      <div class="row" style="margin-bottom:14px">
        <button class="btn ghost sm" onclick="exportarCSVMensajeria()">CSV mensajería (Cardinal)</button>
        <button class="btn ghost sm" onclick="enviarRepartoWA()">Enviar reparto a Cardinal</button>
        <button class="btn ghost sm" onclick="exportarTodo()">Exportar todo</button>
      </div>
      <div class="label" style="margin:0 0 8px">⚙️ Otros</div>
      <div class="row">
        <button class="btn ghost sm" onclick="pantallaCheckout()">✅ Checkout del día</button>
        <button class="btn ghost sm" onclick="imprimirChecklistDia()">🖨️ Checklist preparación (10×15)</button>
        ${(()=>{ const e=soloPedidos().filter(p=>p.estado==="entregado").length;
          return e?`<button class="btn sm" onclick="confirmarEntregados()">✓ Cerrar ${e} entregados</button>`:''; })()}
        ${(()=>{ const c=soloPedidos().filter(p=>p.estado==="confirmado"&&!p.cerradoEn).length;
          return c?`<button class="btn sm ghost" onclick="archivarConfirmadas()">📁 Archivar ${c} confirmados</button>`:''; })()}
        <button class="btn ghost sm" onclick="pantallaCierre()">🔒 Cierre de período</button>
        <button class="btn ghost sm" onclick="pantallaCobro()">Facturar</button>
        <button class="btn ghost sm" onclick="pantallaEntregas()">Resumen de entregas</button>
        <button class="btn ghost sm" onclick="recalcularRutas()">Recalcular rutas</button>
      </div>
    </div>`:''}
    <div class="filters">
      ${EMPRESAS.map(e=>`<button class="${FILTRO==='emp:'+e.id?'on':''}" style="font-weight:700" onclick="setFiltro('emp:${e.id}')">${esc(e.nombre.split(" ")[0])}</button>`).join("")}
      <span style="width:1px;background:var(--border);margin:0 2px"></span>
      ${["hoy","todos","cadete","correo","pendiente","preparado","entregado","confirmado","anulado","archivados"]
        .map(f=>`<button class="${FILTRO===f?'on':''}" onclick="setFiltro('${f}')">${({hoy:'📅 Hoy',todos:'Por despachar',cadete:'Cadete',correo:'Correo',anulado:'Anulados',archivados:'📁 Archivados'})[f]||estObj(f).label}</button>`).join("")}
    </div>
    ${(()=>{ const abiertas=ped.filter(p=>!p.cerradoEn && p.estado!=="anulado");
      const cierreTs=ultimoCierreTs();
      const porM=EMPRESAS.map(e=>{ const arr=abiertas.filter(p=>(p.empresa||"")===e.id);
        return {e, n:arr.length, $:arr.reduce((s,p)=>s+costoEnvio(p),0)}; }).filter(x=>x.n);
      if(!porM.length) return "";
      return `<div class="card" style="margin-bottom:10px;padding:10px 13px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="label" style="margin:0">Período abierto · por marca</span>
          <span class="muted" style="font-size:11.5px">${cierreTs?("desde "+new Date(cierreTs).toLocaleDateString("es-AR")):"sin cierres previos"}</span>
        </div>
        <table class="tbl2">
          ${porM.map(x=>`<tr onclick="setFiltro('emp:${x.e.id}')" style="cursor:pointer">
            <td><b>${esc(x.e.nombre)}</b></td>
            <td style="text-align:right;font-weight:700">${x.n}</td>
            <td style="text-align:right;color:var(--accent);font-size:12.5px">${fmtAr(x.$)}</td>
            <td style="text-align:right;width:14px;color:var(--text-3)">›</td></tr>`).join("")}
          <tr onclick="setFiltro('todos')" style="cursor:pointer">
            <td class="muted">Todas</td>
            <td style="text-align:right;font-weight:700">${porM.reduce((s,x)=>s+x.n,0)}</td>
            <td style="text-align:right;color:var(--accent);font-size:12.5px">${fmtAr(porM.reduce((s,x)=>s+x.$,0))}</td>
            <td style="text-align:right;color:var(--text-3)">›</td></tr>
        </table>
      </div>`; })()}
    <input id="pedQ" autocomplete="off" placeholder="🔍 Buscar por cliente, N° de orden o producto…" value="${esc(PED_Q||'')}" oninput="PED_Q=this.value;clearTimeout(window.__pq);window.__pq=setTimeout(vistaOperador,300)" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:11px;font:inherit;background:var(--bg);margin-bottom:10px">
    ${PED_Q?`<div class="row" style="margin-bottom:10px;align-items:center;gap:8px"><b>${lista.length}</b><span class="muted">resultado${lista.length===1?'':'s'} para "${esc(PED_Q)}"</span><button class="btn sm ghost" onclick="PED_Q='';vistaOperador()">Limpiar</button></div>`:''}
    <div class="row" style="margin-bottom:10px;justify-content:space-between;align-items:center">
      <div class="seg" style="flex:0 0 auto">
        <button class="${PED_VISTA==='lista'?'on':''}" ${PED_VISTA==='lista'?'':'onclick="setPedVista(\'lista\')"'}>Fichas</button>
        <button class="${PED_VISTA==='tabla'?'on':''}" ${PED_VISTA==='tabla'?'':'onclick="setPedVista(\'tabla\')"'}>Tabla</button>
        <button class="${PED_VISTA==='kanban'?'on':''}" ${PED_VISTA==='kanban'?'':'onclick="setPedVista(\'kanban\')"'}>Kanban</button>
      </div>
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
        <span class="muted" style="font-size:13px">${lista.length} pedido${lista.length===1?'':'s'}</span>
        <button class="btn sm ghost" onclick="imprimirTablaPedidos(LISTA_OP,'Pedidos')">${icon('printer')} Imprimir</button>
        ${zenBtn()}
      </div>
    </div>
    ${PED_VISTA==='kanban'
      ? kanbanPedidos(lista)
      : PED_VISTA==='tabla'
        ? tablaPedidos(lista)
        : `<div class="cardgrid">${listaPorFecha(lista)}</div>`}
    ${DB.modo==="demo"?`<div class="center" style="margin-top:24px">
      <span class="muted" style="font-size:13px">Modo demo · </span>
      <button class="btn sm ghost" onclick="resetDatos(false)">Recargar ejemplo (35)</button>
      <button class="btn sm ghost" onclick="resetDatos(true)">Empezar vacío</button>
    </div>`:""}`;
}
function setFiltro(f){ FILTRO=f; vistaOperador(); }
async function resetDatos(blank){
  if(!DB.reset) return;
  if(!await askConfirm(blank?"¿Vaciar todos los pedidos y empezar de cero?":"¿Recargar los 35 pedidos de ejemplo? Se borran los actuales.", blank?{yes:"Vaciar todo",danger:true}:{yes:"Recargar"})) return;
  FILTRO="todos"; OPVIEW="pedidos"; DB.reset(blank);
  toast(blank?"Listo, sin pedidos":"Datos de ejemplo recargados");
}

let EXP_PED={};
function toggleExp(id){ EXP_PED[id]=!EXP_PED[id]; vistaOperador(); }
let EXP_ACT={};
function toggleActs(id){ EXP_ACT[id]=!EXP_ACT[id]; vistaOperador(); }
let ACC_OPEN=false;
function toggleAcc(){ ACC_OPEN=!ACC_OPEN; vistaOperador(); }
function fmtFechaCorta(ts){ if(!ts) return ""; return new Date(ts).toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}); }
function fechaDia(ts){ if(!ts) return "Sin fecha"; const d=new Date(ts); d.setHours(0,0,0,0); const h=new Date(); h.setHours(0,0,0,0);
  const diff=Math.round((h-d)/86400000);
  if(diff===0) return "Hoy"; if(diff===1) return "Ayer";
  return d.toLocaleDateString("es-AR",{weekday:"short",day:"2-digit",month:"2-digit"}); }
let KAN_DRAG=null;
function kanbanPedidos(lista){
  const cols=[
    {k:"pendiente", t:"Por preparar", c:"var(--amber)"},
    {k:"preparado", t:"Preparado", c:"var(--accent)"},
    {k:["asignado","en_reparto","despachado","en_camino"], t:"En reparto", c:"#7f77dd"},
    {k:"entregado", t:"Entregado", c:"var(--green)"}
  ];
  const enCol=(p,k)=>Array.isArray(k)?k.includes(p.estado):p.estado===k;
  return `<div class="kanwrap" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;align-items:flex-start">
    ${cols.map(col=>{ const arr=lista.filter(p=>enCol(p,col.k)).sort((a,b)=>(b.creado||0)-(a.creado||0));
      const tot=arr.reduce((s,p)=>s+costoEnvio(p),0);
      const destino=Array.isArray(col.k)?col.k[0]:col.k;
      return `<div style="flex:0 0 250px;width:250px;background:var(--bg-3);border-radius:12px;padding:10px;align-self:stretch"
        ondragover="event.preventDefault();this.style.outline='2px dashed var(--accent)'"
        ondragleave="this.style.outline='none'"
        ondrop="this.style.outline='none';kanSoltar('${destino}')">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;padding:0 3px">
          <b style="font-size:13px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col.c};margin-right:6px"></span>${col.t}</b>
          <span class="muted" style="font-size:12px">${arr.length}</span>
        </div>
        ${arr.map(p=>{ const it=(()=>{ try{return itemsPedido(p);}catch(e){return[];} })();
          const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
          return `<div draggable="true" ondragstart="KAN_DRAG='${p.id}'" onclick="toggleExp('${p.id}')"
            style="background:var(--bg-2);border:.5px solid var(--border);border-radius:9px;padding:9px 10px;margin-bottom:7px;cursor:grab;box-shadow:var(--sh-sm)">
            <div style="font-weight:700;font-size:13px;line-height:1.2">${esc(p.cliente||'—')}</div>
            <div class="muted" style="font-size:11px;margin:2px 0 5px">N° ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa).split(" ")[0])}</div>
            <div style="font-size:11px;color:var(--text-2);line-height:1.3">${it.slice(0,3).map(x=>x.cant+"× "+esc(x.prodNombre)).join("<br>")||esc((p.items||"").slice(0,40))}${it.length>3?`<br><span style="opacity:.6">+${it.length-3} más</span>`:''}</div>
            <div class="row" style="justify-content:space-between;align-items:center;margin-top:6px">
              <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:var(--bg-3)">${esc(anilloDe(p).label)} · ${esc(quien)}</span>
              <b style="font-size:12px">${fmtAr(costoEnvio(p))}</b>
            </div>
          </div>`; }).join("")||`<div class="muted" style="font-size:12px;text-align:center;padding:16px 0">—</div>`}
        ${arr.length?`<div style="text-align:right;font-size:11px;color:var(--text-2);padding:4px 3px 0;border-top:.5px solid var(--border);margin-top:2px">${fmtAr(tot)}</div>`:''}
      </div>`; }).join("")}
  </div>
  <div class="hint" style="margin-top:8px">Arrastrá una tarjeta de una columna a otra para cambiarle el estado. Tocala para ver el detalle.</div>`;
}
async function kanSoltar(destino){
  const id=KAN_DRAG; KAN_DRAG=null; if(!id) return;
  const p=PEDIDOS.find(x=>x.id===id); if(!p || p.estado===destino) return;
  await avanzar(id, destino);
  toast("Movido a "+(estObj(destino).label||destino));
}
let PED_VISTA=(typeof localStorage!=="undefined"&&localStorage.getItem("ped_vista"))||"lista";
function setPedVista(v){ PED_VISTA=v; try{localStorage.setItem("ped_vista",v);}catch(e){ logErr("auto",e); } vistaOperador(); }
function tablaPedidos(lista){
  const ordEmp={}; EMPRESAS.forEach((e,i)=>ordEmp[e.id]=i);
  const rk=x=>(ordEmp[x]!=null?ordEmp[x]:99);
  const arr=lista.slice().sort((a,b)=>{ const oa=rk(a.empresa), ob=rk(b.empresa); return oa!==ob ? oa-ob : (b.creado||0)-(a.creado||0); });
  if(!arr.length) return empty('box','Sin pedidos en este filtro.');
  return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table class="tbl" style="table-layout:fixed;width:100%;min-width:0">
      <thead><tr>
        <th style="width:70px">Pedido</th><th style="width:15%">Cliente</th><th>Productos enviados (completo)</th><th style="width:130px">Zona</th><th style="width:140px">Reparto</th><th style="width:110px">Estado</th>
      </tr></thead>
      <tbody>
        ${(()=>{ let ult=null; return arr.map(p=>{ const e=estObj(p.estado), an=anilloDe(p);
          const quien=p.metodo==="correo"?"Correo":(p.cadete||"—");
          const n=numOrden(p);
          let hdr="";
          if(p.empresa!==ult){ ult=p.empresa; const cnt=arr.filter(x=>x.empresa===p.empresa).length;
            hdr=`<tr><td colspan="6" style="background:var(--bg-3);font-weight:800;text-transform:uppercase;letter-spacing:.03em;font-size:12.5px;padding:9px 12px">${esc(p.empresa?empresaObj(p.empresa).nombre:'Sin marca')} · ${cnt} env${cnt===1?'ío':'íos'}</td></tr>`; }
          return hdr+`<tr onclick="toggleExp('${p.id}')" style="cursor:pointer">
            <td class="muted" style="white-space:nowrap;font-size:11px">${p.creado?fmtFechaCorta(p.creado):'—'}<br><b style="color:var(--text);font-size:12.5px" title="${esc(n)}">${esc(n.length>11?("…"+n.slice(-8)):n)}</b></td>
            <td style="word-break:break-word">${esc(p.cliente||'—')}</td>
            <td style="white-space:normal;font-size:11.5px;color:var(--text-2);line-height:1.5">${(()=>{ let it=[]; try{ it=itemsPedido(p); }catch(e){ logErr("auto",e); }
              if(!it.length) return esc(p.items||"—");
              return it.map(x=>esc((x.cant||1)+"× "+x.prodNombre)).join("<br>");
            })()}</td>
            <td onclick="event.stopPropagation()"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${anilloColor(an.n)};margin-right:4px"></span>${selectZonaRapida(p)}</td>
            <td onclick="event.stopPropagation()">${selectReparto(p)}</td>
            <td><span class="badge"><span class="dot" style="background:${e.color}"></span>${e.label}</span>
              <div style="margin-top:4px">${badgeDescuento(p)}</div>
              ${!p.stockBajado&&p.estado!=='anulado'?`<button class="btn sm" style="margin-top:5px;padding:3px 9px;font-size:11px" onclick="event.stopPropagation();descontarAhora('${p.id}')">↻ Descontar</button>`:''}
            </td>
          </tr>
          ${EXP_PED[p.id]?`<tr><td colspan="6" style="background:var(--bg-2);padding:12px 14px">
            <div class="muted" style="font-size:12.5px">${esc(p.tel||'')} · ${esc(p.dir||'')} — ${esc(p.ciudad||'')}, ${esc(p.provincia||'')}</div>
            <div class="muted" style="font-size:12.5px;margin-top:2px">Envío: ${fmtAr(costoEnvio(p))} · Reparto: ${esc(quien)}</div>
            <div style="margin:6px 0;font-size:13px">${esc(p.items||'—')}</div>
            <div class="acts">
              ${selectReparto(p)}
              <button class="btn sm ghost" onclick="event.stopPropagation();cambiarRuta('${p.id}')">✏️ Editar</button>
              <button class="btn sm ghost" onclick="event.stopPropagation();descontarAhora('${p.id}')">↻ Descontar</button>
              ${p.stockBajado?`<button class="btn sm ghost" onclick="event.stopPropagation();deshacerDescuento('${p.id}')">↺ Deshacer</button>`:''}
              <button class="btn sm ghost" onclick="event.stopPropagation();imprimirPickeo('${p.id}')">Pickeo</button>
              <button class="btn sm green" onclick="event.stopPropagation();waCliente('${p.id}')">WhatsApp</button>
            </div>
          </td></tr>`:''}`; }).join(""); })()}
      </tbody>
    </table></div>`;
}
function listaPorFecha(lista){
  if(!lista.length) return empty('box','Sin pedidos en este filtro.');
  const prio={pendiente:1, preparado:2, asignado:3, en_reparto:3, despachado:3, en_camino:3, entregado:4, confirmado:5, anulado:9};
  const arr=lista.slice().sort((a,b)=>{
    const pa=prio[a.estado]||6, pb=prio[b.estado]||6;
    if(pa!==pb) return pa-pb;
    return (b.creado||0)-(a.creado||0);
  });
  const grupos={1:"📦 Para preparar",2:"✅ Preparados · listos para despachar",3:"🚚 En reparto",4:"📬 Entregados",5:"🔒 Confirmados",6:"Otros",9:"Anulados"};
  let html="", ult=null;
  arr.forEach(p=>{ const g=prio[p.estado]||6; if(g!==ult){ html+=`<div class="dia-h">${grupos[g]||""}</div>`; ult=g; } html+=cardOperador(p); });
  return html;
}
function accionPrincipal(p){   // el botón del paso siguiente, a la derecha de la fila
  if(p.estado==="pendiente") return `<button class="btn sm" onclick="event.stopPropagation();avanzar('${p.id}','preparado')">Preparar</button>`;
  if(p.metodo==="correo"&&p.estado==="preparado") return `<button class="btn sm" onclick="event.stopPropagation();despachar('${p.id}')">Despachar</button>`;
  if(["preparado","asignado","en_reparto","despachado","en_camino"].includes(p.estado)) return `<button class="btn sm green" onclick="event.stopPropagation();avanzar('${p.id}','entregado')">Entregar</button>`;
  return "";
}
async function deshacerDescuento(id){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id); if(!p){ toast("No encontré el pedido"); return; }
  if(!await askConfirm("¿Deshacer el descuento de esta orden?\n\n"+(p.cliente||"")+" · "+numOrden(p)+"\n\nVuelve el stock como estaba y se borran sus salidas. Después podés corregir y descontar de nuevo.",{yes:"Deshacer"})) return;
  await devolverStockPedido(id);
  await DB.update(id,{stockBajado:false});
  toast("Descuento deshecho ✓");
  render();
}
async function descontarAhora(id){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id); if(!p){ toast("No encontré el pedido"); return; }
  let items=[]; try{ items=itemsPedido(p); }catch(e){ logErr("auto",e); }
  if(!items.length){ toast("Este pedido no tiene productos reconocidos"); return; }
  const det=items.map(i=>"· "+i.cant+"x "+i.prodNombre).join("\n");
  const yaBajo=p.stockBajado?"\n\n⚠️ Este pedido YA se descontó antes. Si seguís, se descuenta de nuevo (queda doble).":"";
  if(!await askConfirm("Se va a descontar del stock:\n\n"+det+yaBajo)) return;
  await descontarStockPedido(id,null,true);
  toast("Descontado ✓");
  render();
}
function cardOperador(p){
  const e=estObj(p.estado), exp=!!EXP_PED[p.id];
  const dest=(p.ciudad||"")+(p.provincia?(", "+p.provincia):"");
  const an=anilloDe(p);
  const emp=p.empresa?empresaObj(p.empresa).nombre:"";
  const quien=p.metodo==="correo"?"Correo":(p.cadete||"sin asignar");
  const head=`<div class="ord-head" onclick="toggleExp('${p.id}')">
      <div style="min-width:0;flex:1">
        <div class="ord-name"><span class="ord-cli">${esc(p.cliente||'—')}</span>${p.esReenvio?' <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;background:#e0b00022;color:#b58600;vertical-align:1px">🔁 REENVÍO</span>':''}</div>
        <div class="ord-sub"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${anilloColor(an.n)};margin-right:5px;vertical-align:-1px"></span>N° ${esc(numOrden(p))}${emp?(' · '+esc(emp)):''}${p.creado?(' · '+fmtFechaCorta(p.creado)):''} · ${esc(quien)} · ${badgeDescuento(p)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex:0 0 auto">
        ${accionPrincipal(p)}
        <span class="badge"><span class="dot" style="background:${e.color}"></span>${e.label}</span>
        <span class="ord-chev">${exp?'▲':'▼'}</span>
      </div>
    </div>`;
  if(!exp) return `<div class="order compact">${head}</div>`;
  let acts="";
  if(["pendiente","preparado","asignado","en_reparto"].includes(p.estado)) acts+=selectReparto(p);
  acts+=`<button class="btn sm green" onclick="waCliente('${p.id}')">WhatsApp</button>`;
  acts+=`<button class="btn sm ghost" onclick="imprimirPickeo('${p.id}')">${icon('printer')} Pickeo</button>`;
  if(p.etiquetaPdf) acts+=`<button class="btn sm ghost" style="color:var(--accent)" onclick="bajarEtiqueta1015('${p.id}')">🏷️ Etiqueta 10×15 PDF</button>`;
  let mas="";
  mas+=`<button class="btn sm ghost" onclick="cambiarRuta('${p.id}')">Editar</button>`;
  mas+=`<button class="btn sm ghost" style="color:${p.stockBajado?'var(--amber)':'var(--accent)'}" onclick="descontarAhora('${p.id}')">↻ ${p.stockBajado?'Volver a descontar':'Descontar del stock'}</button>`;
  if(p.stockBajado) mas+=`<button class="btn sm ghost" onclick="deshacerDescuento('${p.id}')">↺ Deshacer descuento</button>`;
  mas+=`<button class="btn sm ghost" onclick="imprimirEtiqueta('${p.id}')">${icon('printer')} Etiqueta</button>`;
  if(p.etiquetaPdf) mas+=`<button class="btn sm ghost" onclick="imprimirEtiquetaML('${p.id}')">🖨️ Imprimir etiqueta</button>`;
  if(p.etiquetaPdf) mas+=`<button class="btn sm ghost" onclick='abrirEtiquetaPDF(PEDIDOS.find(x=>x.id==="${p.id}"))'>📄 PDF ML completo</button>`;
  if(p.tnId && !p.tnAvisado && ["preparado","asignado","en_reparto","despachado","en_camino","entregado","confirmado"].includes(p.estado))
    mas+=`<button class="btn sm ghost" onclick="marcarEnviadoTN('${p.id}')">🛍️ Avisar a Tienda Nube</button>`;
  mas+=`<button class="btn sm ghost" onclick="copiarLink('${p.id}')">Link</button>`;
  mas+=`<button class="btn sm ghost" style="color:${p.esReenvio?'var(--amber)':'inherit'}" onclick="marcarReenvio('${p.id}')">🔁 ${p.esReenvio?'Quitar reenvío':'Marcar reenvío'}</button>`;
  if(!saleSiempreBsAs(p.empresa)){ mas+=`<button class="btn sm ghost" style="color:${p.origen==='riotercero'?'var(--accent)':'inherit'}" onclick="cambiarOrigen('${p.id}')">📍 Sale de: ${p.origen==='riotercero'?'Río Tercero':'Bs As'}</button>`; }
  if(p.metodo==="correo"){
    if(p.etiquetaPdf) mas+=`<button class="btn sm ghost" style="color:var(--green)" onclick='abrirEtiquetaPDF(PEDIDOS.find(x=>x.id==="${p.id}"))'>📎 Etiqueta correo ✓</button>`;
    else mas+=`<label class="btn sm ghost" style="cursor:pointer">📎 Adjuntar PDF correo<input type="file" accept="application/pdf" style="display:none" onchange="adjuntarEtiquetaCorreo('${p.id}',this.files[0])"></label>`;
  }
  if(p.estado==="anulado") mas+=`<button class="btn sm ghost" onclick="reactivarPedido('${p.id}')">Reactivar</button>`;
  else if(p.estado!=="confirmado") mas+=`<button class="btn sm ghost" style="color:var(--red)" onclick="anularPedido('${p.id}')">Anular</button>`;
  if(ROL==='admin') mas+=`<button class="btn sm ghost" style="color:var(--red)" onclick="eliminarPedido('${p.id}')">🗑️ Eliminar</button>`;
  const exA=!!EXP_ACT[p.id];
  const ruta=(p.origen==="riotercero"?"Río Tercero":"Bs As")+" · "+(p.metodo==="correo"?("Correo"+(p.correo?(" "+esc(p.correo)):"")):"Cadete");
  return `<div class="order">${head}
    <div class="ord-body">
      <div class="who">${esc(p.tel||"—")}${p.ref?(' · '+esc(p.ref)):''}</div>
      <div class="addr">${esc(p.dir||'')} — ${esc(p.ciudad||'')}, ${esc(p.provincia||'')}</div>
      <div><span class="tag">Items</span> ${esc(p.items||"—")}</div>
      ${fotoPedidoHTML(p)}
      <div style="margin-top:6px"><span class="tag">Ruta</span> ${ruta}${p.cadete?(" · "+esc(p.cadete)):""}${p.tracking?(" · seg. "+esc(p.tracking)):""} · <b>${fmtAr(costoEnvio(p))}</b></div>
      <div class="acts">${acts}<button class="btn sm ghost" onclick="toggleActs('${p.id}')">${exA?'▲ Menos':'⋯ Más'}</button></div>
      ${exA?`<div class="acts" style="margin-top:7px;padding-top:9px;border-top:.5px solid var(--border)">${mas}</div>`:''}
    </div>
  </div>`;
}
function selectCadete(p){
  return `<select onchange="if(this.value)asignarCadete('${p.id}',this.value)" style="max-width:190px">
    <option value="">${p.cadete?('Cadete: '+esc(p.cadete)):'Asignar cadete…'}</option>
    ${CADETES.map(c=>`<option ${p.cadete===c?'selected':''}>${esc(c)}</option>`).join("")}</select>`;
}
/* Selector para asignar cada orden a Cardinal / Claudia / Correo (editable en cualquier momento) */
function selectReparto(p){
  const esCorreo=p.metodo==="correo";
  const actual=esCorreo?"Correo":(p.cadete||"sin asignar");
  return `<select onchange="if(this.value)asignarReparto('${p.id}',this.value)" style="max-width:210px">
    <option value="">Reparto: ${esc(actual)} ▾</option>
    ${CADETES.map(c=>`<option value="${esc(c)}" ${!esCorreo&&p.cadete===c?'selected':''}>🚴 ${esc(c)}</option>`).join("")}
    <option value="__correo" ${esCorreo?'selected':''}>📮 Correo (lo hacés vos)</option>
  </select>`;
}
/* Selector rápido de zona (para corregir sin abrir el formulario completo) */
function selectZonaRapida(p){
  const zf=(p.zonaFija!=null?String(p.zonaFija):"");
  return `<select onchange="asignarZonaFija('${p.id}',this.value)" style="max-width:150px;font-size:12.5px">
    <option value="" ${zf===""?'selected':''}>Auto (${esc(anilloDe(p).label)})</option>
    <option value="0" ${zf==="0"?'selected':''}>CABA</option>
    <option value="1" ${zf==="1"?'selected':''}>Zona 1</option>
    <option value="2" ${zf==="2"?'selected':''}>Zona 2</option>
    <option value="3" ${zf==="3"?'selected':''}>Zona 3</option>
    <option value="9" ${zf==="9"?'selected':''}>Correo/sucursal</option>
  </select>`;
}
async function asignarZonaFija(id,val){
  await DB.update(id,{zonaFija:val});
  toast("Zona actualizada");
  render();
}
async function asignarReparto(id,tipo){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id); if(!p) return;
  if(tipo==="__correo"){ await DB.update(id,{metodo:"correo",cadete:"",correo:p.correo||(p.canal==="ml_flex"?"Punto de Despacho":"Correo Argentino")}); toast("Asignado a Correo"); }
  else { await DB.update(id,{metodo:"cadete",cadete:tipo,correo:""}); toast("Asignado a "+tipo); }
  render();
}
function despachar(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  const correo=prompt("¿Por qué correo? ("+CORREOS.join(" / ")+")", p.correo||"Andreani");
  if(correo===null) return;
  const tracking=prompt("Número de seguimiento del correo (opcional):", p.tracking||"")||"";
  avanzar(id,"despachado","Despachado por "+correo,{correo,tracking});
}
function cambiarRuta(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  formNuevo(p); // reusa el formulario con los datos cargados (modo edición)
}

/* ---------- OPERADOR · Importar ---------- */
function formImportar(){
  IMP_FILAS=[]; IMP_SEL={}; IMP_REV={};   // arranco limpio: no arrastro pedidos sin confirmar de una importación anterior
  const empNombre=empresaObj(IMP_EMPRESA).nombre;
  app().innerHTML=`
    <button class="btn sm ghost" onclick="vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Importar pedidos</div>
    <div class="subtitle">Subí el archivo que exportaste de Tienda Nube (CSV o PDF). Yo me encargo del resto.</div>
    <div class="card">
      <span class="label">¿De qué empresa son?</span>
      <div class="seg" id="impEmp" style="margin-bottom:14px;flex-wrap:wrap">
        ${EMPRESAS.map(e=>`<button class="${e.id===IMP_EMPRESA?'on':''}" data-e="${e.id}" onclick="pickEmpresa(this)">${esc(e.nombre)}</button>`).join("")}
      </div>
      <span class="label">¿Por qué canal?</span>
      <div class="seg" id="impCanal" style="margin-bottom:18px">
        ${CANALES.map(c=>`<button class="${c.id===IMP_CANAL?'on':''}" data-c="${c.id}" onclick="pickCanal(this)">${esc(c.nombre)}</button>`).join("")}
      </div>
      ${IMP_CANAL==='tiendanube'?`
        <label class="label" style="display:block;margin-bottom:6px">Traer pedidos desde (fecha)</label>
        <input type="date" id="impDesde" value="${IMP_DESDE}" onchange="setImpDesde(this.value)" style="width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:11px;font:inherit;background:var(--bg);margin-bottom:10px">
        <button class="btn block" onclick="traerTiendaNube()">${icon('store')} Traer pedidos de Tienda Nube</button>
        <div class="hint" style="margin:8px 0 14px;text-align:center">Trae los pedidos pagados sin despachar, desde la fecha elegida. No trae los que ya importaste ni los que descartaste.</div>
        <div style="text-align:center;color:var(--text-3);font-size:13px;margin-bottom:14px">— o subí el archivo —</div>`:''}
      ${IMP_CANAL==='ml_flex'?`
        <label class="label" style="display:block;margin-bottom:6px">Traer pedidos desde (fecha)</label>
        <input type="date" id="impDesde" value="${IMP_DESDE}" onchange="setImpDesde(this.value)" style="width:100%;padding:11px 12px;border:1px solid var(--border);border-radius:11px;font:inherit;background:var(--bg);margin-bottom:10px">
        <button class="btn block" onclick="traerMercadoLibre()">${icon('store')} Traer pedidos de Mercado Libre</button>
        <div class="hint" style="margin:8px 0 10px;text-align:center">Trae los pedidos pagados sin marcar como enviados de la cuenta de ML de ${esc(empNombre)}, desde la fecha elegida.</div>
        <a class="btn ghost block sm" style="margin-bottom:14px" href="/api/ml-connect?empresa=${encodeURIComponent(IMP_EMPRESA)}" target="_blank">🔗 Conectar cuenta de Mercado Libre de ${esc(empNombre)} (una vez)</a>
        <div style="text-align:center;color:var(--text-3);font-size:13px;margin-bottom:14px">— o subí la etiqueta —</div>`:''}
      <label class="btn ${IMP_CANAL==='ml_flex'?'':'ghost'} block" style="cursor:pointer;margin-bottom:8px">🏷️ Subir etiqueta(s) de Mercado Libre
        <input type="file" accept="application/pdf" multiple style="display:none" onchange="leerEtiquetaML(this.files)"></label>
      <div class="hint" style="margin:0 0 14px;text-align:center">Crea el pedido y carga los productos por código de barras. Podés elegir varios archivos juntos (un PDF con varias órdenes, o varias etiquetas individuales), y te va a pedir que revises los productos de cada una antes de guardar.</div>
      ${IMP_CANAL==='ml_flex'?`<div style="text-align:center;color:var(--text-3);font-size:13px;margin-bottom:14px">— o subí un CSV —</div>`:''}
      <label id="dropZone" class="dropzone" for="impFile">
        <input type="file" id="impFile" accept=".csv,.pdf,text/csv,application/pdf" style="display:none" onchange="importarAuto(this.files&&this.files[0])">
        ${icon('upload')}
        <div class="dz-t">Tocá para elegir el archivo</div>
        <div class="dz-s">o arrastralo acá · CSV o PDF</div>
      </label>
      <div class="hint" style="margin-top:12px">La app agrupa por número de orden, separa lo que va por cadete (CABA) de lo que va por correo, y te muestra todo para revisar antes de guardar.</div>
      <details style="margin-top:16px">
        <summary class="muted" style="cursor:pointer;font-size:14px">¿No tenés archivo? Pegar el texto</summary>
        <div style="margin-top:10px">
          <textarea id="impTxt" style="min-height:140px" placeholder="Pegá desde Excel o el CSV (con la fila de encabezados arriba)"></textarea>
          <button class="btn block" style="margin-top:10px" onclick="procesarImport()">Previsualizar</button>
        </div>
      </details>
    </div>
    <div id="impPrev"></div>`;
  const dz=$("#dropZone");
  if(dz){
    ["dragover","dragenter"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("over");}));
    ["dragleave","dragend"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("over");}));
    dz.addEventListener("drop",e=>{ e.preventDefault(); dz.classList.remove("over");
      const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) importarAuto(f); });
  }
}
