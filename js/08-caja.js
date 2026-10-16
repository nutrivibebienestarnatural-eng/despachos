/* ============================================================
   08-caja — Cuenta corriente, caja, cobros y cierres de período
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
let CTA_DESDE="", CTA_HASTA="", CTA_TAB="cobrar", CTA_HIST_TODO=false;
/* Una orden entra en la cuenta si: no está archivada por un cierre, es posterior al último cierre, y cae en el rango de fechas elegido */
function enCuenta(p){ if(p.cerradoEn) return false; if((p.creado||0)<ultimoCierreTs()) return false; return enRango(p.creado,CTA_DESDE,CTA_HASTA); }
function setCtaTab(t){ CTA_TAB=t; pantallaCuenta(); }
let CTA_SEL={};
function ctaSelTodas(emp,v){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && !p.cobradoEn && (p.empresa||"—")===emp && enCuenta(p));
  peds.forEach(p=>CTA_SEL[p.id]=!!v); pantallaCuenta();
}
/* Cobra las órdenes tildadas: emite el recibo y las saca de la lista de pendientes */
async function cobrarSeleccion(emp){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && !p.cobradoEn && (p.empresa||"—")===emp
    && enCuenta(p) && CTA_SEL[p.id]);
  if(!peds.length){ toast("Elegí al menos una orden"); return; }
  const total=peds.reduce((s,p)=>s+costoEnvio(p),0);
  const quien=nombreEmp(emp);
  if(!await askConfirm("¿Registrar el cobro de "+fmtAr(total)+" a "+quien+"?\n\n"+peds.length+" órdenes.\nSe emite el recibo y salen de la lista de pendientes.")) return;
  const nro=nuevoNro("cobro");
  await cajaAgregar({nro, clase:"cobro", quien, monto:total, cant:peds.length,
    periodo:periodoTxt(), ts:Date.now(),
    ordenes:peds.map(p=>({ref:numOrden(p), cliente:p.cliente||"", monto:costoEnvio(p), fecha:p.creado||0}))});
  for(const p of peds){ try{ await DB.update(p.id,{cobradoEn:Date.now(), cobradoNro:nro}); }catch(e){ logErr("auto",e); } }
  peds.forEach(p=>delete CTA_SEL[p.id]);
  toast("Cobro "+nro+" registrado ✓");
  imprimirComprobanteCaja(nro);
  pantallaCuenta();
}
function cuentaTransportistas(peds){
  const zc=zonaCosto(); const esCad=c=>["caba","1","2","3"].includes(c);
  const g={};
  peds.forEach(p=>{ const c=catPedido(p);
    const quien = p.metodo==="correo" ? "Correo" : (p.cadete || "Sin asignar");
    const costo = (esCad(c) && cadeteCobra(quien)) ? costoCard(p,c,zc) : 0;      // lo que le pagás al que reparte
    if(!g[quien]) g[quien]={quien,n:0,costo:0,peds:[],zonas:{}};
    g[quien].n++; g[quien].costo+=costo; g[quien].peds.push({p,costo});
    const zl=anilloDe(p).label; g[quien].zonas[zl]=(g[quien].zonas[zl]||0)+1; });
  return Object.values(g).sort((a,b)=>b.costo-a.costo);
}
/* ---- LIBRO DE CAJA: cobros (a las marcas) y pagos (a los que reparten) ---- */
function cajaRecord(){ return PEDIDOS.find(p=>p.tipo==="caja"); }
function cajaMovs(){ const r=cajaRecord(); return ((r&&r.movs)||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
async function cajaAgregar(mov){
  const r=cajaRecord(); const arr=((r&&r.movs)||[]).concat([mov]);
  if(r) await DB.update(r.id,{movs:arr}); else await DB.create({tipo:"caja",movs:arr});
}
async function cajaBorrar(nro){
  const r=cajaRecord(); if(!r) return;
  await DB.update(r.id,{movs:((r.movs)||[]).filter(m=>m.nro!==nro)});
}
function nuevoNro(clase){
  const pref=clase==="cobro"?"C":"P";
  const n=cajaMovs().filter(m=>m.clase===clase).length+1;
  return pref+"-"+String(n).padStart(4,"0");
}
function periodoTxt(){
  if(CTA_DESDE||CTA_HASTA) return (CTA_DESDE||"…")+" al "+(CTA_HASTA||"…");
  const c=ultimoCierreTs();
  return c ? ("desde el cierre "+new Date(c).toLocaleDateString("es-AR")) : "Todo el período";
}
async function registrarMovCaja(clase,quien,monto,cant){
  const m=Math.round(+monto||0); if(!m){ toast("El importe es 0"); return; }
  const txt=clase==="cobro"?("¿Registrar el COBRO de "+fmtAr(m)+" a "+quien+"?"):("¿Registrar el PAGO de "+fmtAr(m)+" a "+quien+"?");
  if(!await askConfirm(txt+"\n\nPeríodo: "+periodoTxt()+"\nEnvíos: "+cant+"\n\nQueda guardado en el resumen de cuenta.")) return;
  const nro=nuevoNro(clase);
  await cajaAgregar({nro,clase,quien,monto:m,cant:+cant||0,periodo:periodoTxt(),ts:Date.now()});
  toast((clase==="cobro"?"Cobro":"Pago")+" "+nro+" registrado ✓");
  setCtaTab("historial");
}
function rangoSemana(off){   // off=0 esta semana, off=-1 la pasada. Lunes a domingo.
  const d=new Date(); d.setHours(0,0,0,0);
  const dow=(d.getDay()+6)%7;                     // 0=lunes
  const ini=new Date(d); ini.setDate(d.getDate()-dow+(off*7));
  const fin=new Date(ini); fin.setDate(ini.getDate()+6);
  const f=x=>x.toISOString().slice(0,10);
  return [f(ini),f(fin)];
}
function rangoMes(off){ const d=new Date(); const m=d.getMonth()+(+off||0); const f=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
  return [f(new Date(d.getFullYear(),m,1)), f(new Date(d.getFullYear(),m+1,0))]; }
function setRangoCta(k){
  const r = k==="sem"?rangoSemana(0) : k==="ant"?rangoSemana(-1) : k==="mes"?rangoMes() : k==="mesant"?rangoMes(-1) : ["",""];
  CTA_DESDE=r[0]; CTA_HASTA=r[1]; pantallaCuenta();
}
function setRangoSal(k){
  SAL_MIN=0;   // rango manual: ignora el corte del cierre
  const r = k==="sem"?rangoSemana(0) : k==="ant"?rangoSemana(-1) : k==="mes"?rangoMes() : k==="mesant"?rangoMes(-1) : ["",""];
  SAL_DESDE=r[0]; SAL_HASTA=r[1]; pantallaSalidas();
}
/* ---- CIERRE DE PERÍODO: congela el resumen de la semana y arranca el conteo de cero ---- */
function cierresRecord(){ return PEDIDOS.find(p=>p.tipo==="cierres"); }
function cierresLista(){ const r=cierresRecord(); return ((r&&r.lista)||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
function ultimoCierreTs(){ const l=cierresLista(); return l.length?l[0].ts:0; }
function fDia(ts){ return new Date(ts).toISOString().slice(0,10); }
function datosPeriodo(desdeTs){
  const st=stockState();
  const movs=(st.movs||[]).filter(m=>m.tipo==="salida" && (m.ts||0)>=desdeTs);
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && (p.creado||0)>=desdeTs);
  const zc=zonaCosto(), esCad=c=>["caba","1","2","3"].includes(c);
  const marcas={};
  peds.forEach(p=>{ const e=p.empresa||"—"; if(!marcas[e]) marcas[e]={emp:e,envios:0,cobrar:0,unid:0,prods:{}};
    marcas[e].envios++; marcas[e].cobrar+=costoEnvio(p); });
  movs.forEach(m=>{ const e=m.empresa||"—"; if(!marcas[e]) marcas[e]={emp:e,envios:0,cobrar:0,unid:0,prods:{}};
    marcas[e].unid+=m.cant; marcas[e].prods[m.prod]=(marcas[e].prods[m.prod]||0)+m.cant; });
  const rep={};
  peds.forEach(p=>{ const q=p.metodo==="correo"?"Correo":(p.cadete||"Sin asignar"); const c=catPedido(p);
    if(!rep[q]) rep[q]={quien:q,envios:0,pagar:0};
    rep[q].envios++; rep[q].pagar += (esCad(c)&&p.metodo!=="correo"&&cadeteCobra(q))?costoCard(p,c,zc):0; });
  const saldos={}; PRODUCTOS.forEach(pr=>{ const n=nivel(pr.nombre,st); if(n) saldos[pr.nombre]=n; });
  return {marcas:Object.values(marcas), rep:Object.values(rep), saldos, movs:movs.length, peds:peds.length};
}
/* Acta de cierre: documento formal del período, reimprimible desde el archivo */
function imprimirActaCierre(ts){
  const c=cierresLista().find(x=>x.ts===ts); if(!c){ toast("No encontré ese cierre"); return; }
  const w=window.open("","_blank","width=820,height=900"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const nMarca=e=>nombreEmp(e);
  const marcas=(c.marcas||[]).sort((a,b)=>b.cobrar-a.cobrar);
  const blqMarcas=marcas.map(m=>{
    const prods=Object.entries(m.prods||{}).sort((a,b)=>b[1]-a[1]);
    return `<div class="mk"><div class="mkh"><b>${esc(nMarca(m.emp))}</b><span>${fmtAr(m.cobrar)}</span></div>
      <div class="mut">${m.envios} envíos · ${m.unid} unidades retiradas</div>
      ${prods.length?`<table class="m"><tbody>${prods.map(([n,q])=>`<tr><td>${esc(n)}</td><td class="r">${q}</td></tr>`).join("")}</tbody></table>`:""}
    </div>`; }).join("");
  const blqRep=(c.rep||[]).map(r=>`<tr><td>${esc(r.quien)}</td><td class="r">${r.envios}</td><td class="r">${r.pagar?fmtAr(r.pagar):"—"}</td></tr>`).join("");
  const sal=Object.entries(c.saldos||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  const totU=sal.reduce((s,x)=>s+x[1],0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Acta de cierre ${esc(c.hasta||"")}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  .h{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px}
  h1{font-size:21px;margin:0 0 2px}.mut{color:#666}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #111}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1px solid #ccc;padding:5px}
  td{padding:5px;border-bottom:.5px solid #eee}.r{text-align:right}
  .kpi{display:flex;gap:10px;margin:12px 0}.kpi div{flex:1;border:1px solid #ddd;border-radius:7px;padding:9px 11px}
  .kpi b{display:block;font-size:17px}.kpi span{color:#666;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
  .mk{border:1px solid #ddd;border-radius:7px;padding:10px 12px;margin-bottom:9px;break-inside:avoid}
  .mkh{display:flex;justify-content:space-between;font-size:14px;margin-bottom:2px}
  .m{margin-top:7px}.m td{padding:3px 5px;font-size:11px}
  .firma{margin-top:44px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:5px;color:#666;font-size:11px}
  </style></head><body>
  <div class="h"><h1>Acta de cierre de período</h1>
    <div class="mut">Fullminet · ${esc(c.desde||"inicio")} al ${esc(c.hasta||"")} · Emitida ${new Date(c.ts).toLocaleDateString("es-AR")}</div></div>
  <div class="kpi">
    <div><b>${c.peds||0}</b><span>Órdenes</span></div>
    <div><b>${fmtAr(c.totalCobrar||0)}</b><span>A cobrar</span></div>
    <div><b>${fmtAr(c.totalPagar||0)}</b><span>A pagar</span></div>
    <div><b>${totU}</b><span>Unidades en stock</span></div>
  </div>
  <h2>Por marca · envíos y mercadería retirada</h2>
  ${blqMarcas||'<div class="mut">Sin movimientos.</div>'}
  <h2>Reparto</h2>
  <table><thead><tr><th>Quién</th><th class="r">Envíos</th><th class="r">A pagar</th></tr></thead><tbody>${blqRep||""}</tbody></table>
  ${(c.comprobantes&&c.comprobantes.length)?`<h2>Cobros y pagos del período</h2>
  <table><thead><tr><th>Comprobante</th><th>Concepto</th><th class="r">Importe</th></tr></thead><tbody>
  ${c.comprobantes.map(x=>`<tr><td>${esc(x.nro)}</td><td>${x.clase==="cobro"?"Cobro a":"Pago a"} ${esc(x.quien)}</td><td class="r">${fmtAr(x.monto)}</td></tr>`).join("")}
  </tbody></table>
  <div style="display:flex;justify-content:space-between;border-top:1.5px solid #111;padding-top:7px;margin-top:8px;font-weight:700">
    <span>Cobrado ${fmtAr(c.cobrado||0)}</span><span>Pagado ${fmtAr(c.pagado||0)}</span></div>`:""}
  <h2>Saldo de stock al cierre</h2>
  <table><thead><tr><th>Producto</th><th class="r">Unidades</th></tr></thead>
  <tbody>${sal.map(([n,q])=>`<tr><td>${esc(n)}</td><td class="r">${q}</td></tr>`).join("")}</tbody></table>
  <div style="display:flex;justify-content:space-between;border-top:1.5px solid #111;padding-top:7px;margin-top:8px;font-weight:700">
    <span>${sal.length} productos</span><span>${totU} unidades</span></div>
  <div class="firma"><div>Cerró · Fullminet</div><div>Conforme</div></div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
let FECHA_CORTE="";
async function cerrarDesdeFecha(){
  if(!FECHA_CORTE){ toast("Elegí primero la fecha de corte"); return; }
  const corte=new Date(FECHA_CORTE+"T00:00:00").getTime();
  const aCerrar=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)<corte);
  const quedan=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)>=corte);
  const fC=new Date(corte).toLocaleDateString("es-AR");
  if(!await askConfirm("Corte: "+fC+"\n\nQuedan A LA VISTA: "+quedan.length+" pedidos (desde "+fC+" en adelante).\nSe ARCHIVAN: "+aCerrar.length+" pedidos anteriores.\n\n¿Confirmás?")) return;
  const sello=corte; let ok=0;
  for(const p of aCerrar){ try{ await DB.update(p.id,{cerradoEn:sello, estado:(p.estado==="entregado"?"confirmado":p.estado)}); ok++; }catch(e){ logErr("auto",e); } }
  const r=cierresRecord();
  const lista=((r&&r.lista)||[]).concat([{ts:sello, fecha:fC, nota:"Corte manual "+fC}]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"cierres",lista});
  notify("✅ Listo.\n\nA la vista: "+quedan.length+" · Archivados: "+ok);
  OPVIEW="pedidos"; FILTRO="todos"; render();
}
async function cerrarAnterioresAEstaSemana(){
  // deja visible SOLO esta semana (lunes 00:00 a hoy); archiva todo lo anterior
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const dow=(hoy.getDay()+6)%7;                    // 0=lunes ... 6=domingo
  const lunes=hoy.getTime()-dow*86400000;          // lunes de esta semana a las 00:00
  const aCerrar=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)<lunes);
  const quedan=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)>=lunes);
  if(!aCerrar.length){ toast("No hay pedidos anteriores a esta semana para archivar"); return; }
  const fLunes=new Date(lunes).toLocaleDateString("es-AR");
  if(!await askConfirm("Voy a dejar A LA VISTA solo los pedidos de ESTA SEMANA (desde el lunes "+fLunes+"): "+quedan.length+" pedidos.\n\nY voy a ARCHIVAR "+aCerrar.length+" pedidos anteriores.\n\nNo se borran, quedan archivados y recuperables. ¿Confirmás?")) return;
  const sello=lunes;
  let ok=0;
  for(const p of aCerrar){ try{ await DB.update(p.id,{cerradoEn:sello, estado:(p.estado==="entregado"?"confirmado":p.estado)}); ok++; }catch(e){ logErr("auto",e); } }
  const r=cierresRecord();
  const nuevo={ts:sello, fecha:fLunes, nota:"Archivó anteriores a esta semana"};
  const lista=((r&&r.lista)||[]).concat([nuevo]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"cierres",lista});
  notify("✅ Listo.\n\nQuedaron A LA VISTA: "+quedan.length+" pedidos (esta semana).\nSe archivaron: "+ok+" pedidos anteriores.");
  OPVIEW="pedidos"; FILTRO="todos"; render();
}
async function cerrarHastaAnteayer(){
  // deja a cobrar SOLO ayer y hoy; cierra (archiva) todo lo anterior
  const hoy0=new Date(); hoy0.setHours(0,0,0,0);
  const ayer0=hoy0.getTime()-86400000;                 // ayer a las 00:00
  // pedidos a cerrar: los creados ANTES de ayer, que no estén ya cerrados ni anulados
  const aCerrar=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)<ayer0);
  const quedan=PEDIDOS.filter(p=>p.tipo==="pedido" && !p.cerradoEn && p.estado!=="anulado" && (p.creado||0)>=ayer0);
  if(!aCerrar.length){ toast("No hay pedidos anteriores a ayer para cerrar"); return; }
  const fAyer=new Date(ayer0).toLocaleDateString("es-AR");
  if(!await askConfirm("Voy a dejar A COBRAR solo los pedidos de AYER y HOY ("+quedan.length+" pedidos).\n\nY voy a CERRAR (archivar) "+aCerrar.length+" pedidos anteriores al "+fAyer+".\n\nLos cerrados no se borran, quedan archivados. ¿Confirmás?")) return;
  const sello=ayer0;   // el cierre queda marcado a las 00:00 de ayer
  let ok=0;
  for(const p of aCerrar){ try{ await DB.update(p.id,{cerradoEn:sello, estado:(p.estado==="entregado"?"confirmado":p.estado)}); ok++; }catch(e){ logErr("auto",e); } }
  // registro el cierre
  const r=cierresRecord();
  const nuevo={ts:sello, fecha:fAyer, nota:"Cierre hasta anteayer (dejó ayer y hoy)"};
  const lista=((r&&r.lista)||[]).concat([nuevo]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"cierres",lista});
  notify("✅ Listo.\n\nQuedaron A COBRAR: "+quedan.length+" pedidos (ayer y hoy).\nSe archivaron: "+ok+" pedidos anteriores.\n\nEntrá a la cuenta a cobrar y fijate que estén los de ayer y hoy.");
  OPVIEW="listados"; render();
}
async function recuperarTodo(){
  // trae de vuelta TODOS los pedidos archivados y borra TODOS los cierres → vuelve al punto cero
  const archivados=PEDIDOS.filter(p=>p.tipo==="pedido" && p.cerradoEn);
  if(!archivados.length){ toast("No hay pedidos archivados, ya está todo a la vista"); return; }
  if(!await askConfirm("Voy a traer de vuelta TODOS los pedidos archivados ("+archivados.length+") y borrar todos los cierres.\n\nAsí volvés a ver TODO junto, sin ningún cierre. Después decidís con calma.\n\n¿Dale?")) return;
  let ok=0;
  for(const p of archivados){ try{ await DB.update(p.id,{cerradoEn:null}); ok++; }catch(e){ logErr("auto",e); } }
  // borro todos los cierres
  const r=cierresRecord();
  if(r){ try{ await DB.update(r.id,{lista:[]}); }catch(e){ logErr("auto",e); } }
  notify("✅ Recuperé "+ok+" pedidos.\n\nAhora tenés TODO a la vista, sin cierres. Andá a Pedidos y fijate que estén todos.");
  OPVIEW="pedidos"; FILTRO="todos"; render();
}
async function revertirUltimoCierre(){
  const cierres=cierresLista();
  if(!cierres.length){ toast("No hay cierres para revertir"); return; }
  const ultimo=cierres[0];
  // busco todos los pedidos sellados con ESE cierre
  const sellados=PEDIDOS.filter(p=>p.tipo==="pedido" && p.cerradoEn===ultimo.ts);
  const fecha=new Date(ultimo.ts).toLocaleString("es-AR");
  if(!await askConfirm("¿Revertir el cierre del "+fecha+"?\n\nEsto devuelve "+sellados.length+" pedidos a la lista (les saca el sello de cierre) y borra ese cierre.\n\nTus pedidos NO se perdieron, solo estaban ocultos.")) return;
  let ok=0;
  for(const p of sellados){ try{ await DB.update(p.id,{cerradoEn:null}); ok++; }catch(e){ logErr("auto",e); } }
  // borro el registro del cierre
  const r=cierresRecord();
  if(r){ const lista=(r.lista||[]).filter(c=>c.ts!==ultimo.ts); await DB.update(r.id,{lista}); }
  notify("✅ Cierre revertido.\n\n"+ok+" pedidos volvieron a la lista.\nSi te faltan algunos, avisá que revisamos.");
  OPVIEW="pedidos"; FILTRO="todos"; render();
}
/* Muestra TODOS los pedidos archivados (cerrados), por si hay que recuperarlos */
function verArchivados(){
  FILTRO="archivados"; OPVIEW="pedidos"; render();
}
function pantallaCierre(){
  const desde=ultimoCierreTs();
  const d=datosPeriodo(desde);
  const ini=desde?new Date(desde).toLocaleDateString("es-AR"):"el inicio";
  const prev=cierresLista();
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Cierre de período</div>
    <div class="subtitle">Congela lo que pasó desde ${esc(ini)}, guarda el saldo de stock y arranca el conteo de cero. <b>El stock físico no se toca.</b></div>
    ${prev.length?`<div class="card" style="margin:12px 0;border:1px solid var(--amber);background:#fffbea">
      <b style="color:#b58600;font-size:13.5px">¿Cerraste sin querer y desaparecieron pedidos?</b>
      <div style="font-size:12.5px;color:#7a5a00;margin:6px 0 10px">Tus pedidos NO se borraron, solo se archivaron. Podés recuperarlos:</div>
      <div class="row" style="gap:8px">
        <button class="btn sm" style="flex:1;background:var(--amber);color:#3a2e00" onclick="revertirUltimoCierre()">↩️ Revertir último cierre</button>
        <button class="btn sm ghost" style="flex:1" onclick="verArchivados()">👁️ Ver archivados</button>
      </div>
    </div>`:''}
    <div class="kpis" style="margin:14px 0">
      <div class="kpi"><div class="n">${d.peds}</div><div class="l">Órdenes</div></div>
      <div class="kpi"><div class="n">${d.movs}</div><div class="l">Salidas</div></div>
      <div class="kpi"><div class="n" style="color:var(--green)">${fmtAr(d.marcas.reduce((s,x)=>s+x.cobrar,0))}</div><div class="l">A cobrar</div></div>
      <div class="kpi"><div class="n" style="color:#e5484d">${fmtAr(d.rep.reduce((s,x)=>s+x.pagar,0))}</div><div class="l">A pagar</div></div>
    </div>
    <div class="label">Qué se lleva cada marca</div>
    ${d.marcas.length?d.marcas.map(x=>`<div class="card" style="margin-bottom:8px;padding:12px 14px">
      <div class="row" style="justify-content:space-between"><b>${esc(nombreEmp(x.emp))}</b>
      <span style="color:var(--green);font-weight:700">${fmtAr(x.cobrar)}</span></div>
      <div class="muted" style="font-size:12.5px;margin-top:2px">${x.envios} envíos · ${x.unid} unidades retiradas</div>
      <div class="row" style="margin-top:8px"><button class="btn sm ghost" onclick="imprimirFacturaMarca('${esc(x.emp)}')">${icon('printer')} Estado de cuenta</button></div>
    </div>`).join(""):'<div class="hint">Sin movimientos en el período.</div>'}
    <div class="label" style="margin-top:16px">Reparto</div>
    ${d.rep.length?d.rep.map(x=>`<div class="card" style="margin-bottom:8px;padding:12px 14px">
      <div class="row" style="justify-content:space-between"><b>${esc(x.quien)}</b>
      <span style="color:${x.pagar?'#e5484d':'var(--text-2)'};font-weight:700">${x.pagar?fmtAr(x.pagar):'—'}</span></div>
      <div class="muted" style="font-size:12.5px;margin-top:2px">${x.envios} envíos</div>
    </div>`).join(""):''}
    <div class="card" style="margin-top:16px;border:1.5px solid var(--accent)">
      ${(()=>{ const ent=soloPedidos().filter(p=>p.estado==="entregado").length;
        return ent?`<div style="padding-bottom:12px;margin-bottom:12px;border-bottom:.5px solid var(--border)">
          <div style="font-weight:700">${ent} pedidos entregados sin cerrar</div>
          <div class="hint" style="margin:5px 0 10px">Siguen contando como activos y suman en "a facturar". Al cerrarlos pasan a confirmados y el panel arranca de cero.</div>
          <button class="btn ghost block" onclick="confirmarEntregados()">✓ Cerrar los ${ent} entregados</button>
        </div>`:''; })()}
      <div style="font-weight:700">Cerrar el período</div>
      <div class="hint" style="margin:6px 0 12px">Guardo este resumen y el saldo de stock (${Object.keys(d.saldos).length} productos). Desde mañana, "lo que salió" cuenta de cero. Podés seguir viendo los cierres viejos acá abajo.</div>
      <button class="btn block" onclick="ejecutarCierre()">🔒 Cerrar período ahora</button>
    </div>
    ${prev.length?`<div class="label" style="margin-top:18px">Cierres anteriores</div>
      ${prev.map(c=>`<div class="card" style="margin-bottom:8px;padding:12px 14px">
        <div class="row" style="justify-content:space-between"><b>${esc(c.hasta||fDia(c.ts))}</b>
        <span class="muted">${c.peds||0} órdenes · ${fmtAr(c.totalCobrar||0)}</span></div>
        <div class="muted" style="font-size:12.5px;margin-top:2px">Desde ${esc(c.desde||'el inicio')} · ${Object.keys(c.saldos||{}).length} productos en stock al cierre</div>
        <div class="row" style="margin-top:8px"><button class="btn sm ghost" onclick="imprimirActaCierre(${c.ts})">${icon('printer')} Acta de cierre</button></div>
      </div>`).join("")}`:''}`;
}
async function archivarConfirmadas(){
  const conf=soloPedidos().filter(p=>p.estado==="confirmado" && !p.cerradoEn);
  if(!conf.length){ toast("No hay confirmadas sin archivar"); return; }
  if(!await askConfirm("¿Archivar "+conf.length+" pedidos ya confirmados?\n\nDesaparecen de la lista y quedan en el filtro 📁 Archivados.\nNo se borra nada.")) return;
  const sello=ultimoCierreTs()||Date.now();
  toast("Archivando "+conf.length+"…");
  let ok=0; for(const p of conf){ try{ await DB.update(p.id,{cerradoEn:sello}); ok++; }catch(e){ logErr("auto",e); } }
  notify("✅ "+ok+" pedidos archivados.");
  render();
}
async function confirmarEntregados(){
  const ent=soloPedidos().filter(p=>p.estado==="entregado");
  if(!ent.length){ toast("No hay entregados sin cerrar"); return; }
  if(!await askConfirm("¿Cerrar "+ent.length+" pedidos entregados?\n\nPasan a CONFIRMADOS: salen de 'activos' y dejan de sumar en 'a facturar'.\nSiguen guardados y los podés ver con el filtro Confirmados.")) return;
  toast("Cerrando "+ent.length+" pedidos…");
  const sello=Date.now();
  let ok=0; for(const p of ent){ try{ await DB.update(p.id,{estado:"confirmado",cerradoEn:sello}); ok++; }catch(e){ logErr("auto",e); } }
  notify("✅ "+ok+" pedidos cerrados.\n\nEl panel ya arranca de cero.");
  render();
}
async function ejecutarCierre(){
  const desde=ultimoCierreTs();
  const d=datosPeriodo(desde);
  const entregados=soloPedidos().filter(p=>p.estado==="entregado");
  if(!await askConfirm("¿Cerrar el período?\n\n· Se guarda el resumen y el saldo de stock\n· "+entregados.length+" pedidos entregados pasan a CONFIRMADOS (salen de activos)\n· El stock físico NO se toca\n· 'Lo que salió' arranca de cero\n\nAntes de cerrar, imprimí los estados de cuenta.")) return;
  const cajaP=cajaMovs().filter(m=>(m.ts||0)>=desde);
  const c={ts:Date.now(), desde:desde?fDia(desde):"", hasta:fDia(Date.now()),
    peds:d.peds, movs:d.movs, saldos:d.saldos,
    cobrado:cajaP.filter(m=>m.clase==="cobro").reduce((s,m)=>s+m.monto,0),
    pagado:cajaP.filter(m=>m.clase==="pago").reduce((s,m)=>s+m.monto,0),
    comprobantes:cajaP.map(m=>({nro:m.nro,clase:m.clase,quien:m.quien,monto:m.monto})),
    totalCobrar:d.marcas.reduce((s,x)=>s+x.cobrar,0), totalPagar:d.rep.reduce((s,x)=>s+x.pagar,0),
    marcas:d.marcas.map(x=>({emp:x.emp,envios:x.envios,cobrar:x.cobrar,unid:x.unid,prods:x.prods})),
    rep:d.rep};
  const r=cierresRecord(); const lista=((r&&r.lista)||[]).concat([c]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"cierres",lista});
  if(entregados.length){                                  // cierro los entregados: dejan de ser activos
    toast("Cerrando "+entregados.length+" pedidos entregados…");
    for(const p of entregados){ try{ await DB.update(p.id,{estado:"confirmado",cerradoEn:c.ts}); }catch(e){ logErr("auto",e); } }
  }
  SAL_MIN=null; SAL_DESDE=""; SAL_HASTA="";
  notify("✅ PERÍODO CERRADO\n\n"+entregados.length+" pedidos confirmados.\nQuedó guardado el resumen y el saldo de stock.\nDesde ahora se cuenta de cero.");
  pantallaCierre();
}
