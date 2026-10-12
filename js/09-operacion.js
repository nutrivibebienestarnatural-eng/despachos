/* ============================================================
   09-operacion — Pantallas de operación: zonas, cuenta, salidas, cobro, checkout, entregas
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
function imprimirFacturaMarca(empId){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enCuenta(p) && (p.empresa||"—")===empId);
  if(!peds.length){ toast("No hay órdenes de esa marca en el período"); return; }
  const nom=nombreEmp(empId);
  const total=peds.reduce((s,p)=>s+costoEnvio(p),0);
  const problemas=[];
  peds.forEach(p=>{ let it=[]; try{ it=itemsPedido(p); }catch(e){ logErr("auto",e); }
    if(!it.length) problemas.push({p, q:"sin productos cargados"});
    const dest=[p.ciudad,p.provincia].filter(Boolean).join(", ").toLowerCase();
    if(anilloDe(p).label==="CABA" && dest && !/capital|caba|autonoma|ciudad de buenos|c\.a\.b\.a/.test(dest) && /buenos aires/.test(dest))
      problemas.push({p, q:"zona CABA pero destino dice Buenos Aires"});
  });
  const acc={}; let unid=0;
  peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>{ const k=it.prodNombre||it.nombre;
    acc[k]=(acc[k]||0)+(it.cant||0); unid+=(it.cant||0); }); }catch(e){ logErr("auto",e); } });
  const mercaderia=Object.entries(acc).sort((a,b)=>b[1]-a[1]);
  const w=window.open("","_blank","width=800,height=900"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const prodsDe=p=>{ try{ return itemsPedido(p).map(i=>i.cant+"× "+i.prodNombre).join("<br>"); }catch(e){ return esc(p.items||""); } };
  const filas=peds.sort((a,b)=>(a.creado||0)-(b.creado||0)).map((p,i)=>`<tr><td>${i+1}</td>
    <td>${p.creado?new Date(p.creado).toLocaleDateString("es-AR"):""}</td><td>${esc(numOrden(p))}</td>
    <td>${esc(p.cliente||"")}</td><td>${esc([p.ciudad,p.provincia].filter(Boolean).join(", "))}</td>
    <td>${esc(anilloDe(p).label)}</td><td class="pr">${prodsDe(p)}</td>
    <td class="r">${fmtAr(costoEnvio(p))}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Detalle ${esc(nom)}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1.5px solid #111;padding:6px 5px}
  td{padding:6px 5px;border-bottom:.5px solid #ddd}.r{text-align:right}
  .tot{margin-top:16px;display:flex;justify-content:space-between;border-top:2px solid #111;padding-top:10px;font-size:16px;font-weight:700}
  .pr{font-size:10.5px;line-height:1.4;color:#333;max-width:210px}
  h2{font-size:14px;margin:26px 0 0;padding-top:14px;border-top:1px solid #111}
  .m{margin-top:6px}.m td{padding:4px 5px}
  .tot2{margin-top:8px;display:flex;justify-content:space-between;border-top:1.5px solid #111;padding-top:7px;font-size:13px;font-weight:700}
  .firma{margin-top:40px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:5px;color:#666;font-size:11px}
  </style></head><body>
  <h1>Detalle de envíos · ${esc(nom)}</h1>
  <div class="sub">${esc(periodoTxt())} · Emitido ${new Date().toLocaleDateString("es-AR")} · Fullminet</div>
  <table><thead><tr><th>#</th><th>Fecha</th><th>Orden</th><th>Cliente</th><th>Destino</th><th>Zona</th><th>Productos enviados</th><th class="r">Envío</th></tr></thead>
  <tbody>${filas}</tbody></table>
  <div class="tot"><span>${peds.length} envíos</span><span>TOTAL A COBRAR ${fmtAr(total)}</span></div>
  ${problemas.length?`<div style="margin-top:14px;padding:10px 12px;border:1.5px solid #d4820a;border-radius:8px;background:#fdf6ec">
    <b style="color:#a5620a">⚠ ${problemas.length} ${problemas.length===1?"orden para revisar":"órdenes para revisar"} antes de facturar:</b>
    <ul style="margin:6px 0 0;padding-left:20px;font-size:11px">
      ${problemas.map(x=>`<li>${esc(numOrden(x.p))} · ${esc(x.p.cliente||"")} — ${esc(x.q)}</li>`).join("")}
    </ul></div>`:""}
  <h2>Mercadería retirada en el período</h2>
  <table class="m"><thead><tr><th>Producto</th><th class="r">Unidades</th></tr></thead>
  <tbody>${mercaderia.map(([n,c])=>`<tr><td>${esc(n)}</td><td class="r">${c}</td></tr>`).join("")}</tbody></table>
  <div class="tot2"><span>${mercaderia.length} productos</span><span>${unid} unidades</span></div>
  <div class="firma"><div>Por Fullminet</div><div>Conforme · ${esc(nom)}</div></div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function imprimirComprobanteCaja(nro){
  const m=cajaMovs().find(x=>x.nro===nro); if(!m){ toast("No encontré el comprobante"); return; }
  const w=window.open("","_blank","width=800,height=800"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const esCobro=m.clase==="cobro";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.nro)}</title>
  <style>@page{size:A4;margin:16mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:13px}
  .h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px}
  h1{font-size:22px;margin:0}.mut{color:#666}
  .n{font-size:15px;font-weight:700}
  .b{margin:26px 0;padding:18px;border:1px solid #ddd;border-radius:8px}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:.5px solid #eee}
  .tot{margin-top:18px;display:flex;justify-content:space-between;font-size:20px;font-weight:700;border-top:2px solid #111;padding-top:12px}
  .firma{margin-top:60px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:5px;color:#666;font-size:11px}
  </style></head><body>
  <div class="h"><div><h1>${esCobro?"Recibo de cobro":"Comprobante de pago"}</h1>
    <div class="mut">Fullminet · logística y despacho</div></div>
    <div style="text-align:right"><div class="n">${esc(m.nro)}</div><div class="mut">${new Date(m.ts).toLocaleDateString("es-AR")}</div></div></div>
  <div class="b">
    <div class="row"><span class="mut">${esCobro?"Cobrado a":"Pagado a"}</span><b>${esc(m.quien)}</b></div>
    <div class="row"><span class="mut">Período</span><span>${esc(m.periodo||"—")}</span></div>
    <div class="row"><span class="mut">Envíos</span><span>${m.cant||0}</span></div>
    <div class="tot"><span>TOTAL</span><span>${fmtAr(m.monto)}</span></div>
  </div>
  ${(m.ordenes&&m.ordenes.length)?`<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;margin:22px 0 6px">Órdenes incluidas</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr><th style="text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1px solid #111;padding:5px">Orden</th>
    <th style="text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1px solid #111;padding:5px">Cliente</th>
    <th style="text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1px solid #111;padding:5px">Fecha</th>
    <th style="text-align:right;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1px solid #111;padding:5px">Importe</th></tr></thead>
    <tbody>${m.ordenes.map(o=>`<tr><td style="padding:4px 5px;border-bottom:.5px solid #eee">${esc(o.ref||"")}</td>
      <td style="padding:4px 5px;border-bottom:.5px solid #eee">${esc(o.cliente||"")}</td>
      <td style="padding:4px 5px;border-bottom:.5px solid #eee">${o.fecha?new Date(o.fecha).toLocaleDateString("es-AR"):""}</td>
      <td style="padding:4px 5px;border-bottom:.5px solid #eee;text-align:right">${fmtAr(o.monto||0)}</td></tr>`).join("")}</tbody>
  </table>`:""}
  <div class="firma"><div>Por Fullminet</div><div>Recibí conforme · ${esc(m.quien)}</div></div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function imprimirRecibo(quien){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enCuenta(p));
  const tr=cuentaTransportistas(peds).find(x=>x.quien===quien);
  if(!tr||!tr.peds.length){ toast("No hay envíos de "+quien+" en el período"); return; }
  const per=(CTA_DESDE||CTA_HASTA)?((CTA_DESDE||"…")+" al "+(CTA_HASTA||"…")):"Todo el período";
  const w=window.open("","_blank","width=800,height=900");
  if(!w){ toast("Permití las ventanas emergentes"); return; }
  const filas=tr.peds.map((o,i)=>`<tr><td>${i+1}</td><td>${o.p.creado?new Date(o.p.creado).toLocaleDateString("es-AR"):""}</td>
    <td>${esc(numOrden(o.p))}</td><td>${esc(o.p.cliente||"")}</td>
    <td>${esc([o.p.ciudad,o.p.provincia].filter(Boolean).join(", "))}</td>
    <td>${esc(anilloDe(o.p).label)}</td><td class="r">${o.costo?fmtAr(o.costo):"—"}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resumen ${esc(quien)}</title>
  <style>@page{size:A4;margin:14mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1.5px solid #111;padding:6px 5px}
  td{padding:6px 5px;border-bottom:.5px solid #ddd}.r{text-align:right}
  .tot{margin-top:16px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #111;padding-top:10px;font-size:16px;font-weight:700}
  .firma{margin-top:44px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:5px;color:#666;font-size:11px}
  </style></head><body>
  <h1>Resumen de envíos · ${esc(quien)}</h1>
  <div class="sub">${esc(per)} · Emitido ${new Date().toLocaleDateString("es-AR")} · Fullminet</div>
  <table><thead><tr><th>#</th><th>Fecha</th><th>Orden</th><th>Cliente</th><th>Destino</th><th>Zona</th><th class="r">Importe</th></tr></thead>
  <tbody>${filas}</tbody></table>
  <div class="tot"><span>${tr.n} envíos</span><span>TOTAL ${fmtAr(tr.costo)}</span></div>
  <div class="firma"><div>Entregué conforme</div><div>Recibí conforme · ${esc(quien)}</div></div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function pantallaZonas(){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enCuenta(p));
  const zc=zonaCosto();
  const orden=[["caba","CABA",0],["1","Zona 1",1],["2","Zona 2",2],["3","Zona 3",3],["correo","Correo",9],["pickit","Pickit",9]];
  const g={}; orden.forEach(([k,l])=>g[k]={k,label:l,n:0,cobro:0,costo:0});
  peds.forEach(p=>{ const c=catPedido(p); if(!g[c]) return;
    g[c].n++; g[c].cobro+=costoEnvio(p);
    g[c].costo += ["caba","1","2","3"].includes(c) ? costoCard(p,c,zc) : 0; });
  const filas=orden.map(([k])=>g[k]).filter(x=>x.n>0);
  const tN=filas.reduce((s,x)=>s+x.n,0), tCob=filas.reduce((s,x)=>s+x.cobro,0), tCos=filas.reduce((s,x)=>s+x.costo,0);
  const maxN=Math.max(1,...filas.map(x=>x.n));
  const cierreTs=ultimoCierreTs();
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Envíos por zona</div>
    <div class="subtitle">Cuánto cobrás y cuánto te cuesta el reparto, por zona.${cierreTs?` Desde el cierre del ${new Date(cierreTs).toLocaleDateString("es-AR")}.`:""}</div>
    <div class="card" style="margin-bottom:16px">
      <span class="label">Tarifa al cliente · precio por envío</span>
      <table class="tbl2">
        ${[["caba","CABA",0],["1","Zona 1",1],["2","Zona 2",2],["3","Zona 3",3],["correo","Correo (interior)",9]].map(([k,l,cn])=>
          `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${anilloColor(cn)};margin-right:7px"></span>${esc(l)}</td>
           <td style="text-align:right;font-weight:800;font-size:15px">${fmtAr(precioCat(k))}</td></tr>`).join("")}
      </table>
    </div>
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="n">${tN}</div><div class="l">Envíos</div></div>
      <div class="kpi"><div class="n" style="color:var(--green)">${fmtAr(tCob)}</div><div class="l">A cobrar</div></div>
      <div class="kpi"><div class="n" style="color:#e5484d">${fmtAr(tCos)}</div><div class="l">Costo reparto</div></div>
      <div class="kpi"><div class="n" style="color:var(--accent)">${fmtAr(tCob-tCos)}</div><div class="l">Te queda</div></div>
    </div>
    <div class="card">
      <table class="tbl2">
        <tr style="color:var(--text-2)"><td style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Zona</td>
          <td style="text-align:right;font-size:11px;text-transform:uppercase">Envíos</td>
          <td style="text-align:right;font-size:11px;text-transform:uppercase">Cobrás</td>
          <td style="text-align:right;font-size:11px;text-transform:uppercase">Costo</td>
          <td style="text-align:right;font-size:11px;text-transform:uppercase">Queda</td></tr>
        ${filas.map(x=>`<tr>
          <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${anilloColor(orden.find(o=>o[0]===x.k)[2])};margin-right:7px"></span>${esc(x.label)}
            <div style="height:4px;background:var(--accent);border-radius:2px;margin-top:4px;width:${Math.round(x.n/maxN*100)}%;max-width:180px;opacity:.5"></div></td>
          <td style="text-align:right;font-weight:700">${x.n}</td>
          <td style="text-align:right;color:var(--green)">${fmtAr(x.cobro)}</td>
          <td style="text-align:right;color:#e5484d">${x.costo?fmtAr(x.costo):'—'}</td>
          <td style="text-align:right;font-weight:700">${fmtAr(x.cobro-x.costo)}</td></tr>`).join("")}
        <tr style="border-top:1.5px solid var(--border)"><td><b>Total</b></td>
          <td style="text-align:right;font-weight:800">${tN}</td>
          <td style="text-align:right;font-weight:800;color:var(--green)">${fmtAr(tCob)}</td>
          <td style="text-align:right;font-weight:800;color:#e5484d">${fmtAr(tCos)}</td>
          <td style="text-align:right;font-weight:800;color:var(--accent)">${fmtAr(tCob-tCos)}</td></tr>
      </table>
    </div>
    <button class="btn ghost block" style="margin-top:12px" onclick="imprimirZonas()">${icon('printer')} Imprimir resumen por zona</button>`;
}
function imprimirZonas(){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enCuenta(p));
  const zc=zonaCosto();
  const orden=[["caba","CABA"],["1","Zona 1"],["2","Zona 2"],["3","Zona 3"],["correo","Correo"],["pickit","Pickit"]];
  const g={}; orden.forEach(([k,l])=>g[k]={label:l,n:0,cobro:0,costo:0});
  peds.forEach(p=>{ const c=catPedido(p); if(!g[c]) return; g[c].n++; g[c].cobro+=costoEnvio(p); g[c].costo+=["caba","1","2","3"].includes(c)?costoCard(p,c,zc):0; });
  const filas=orden.map(([k])=>g[k]).filter(x=>x.n>0);
  const tN=filas.reduce((s,x)=>s+x.n,0), tCob=filas.reduce((s,x)=>s+x.cobro,0), tCos=filas.reduce((s,x)=>s+x.costo,0);
  const w=window.open("","_blank","width=760,height=800"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Envíos por zona</title>
  <style>@page{size:A4;margin:16mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:13px}
  h1{font-size:21px;margin:0 0 2px}.sub{color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;font-size:11px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:7px 6px}
  td{padding:7px 6px;border-bottom:.5px solid #ddd}.r{text-align:right}tfoot td{border-top:2px solid #111;font-weight:700;font-size:15px}
  </style></head><body>
  <h1>Envíos por zona</h1><div class="sub">Fullminet · ${periodoTxt()} · emitido ${new Date().toLocaleDateString("es-AR")}</div>
  <table><thead><tr><th>Zona</th><th class="r">Envíos</th><th class="r">Cobrás</th><th class="r">Costo</th><th class="r">Te queda</th></tr></thead>
  <tbody>${filas.map(x=>`<tr><td>${esc(x.label)}</td><td class="r">${x.n}</td><td class="r">${fmtAr(x.cobro)}</td><td class="r">${x.costo?fmtAr(x.costo):"—"}</td><td class="r">${fmtAr(x.cobro-x.costo)}</td></tr>`).join("")}</tbody>
  <tfoot><tr><td>Total</td><td class="r">${tN}</td><td class="r">${fmtAr(tCob)}</td><td class="r">${fmtAr(tCos)}</td><td class="r">${fmtAr(tCob-tCos)}</td></tr></tfoot>
  </table>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function pantallaCuenta(){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enCuenta(p));
  const zc=zonaCosto(); const esCad=c=>["caba","1","2","3"].includes(c);
  const g={};
  peds.filter(p=>!p.cobradoEn).forEach(p=>{ const e=p.empresa||"—"; if(!g[e]) g[e]={emp:e,n:0,cobrar:0,costo:0,peds:[]};
    const c=catPedido(p), cob=costoEnvio(p), cos=esCad(c)?costoCard(p,c,zc):0;
    g[e].n++; g[e].cobrar+=cob; g[e].costo+=cos; g[e].peds.push({p,cob,cos}); });
  const grupos=Object.values(g).sort((a,b)=>b.cobrar-a.cobrar);
  const totC=grupos.reduce((s,x)=>s+x.cobrar,0), totK=grupos.reduce((s,x)=>s+x.costo,0);
  const inpC="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='listados';vistaOperador()">← Volver a Listados</button>
    <div class="title" style="margin-top:14px">Cuenta · órdenes a cobrar</div>
    <div class="subtitle">Lo que le facturás a cada marca por los envíos, y lo que te cuesta a vos.</div>
    <div class="card" style="margin:14px 0">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input type="date" value="${CTA_DESDE}" onchange="CTA_DESDE=this.value;pantallaCuenta()" style="${inpC}"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input type="date" value="${CTA_HASTA}" onchange="CTA_HASTA=this.value;pantallaCuenta()" style="${inpC}"></div>
      </div>
      ${(()=>{ const c=ultimoCierreTs(); return c?`<div class="hint" style="margin-top:8px">Mostrando el <b>período abierto</b>: desde el cierre del ${new Date(c).toLocaleDateString("es-AR")}. Lo ya cerrado no aparece.</div>`:`<div class="hint" style="margin-top:8px">Todavía no hiciste ningún cierre: se muestra todo.</div>`; })()}
      <div class="row" style="margin-top:10px">
        <button class="btn sm ghost" onclick="setRangoCta('sem')">Esta semana</button>
        <button class="btn sm ghost" onclick="setRangoCta('ant')">Semana pasada</button>
        <button class="btn sm ghost" onclick="setRangoCta('mes')">Este mes</button>
        <button class="btn sm ghost" onclick="setRangoCta('todo')">Todo</button>
      </div>
    </div>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="n">${peds.length}</div><div class="l">Órdenes</div></div>
      <div class="kpi"><div class="n" style="color:var(--green)">${fmtAr(totC)}</div><div class="l">A cobrar</div></div>
      <div class="kpi"><div class="n" style="color:#e5484d">${fmtAr(totK)}</div><div class="l">Costo reparto</div></div>
      <div class="kpi"><div class="n" style="color:var(--accent)">${fmtAr(totC-totK)}</div><div class="l">Te queda</div></div>
    </div>
    <div class="row" style="margin-bottom:14px"><div class="seg">
      <button class="${CTA_TAB==='cobrar'?'on':''}" ${CTA_TAB==='cobrar'?'':'onclick="setCtaTab(\'cobrar\')"'}>💵 A cobrar (marcas)</button>
      <button class="${CTA_TAB==='pagar'?'on':''}" ${CTA_TAB==='pagar'?'':'onclick="setCtaTab(\'pagar\')"'}>🚚 A pagar (reparto)</button>
      <button class="${CTA_TAB==='historial'?'on':''}" ${CTA_TAB==='historial'?'':'onclick="setCtaTab(\'historial\')"'}>📒 Resumen de cuenta</button>
    </div></div>
    ${CTA_TAB==='historial'?(()=>{ const corte=CTA_HIST_TODO?0:ultimoCierreTs();
      const mv=cajaMovs().filter(m=>(m.ts||0)>=corte);
      const desdeTxt=corte?("desde el cierre del "+new Date(corte).toLocaleDateString("es-AR")):"todo el historial";
      const cob=mv.filter(m=>m.clase==="cobro").reduce((s,m)=>s+m.monto,0);
      const pag=mv.filter(m=>m.clase==="pago").reduce((s,m)=>s+m.monto,0);
      const porQuien={}; mv.forEach(m=>{ const k=m.quien; if(!porQuien[k]) porQuien[k]={quien:k,cobro:0,pago:0};
        porQuien[k][m.clase==="cobro"?"cobro":"pago"]+=m.monto; });
      return `<div class="row" style="margin-bottom:12px;align-items:center;gap:8px">
        <span class="muted" style="font-size:13px">Mostrando ${esc(desdeTxt)}</span>
        <button class="btn sm ghost" onclick="CTA_HIST_TODO=${CTA_HIST_TODO?'false':'true'};pantallaCuenta()">${CTA_HIST_TODO?'Ver solo el período actual':'Ver todo el historial'}</button>
      </div>
      <div class="kpis" style="margin-bottom:14px">
        <div class="kpi"><div class="n" style="color:var(--green)">${fmtAr(cob)}</div><div class="l">Cobrado</div></div>
        <div class="kpi"><div class="n" style="color:#e5484d">${fmtAr(pag)}</div><div class="l">Pagado</div></div>
        <div class="kpi"><div class="n" style="color:var(--accent)">${fmtAr(cob-pag)}</div><div class="l">Diferencia</div></div>
        <div class="kpi"><div class="n">${mv.length}</div><div class="l">Comprobantes</div></div>
      </div>
      ${Object.keys(porQuien).length?`<div class="card" style="margin-bottom:14px"><span class="label">Por cada uno</span>
        ${Object.values(porQuien).map(x=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)">
          <b>${esc(x.quien)}</b>
          <span style="font-size:13px">${x.cobro?`<span style="color:var(--green)">cobrado ${fmtAr(x.cobro)}</span>`:''}${x.cobro&&x.pago?' · ':''}${x.pago?`<span style="color:#e5484d">pagado ${fmtAr(x.pago)}</span>`:''}</span>
        </div>`).join("")}</div>`:''}
      <div class="label">Comprobantes guardados</div>
      ${mv.length?mv.map(m=>`<div class="card" style="margin-bottom:8px;padding:12px 14px">
        <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px">
          <span><b>${esc(m.nro)}</b> <span class="muted">· ${m.clase==="cobro"?"Cobro a":"Pago a"} ${esc(m.quien)}</span></span>
          <b style="color:${m.clase==="cobro"?'var(--green)':'#e5484d'}">${fmtAr(m.monto)}</b>
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:2px">${new Date(m.ts).toLocaleDateString("es-AR")} · ${esc(m.periodo||'')} · ${m.cant||0} envíos</div>
        <div class="row" style="margin-top:8px">
          <button class="btn sm ghost" onclick="imprimirComprobanteCaja('${esc(m.nro)}')">${icon('printer')} Imprimir</button>
          <button class="btn sm ghost" style="color:var(--red)" onclick="askConfirm('¿Borrar el comprobante ${esc(m.nro)}?',{yes:'Borrar',danger:true}).then(ok=>{if(ok)cajaBorrar('${esc(m.nro)}').then(()=>{toast('Borrado');pantallaCuenta()})})">Borrar</button>
        </div>
      </div>`).join(""):empty('box','No hay cobros ni pagos en este período. Usá los botones en las otras solapas, o mirá todo el historial.')}`;
    })():CTA_TAB==='pagar'?(()=>{ const tr=cuentaTransportistas(peds);
      return tr.length?tr.map(x=>`<div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b style="font-size:16px">${esc(x.quien)}</b>
          <span style="font-weight:800;color:${x.costo?'#e5484d':'var(--text-2)'}">${x.costo?fmtAr(x.costo):'—'}</span>
        </div>
        <div class="muted" style="font-size:13px;margin-top:3px">${x.n} envío${x.n===1?'':'s'}${x.quien==='Correo'?' · lo hacés vos (sin costo de cadete)':''}</div>
        <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${Object.entries(x.zonas).map(([z,n])=>`<span class="chip">${esc(z)}: ${n}</span>`).join("")}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn sm ghost" onclick="imprimirRecibo('${esc(x.quien)}')">${icon('printer')} Recibo / resumen</button>
          ${x.costo?`<button class="btn sm" onclick="registrarMovCaja('pago','${esc(x.quien)}',${x.costo},${x.n})">✓ Registrar pago</button>`:''}
        </div>
        <div style="margin-top:8px">
          ${x.peds.slice(0,80).map(o=>`<div class="row" style="justify-content:space-between;gap:8px;padding:7px 0;border-top:.5px solid var(--border);font-size:13px">
            <span style="min-width:0">${esc(o.p.cliente||'—')} <span class="muted">· N° ${esc(numOrden(o.p))} · ${esc(anilloDe(o.p).label)}${o.p.creado?(' · '+fmtFechaCorta(o.p.creado)):''}</span></span>
            <span style="flex:0 0 auto;font-weight:700">${o.costo?fmtAr(o.costo):'—'}</span>
          </div>`).join("")}
          ${x.peds.length>80?`<div class="hint" style="margin-top:8px">…y ${x.peds.length-80} envíos más.</div>`:''}
        </div>
      </div>`).join(""):empty('box','No hay envíos en este período.');
    })():(grupos.length?grupos.map(x=>`<div class="card" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b style="font-size:16px">${esc(nombreEmp(x.emp))}</b>
        <span style="font-weight:800;color:var(--green)">${fmtAr(x.cobrar)}</span>
      </div>
      <div class="muted" style="font-size:13px;margin-top:3px">${x.n} órdenes · costo ${fmtAr(x.costo)} · te queda <b style="color:var(--text)">${fmtAr(x.cobrar-x.costo)}</b></div>
      ${(()=>{ const sel=x.peds.filter(o=>CTA_SEL[o.p.id]); const nS=sel.length, tS=sel.reduce((s,o)=>s+o.cob,0);
        return `<div class="row" style="margin-top:10px;align-items:center;gap:6px;flex-wrap:wrap">
        <button class="btn sm ghost" onclick="ctaSelTodas('${esc(x.emp)}',1)">Todas</button>
        <button class="btn sm ghost" onclick="ctaSelTodas('${esc(x.emp)}',0)">Ninguna</button>
        <button class="btn sm ghost" onclick="imprimirFacturaMarca('${esc(x.emp)}')">${icon('printer')} Detalle</button>
        <button class="btn sm ${nS?'':'ghost'}" ${nS?'':'disabled style="opacity:.5"'} onclick="cobrarSeleccion('${esc(x.emp)}')">✓ Cobrar ${nS?(nS+" · "+fmtAr(tS)):"(elegí órdenes)"}</button>
      </div>`; })()}
      <div style="margin-top:8px">
        ${x.peds.slice(0,80).map(o=>`<label style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:.5px solid var(--border);font-size:13px;cursor:pointer;align-items:center">
          <span style="min-width:0;display:flex;gap:8px;align-items:center">
            <input type="checkbox" ${CTA_SEL[o.p.id]?'checked':''} onchange="CTA_SEL['${o.p.id}']=this.checked;pantallaCuenta()">
            <span style="min-width:0">${esc(o.p.cliente||'—')} <span class="muted">· N° ${esc(numOrden(o.p))}${o.p.creado?(' · '+fmtFechaCorta(o.p.creado)):''}</span></span>
          </span>
          <span style="flex:0 0 auto;font-weight:700">${fmtAr(o.cob)}</span>
        </label>`).join("")}
        ${x.peds.length>80?`<div class="hint" style="margin-top:8px">…y ${x.peds.length-80} órdenes más.</div>`:''}
      </div>
    </div>`).join(""):empty('box','No hay órdenes en este período.'))}`;
}
function pantallaRepickeo(){
  const st=stockState();
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && enRango(p.creado,REP_DESDE,REP_HASTA))
    .sort((a,b)=>(b.creado||0)-(a.creado||0));
  if(!Object.keys(REP_SEL).length) peds.forEach(p=>REP_SEL[p.id]=true);
  const sel=peds.filter(p=>REP_SEL[p.id]);
  let uds=0; sel.forEach(p=>{ try{ uds+=itemsPedido(p).reduce((s,i)=>s+(i.cant||0),0); }catch(e){ logErr("auto",e); } });
  const inpR="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Re-pickear órdenes</div>
    <div class="subtitle">Descontá el stock a partir de las órdenes ya cargadas. Útil después de blanquear: cargás el remito y con esto bajás todo lo que ya salió, imputado a cada marca.</div>
    <div class="card" style="margin:14px 0">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input type="date" value="${REP_DESDE}" onchange="REP_DESDE=this.value;REP_SEL={};pantallaRepickeo()" style="${inpR}"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input type="date" value="${REP_HASTA}" onchange="REP_HASTA=this.value;REP_SEL={};pantallaRepickeo()" style="${inpR}"></div>
      </div>
      ${(REP_DESDE||REP_HASTA)?`<button class="btn sm ghost" style="margin-top:10px" onclick="REP_DESDE='';REP_HASTA='';REP_SEL={};pantallaRepickeo()">Ver todas</button>`:''}
    </div>
    <div class="card" style="margin-bottom:14px;background:var(--bg-2)">
      <div style="font-weight:700">Se van a descontar ${uds} unidades</div>
      <div class="hint" style="margin-top:4px">De ${sel.length} órdenes seleccionadas. Los kits se abren en sus productos y cada salida queda imputada a la marca del pedido.</div>
      <button class="btn block" style="margin-top:12px" onclick="ejecutarRepickeo()">Descontar ahora</button>
    </div>
    <div class="row" style="margin-bottom:10px">
      <button class="btn sm ghost" onclick="peds_todos(1)">Marcar todas</button>
      <button class="btn sm ghost" onclick="peds_todos(0)">Ninguna</button>
    </div>
    <div class="card">
      ${peds.length?peds.map(p=>{ let u=0; try{ u=itemsPedido(p).reduce((s,i)=>s+(i.cant||0),0); }catch(e){ logErr("auto",e); }
        return `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:.5px solid var(--border);cursor:pointer">
          <input type="checkbox" ${REP_SEL[p.id]?'checked':''} onchange="REP_SEL['${p.id}']=this.checked;pantallaRepickeo()" style="margin-top:3px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400">· ${u} u</span></div>
            <div class="muted" style="font-size:12px">N° ${esc(numOrden(p))}${p.empresa?(' · '+esc(empresaObj(p.empresa).nombre)):''}${p.creado?(' · '+fmtFechaCorta(p.creado)):''}${p.stockBajado?' · <span style="color:var(--amber)">ya descontado</span>':''}</div>
          </div>
        </label>`; }).join(""):empty('box','No hay órdenes en este período.')}
    </div>`;
}
function peds_todos(v){ const peds=soloPedidos().filter(p=>p.estado!=="anulado"&&enRango(p.creado,REP_DESDE,REP_HASTA)); peds.forEach(p=>REP_SEL[p.id]=!!v); pantallaRepickeo(); }
async function ejecutarRepickeo(){
  const peds=soloPedidos().filter(p=>p.estado!=="anulado"&&enRango(p.creado,REP_DESDE,REP_HASTA)&&REP_SEL[p.id]);
  if(!peds.length){ toast("Marcá al menos una orden"); return; }
  if(!await askConfirm("¿Descontar el stock de "+peds.length+" órdenes?\n\nSe registra cada salida con su cliente, zona y marca.\nHacelo DESPUÉS de cargar el remito.")) return;
  let ok=0;
  toast("Descontando… no cierres la página");
  for(const p of peds){ try{ await descontarStockPedido(p.id,null,true); ok++; }catch(e){ console.warn("Falló",p.ref,e); } }
  notify("✅ LISTO\n\nSe descontaron "+ok+" de "+peds.length+" órdenes.\nMirá el stock y 'Lo que salió' para verificar.");
  REP_SEL={}; OPVIEW='stock'; vistaOperador();
}
function pantallaSalidas(){
  const {lista,total,totEmp}=salidasResumen(SAL_DESDE,SAL_HASTA);
  const inpS="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  const empTxt=Object.entries(totEmp).map(([e,n])=>esc(nombreEmp(e))+": "+n).join(" · ");
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Lo que salió del stock</div>
    <div class="subtitle">Todo lo que se retiró, por producto y por empresa</div>
    ${salMinEfectivo()?`<div class="hint" style="margin-top:6px">Mostrando desde el corte del ${new Date(salMinEfectivo()).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})} hs · <a onclick="setRangoSal('todo')" style="color:var(--accent);cursor:pointer;font-weight:700;text-decoration:underline">Ver todo</a></div>`:`<div class="hint" style="margin-top:6px">Mostrando todo el histórico</div>`}
    <div class="card" style="margin:14px 0">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input type="date" value="${SAL_DESDE}" onchange="SAL_MIN=0;SAL_DESDE=this.value;pantallaSalidas()" style="${inpS}"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input type="date" value="${SAL_HASTA}" onchange="SAL_MIN=0;SAL_HASTA=this.value;pantallaSalidas()" style="${inpS}"></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm ghost" onclick="SAL_MIN=null;SAL_DESDE='';SAL_HASTA='';pantallaSalidas()">Desde el último cierre</button>
        <button class="btn sm ghost" onclick="setRangoSal('sem')">Esta semana</button>
        <button class="btn sm ghost" onclick="setRangoSal('ant')">Semana pasada</button>
        <button class="btn sm ghost" onclick="setRangoSal('mes')">Este mes</button>
        <button class="btn sm ghost" onclick="setRangoSal('mesant')">Mes pasado</button>
        <button class="btn sm ghost" onclick="setRangoSal('todo')">Todo</button>
      </div>
    </div>
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <b>${total} unidades salieron</b>
      ${lista.length?`<span class="row" style="gap:6px"><button class="btn sm green" onclick="enviarSalidasWA()">WhatsApp</button><button class="btn sm ghost" onclick="exportarSalidasExcel()">📊 Excel</button><button class="btn sm ghost" onclick="imprimirSalidas()">${icon('printer')} PDF</button></span>`:''}
    </div>
    ${Object.keys(totEmp).length?`<div class="card" style="margin-bottom:12px;padding:12px 14px">
      <div class="label" style="margin-bottom:2px">Salió por empresa</div>
      ${Object.entries(totEmp).sort((a,b)=>b[1]-a[1]).map(([e,n])=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)"><span style="font-weight:600">${esc(nombreEmp(e))}</span><b style="font-size:15px">${n} u</b></div>`).join("")}
    </div>`:''}
    ${lista.length?lista.map(r=>{ const split=Object.entries(r.porEmp).map(([e,n])=>esc(nombreEmp(e))+" "+n).join(" · ");
      const key=encodeURIComponent(r.prod); const ab=!!SAL_EXP[key];
      return `<div class="card" style="margin-bottom:8px;padding:12px 14px">
        <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px;cursor:pointer" onclick="SAL_EXP['${encodeURIComponent(r.prod)}']=!SAL_EXP['${encodeURIComponent(r.prod)}'];pantallaSalidas()">
          <span style="min-width:0;font-size:14px">${esc(r.prod)}</span>
          <span class="row" style="gap:8px;flex:0 0 auto;align-items:baseline"><b>${r.total}</b><span class="muted" style="font-size:12px">${ab?'▲':'▼'}</span></span>
        </div><div class="muted" style="font-size:12.5px;margin-top:2px">${split}</div>
        ${ab?`<div style="margin-top:10px">
          <div class="label" style="margin-bottom:4px">A dónde fue</div>
          ${r.detalle.map(m=>`<div style="padding:8px 0;border-top:.5px solid var(--border);font-size:13px">
            <div class="row" style="justify-content:space-between;gap:8px">
              <b style="min-width:0">${esc(m.cliente||m.motivo||'—')}</b>
              <span style="flex:0 0 auto;font-weight:700">${m.cant} u</span>
            </div>
            <div class="muted" style="font-size:12px;margin-top:2px">
              ${m.ref?('N° '+esc(m.ref)+' · '):''}${m.ts?fmtFechaCorta(m.ts):''}${m.destino?(' · '+esc(m.destino)):''}
            </div>
            <div class="muted" style="font-size:12px;margin-top:1px">
              ${m.zona?('📍 '+esc(m.zona)):''}${m.quien?(' · 🚚 '+esc(m.quien)):''}${' · '+esc(nombreEmp(m.empresa))}
            </div>
          </div>`).join("")}
        </div>`:''}
      </div>`; }).join(""):empty('box','No salió nada en este período.')}`;
}
/* Exporta a Excel lo que salió del stock en el rango elegido: una fila por retiro + resumen por empresa */
function exportarSalidasExcel(){
  if(typeof XLSX==="undefined"){ toast("No cargó el generador de Excel, recargá la página"); return; }
  const st=stockState(); const min=salMinEfectivo();
  const movs=(st.movs||[]).filter(m=>m.tipo==="salida" && (m.ts||0)>=min && enRango(m.ts,SAL_DESDE,SAL_HASTA))
    .sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(!movs.length){ toast("No hay retiros en ese rango"); return; }
  const filas=movs.map(m=>({
    Fecha: m.ts? new Date(m.ts).toLocaleDateString("es-AR") : "",
    Hora: m.ts? new Date(m.ts).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}) : "",
    Empresa: nombreEmp(m.empresa),
    Producto: m.prod||"",
    Cantidad: m.cant||0,
    Canal: m.canal||"",
    Cliente: m.cliente||m.motivo||"",
    Orden: m.ref||""
  }));
  const porEmpProd={};
  movs.forEach(m=>{ const k=(m.empresa||"—")+"||"+(m.prod||""); porEmpProd[k]=(porEmpProd[k]||0)+(m.cant||0); });
  const resumen=Object.entries(porEmpProd).map(([k,c])=>{ const [e,p]=k.split("||");
    return {Empresa:nombreEmp(e), Producto:p, Unidades:c}; }).sort((a,b)=>a.Empresa.localeCompare(b.Empresa)||b.Unidades-a.Unidades);
  const totEmp={}; movs.forEach(m=>{ const e=m.empresa||"—"; totEmp[e]=(totEmp[e]||0)+(m.cant||0); });
  const totales=Object.entries(totEmp).sort((a,b)=>b[1]-a[1]).map(([e,c])=>({Empresa:nombreEmp(e), Unidades:c}));
  totales.push({Empresa:"TOTAL", Unidades:movs.reduce((s,m)=>s+(m.cant||0),0)});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totales), "Totales por empresa");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Por empresa y producto");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Detalle");
  const per=(SAL_DESDE||SAL_HASTA)?((SAL_DESDE||"inicio")+" a "+(SAL_HASTA||"hoy")):"todo";
  XLSX.writeFile(wb, "Retiros de stock "+per+".xlsx");
  toast("Excel descargado ✓ "+movs.length+" retiros");
}
function textoSalidas(){
  const {lista,total,totEmp}=salidasResumen(SAL_DESDE,SAL_HASTA);
  const hoy=new Date().toLocaleDateString("es-AR");
  let t="Salidas de stock "+hoy+" ("+total+" unidades)\n";
  const empTxt=Object.entries(totEmp).map(([e,n])=>empresaObj(e).nombre+": "+n).join(" · ");
  if(empTxt) t+=empTxt+"\n";
  t+="\n";
  lista.forEach(r=>{ t+="- "+r.prod+": "+r.total+"\n"; });
  return t;
}
function enviarSalidasWA(){
  const {lista}=salidasResumen(SAL_DESDE,SAL_HASTA);
  if(!lista.length){ toast("No hay salidas para informar"); return; }
  window.open("https://wa.me/"+INFORME_TEL+"?text="+encodeURIComponent(textoSalidas()),"_blank");
}
function imprimirSalidas(){
  const {lista,total,totEmp}=salidasResumen(SAL_DESDE,SAL_HASTA);
  if(!lista.length){ toast("No hay salidas"); return; }
  const w=window.open("","_blank","width=820,height=920"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  const emps=Object.keys(totEmp);
  const th=emps.map(e=>`<th class="c">${esc(empresaObj(e).nombre)}</th>`).join("");
  const filas=lista.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.prod)}</td>${emps.map(e=>`<td class="c">${r.porEmp[e]||0}</td>`).join("")}<td class="c b">${r.total}</td></tr>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Salidas de stock</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:20px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:12px}'+
    'th,td{border:1px solid #999;padding:7px 9px;text-align:left}th{background:#2c3e50;color:#fff}.c{text-align:center}.b{font-weight:bold}@page{size:A4;margin:14mm}</style></head><body>'+
    '<h1>Salidas de stock</h1><p>Fecha: '+hoy+' · '+total+' unidades en total</p>'+
    '<table><thead><tr><th class="c">#</th><th>Producto</th>'+th+'<th class="c">Total</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
/* Fecha en que se entregó un pedido (del historial de eventos) */
function fechaEntrega(p){
  const ev=(p.eventos||[]).filter(e=>e.estado==="entregado"||e.estado==="confirmado").pop();
  return ev?ev.ts:(p.creado||Date.now());
}
function entregadosEn(desde,hasta){
  return soloPedidos().filter(p=>["entregado","confirmado","finalizado"].includes(p.estado))
    .map(p=>({p, fe:fechaEntrega(p)}))
    .filter(x=>enRango(x.fe,desde,hasta))
    .sort((a,b)=>b.fe-a.fe);
}
/* Cobro de reparto: lo que Fullminet le cobra a cada empresa según la zona */
let COB_DESDE="", COB_HASTA="";
function catPedido(p){
  if(p.pickit) return "pickit";
  if(p.zonaFija!=null && p.zonaFija!==""){ const n=+p.zonaFija; return n===0?"caba":(n>=1&&n<=3)?String(n):"correo"; }
  if(p.metodo==="correo") return "correo"; const an=anilloDe(p);
  if(an.n===0) return "caba"; if(an.n>=1&&an.n<=3) return String(an.n); return "correo"; }
const COB_ET={caba:"CABA","1":"Zona 1","2":"Zona 2","3":"Zona 3",correo:"Correo",pickit:"Pickit",revisar:"A revisar"};
let COB_VERPAGADOS=false;
function facturable(p){
  if(p.estado==="finalizado"||p.estado==="anulado") return false;
  if(p.metodo==="correo") return ["despachado","en_camino","entregado","confirmado"].includes(p.estado);  // correo: se factura al despachar
  return ["entregado","confirmado"].includes(p.estado);                                                    // cadete: al entregar
}
function fechaFacturable(p){
  const ev=(p.eventos||[]).filter(e=>["entregado","confirmado","despachado"].includes(e.estado)).pop();
  return ev?ev.ts:(p.creado||Date.now());
}
function cobroReparto(desde,hasta){
  const proc=soloPedidos().filter(p=>
    (COB_VERPAGADOS ? (p.pagado && p.estado!=="anulado") : (facturable(p) && !p.pagado))
    && enRango(fechaFacturable(p),desde,hasta));
  const byEmp={};
  proc.forEach(p=>{ const e=p.empresa; if(!byEmp[e]) byEmp[e]={empresa:e,pedidos:[],total:0,costo:0};
    const c=catPedido(p), precio=costoEnvio(p), costo=costoCard(p,c);
    byEmp[e].total+=precio; byEmp[e].costo+=costo;
    byEmp[e].pedidos.push({id:p.id, ref:codigoOrden(p), cliente:p.cliente||"—", cat:c, zona:COB_ET[c], destino:(p.ciudad||"")+(p.provincia?(", "+p.provincia):""), precio, pagado:!!p.pagado}); });
  const arr=Object.values(byEmp);
  arr.forEach(f=>{ f.ganancia=f.total-f.costo; f.pedidos.sort((a,b)=>a.zona.localeCompare(b.zona)||a.ref.localeCompare(b.ref)); });
  return arr;
}
async function finalizarPedido(id){
  await DB.update(id,{estado:"finalizado",eventos:[...((PEDIDOS.find(x=>x.id===id)||{}).eventos||[]),{estado:"finalizado",ts:Date.now(),nota:"Cerrado"}]});
  toast("Pedido finalizado ✔"); pantallaCobro();
}
async function finalizarPagados(){
  const pagos=soloPedidos().filter(p=>facturable(p) && p.pagado);
  if(!pagos.length){ toast("No hay pagados para finalizar"); return; }
  if(!await askConfirm("¿Finalizar "+pagos.length+" pedidos pagados?\n\nQuedan cerrados y archivados (los ves con el filtro Finalizados).")) return;
  for(const p of pagos){ await DB.update(p.id,{estado:"finalizado",eventos:[...(p.eventos||[]),{estado:"finalizado",ts:Date.now(),nota:"Cerrado"}]}); }
  toast(pagos.length+" pedidos finalizados ✔"); pantallaCobro();
}
async function marcarPagado(id){
  const p=PEDIDOS.find(x=>x.id===id)||{};
  await DB.update(id,{pagado:true,pagadoTs:Date.now(),estado:"finalizado",
    eventos:[...(p.eventos||[]),{estado:"finalizado",ts:Date.now(),nota:"Pagado y archivado"}]});
  toast("Pagado ✅ Archivado"); pantallaCobro();
}
/* Corrige el método de los pedidos YA guardados con la regla actual (CABA/BA -> cadete; retiro/otra prov -> correo) */
/* ===== CSV para la mensajería (formato Cardinal) — importa los envíos y te da tracking ===== */
function telCardinal(t){
  let d=String(t||"").replace(/\D/g,"");
  if(!d) return "";
  d=d.replace(/^0+/,"");
  if(d.startsWith("549")) return d;
  if(d.startsWith("54")) return "549"+d.slice(2);
  if(d.startsWith("15")) d=d.slice(2);           // celular viejo con 15
  return "549"+d;
}
function csvCampo(v){ v=String(v==null?"":v); return /[",\n\r]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }
function csvMensajeria(peds){
  const hoy=new Date(); const f=String(hoy.getDate()).padStart(2,"0")+"/"+String(hoy.getMonth()+1).padStart(2,"0")+"/"+String(hoy.getFullYear()).slice(-2);
  const head="Tracking externo,Tipo entrega,Fecha entrega,Valor,Peso (g),Origen,Or. Piso/Lote,Or. Puerta,Or. Observación,Or. Nombre,Or. Tel.,Or. Email,Destino,Des. Piso/Lote,Des. Puerta,Des. Observación,Des. Nombre,Des. Tel.,Des. Email,Bultos,Cobro Dest.";
  const filas=peds.map(p=>{
    const destino=[p.dir, p.ciudad, p.provincia].filter(Boolean).join(", ");
    return [codigoOrden(p),"Normal",f,0,0,"","","","","","","",
            csvCampo(destino),"","",csvCampo(p.nota||""),csvCampo(p.cliente||""),telCardinal(p.tel),"",0,0].join(",");
  });
  return "\uFEFF"+[head,...filas].join("\r\n")+"\r\n";
}
function descargarArchivo(nombre,contenido,mime){
  const url=URL.createObjectURL(new Blob([contenido],{type:mime||"text/csv;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url; a.download=nombre; document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },400);
}
/* Exporta TODAS las órdenes del sistema a un CSV (para analizar o abrir en Excel) */
function exportarTodo(){
  const peds=soloPedidos();
  if(!peds.length){ toast("No hay pedidos para exportar"); return; }
  const est=e=>((EST[e]||{}).label||e||"");
  const head=["Codigo","N Orden","Empresa","Cliente","Telefono","Provincia","Localidad","Direccion","Metodo","Zona","Estado","Pagado","Fecha","Items (desglosado)"];
  const filas=peds.map(p=>{
    const items=itemsPedido(p).map(i=>i.cant+"x "+(i.prodNombre||i.nombre)).join(" | ");
    const fecha=new Date(p.creado||Date.now()).toLocaleDateString("es-AR");
    return [codigoOrden(p),numOrden(p),empresaObj(p.empresa).nombre,p.cliente||"",p.tel||"",p.provincia||"",p.ciudad||"",p.dir||"",
            p.metodo||"",anilloDe(p).label,est(p.estado),p.pagado?"SI":"",fecha,items].map(csvCampo).join(",");
  });
  const csv="\uFEFF"+[head.join(","),...filas].join("\r\n")+"\r\n";
  descargarArchivo("ordenes-"+new Date().toISOString().slice(0,10)+".csv", csv);
  toast(peds.length+" órdenes exportadas ✅");
}
async function exportarCSVMensajeria(){
  const peds=soloPedidos().filter(p=>p.metodo==="cadete" && ["preparado","asignado","en_reparto"].includes(p.estado));
  if(!peds.length){ toast("No hay envíos de cadete listos para exportar"); return; }
  const csv=csvMensajeria(peds);
  const hoy=new Date().toISOString().slice(0,10);
  descargarArchivo("mensajeria-"+hoy+".csv", csv);
  for(const p of peds){ if(!p.tracking) await DB.update(p.id,{tracking:codigoOrden(p)}); }   // guardo el tracking en cada pedido
  notify("✅ CSV GENERADO: "+peds.length+" envío"+(peds.length===1?"":"s")+"\n\nSe descargó \"mensajeria-"+hoy+".csv\".\nImportalo en el sistema de la mensajería.\n\nEl tracking de cada pedido es su código (LABS#… / NUTRI#… / SC#…), ya quedó guardado en cada uno.");
}
async function recalcularRutas(){
  let n=0;
  for(const p of soloPedidos()){
    if(p.estado==="anulado" || p.pagado) continue;
    if((p.correo||"")==="Punto de retiro") continue;               // retiro en sucursal queda correo
    const debe=llegaCadete(p)?"cadete":"correo";
    if(p.metodo!==debe){ await DB.update(p.id,{metodo:debe, correo:debe==="correo"?(p.correo||"Correo Argentino"):""}); n++; }
  }
  toast(n?("Corregí "+n+" pedido"+(n===1?"":"s")):"Ya estaba todo bien");
  vistaOperador();
}
async function marcarImpago(id){
  const p=PEDIDOS.find(x=>x.id===id)||{};
  await DB.update(id,{pagado:false,estado:"entregado",
    eventos:[...(p.eventos||[]),{estado:"entregado",ts:Date.now(),nota:"Se desmarcó el pago"}]});
  toast("Volvió a pendiente de cobro"); pantallaCobro();
}
function pantallaCobro(){
  const filas=cobroReparto(COB_DESDE,COB_HASTA);
  const inpS="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='pedidos';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Facturar entregados</div>
    <div class="subtitle">${COB_VERPAGADOS?'Archivo: pedidos ya cobrados y cerrados':'Pendientes de cobro'} · detalle por pedido</div>
    <div class="card" style="margin:14px 0">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input type="date" value="${COB_DESDE}" onchange="COB_DESDE=this.value;pantallaCobro()" style="${inpS}"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input type="date" value="${COB_HASTA}" onchange="COB_HASTA=this.value;pantallaCobro()" style="${inpS}"></div>
      </div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        ${(COB_DESDE||COB_HASTA)?`<button class="btn sm ghost" onclick="COB_DESDE='';COB_HASTA='';pantallaCobro()">Ver todo</button>`:''}
        <button class="btn sm ${COB_VERPAGADOS?'':'ghost'}" onclick="COB_VERPAGADOS=!COB_VERPAGADOS;pantallaCobro()">${COB_VERPAGADOS?'← Ver pendientes':'📁 Archivados (pagados)'}</button>
      </div>
    </div>
    ${(()=>{ const enCurso={}; soloPedidos().forEach(p=>{ if(["anulado","finalizado"].includes(p.estado)||facturable(p)||p.pagado) return;
        if(!["pendiente","preparado","asignado","en_reparto"].includes(p.estado)) return;
        enCurso[p.empresa]=(enCurso[p.empresa]||0)+1; });
      const t=Object.entries(enCurso).map(([e,n])=>esc(empresaObj(e).nombre)+": "+n).join(" · ");
      return t?`<div class="hint" style="margin-bottom:10px">⏳ Todavía en curso (entran a facturar al despachar/entregar): ${t}</div>`:''; })()}
    ${filas.length?filas.map(f=>`
      <div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:2px">
          <div style="font-weight:700;font-size:17px">${esc(empresaObj(f.empresa).nombre)}</div>
          <div style="font-weight:800;font-size:18px">${fmtAr(f.total)}</div>
        </div>
        <div class="muted" style="font-size:12px;margin-bottom:4px">Tu ganancia: ${fmtAr(f.ganancia)}</div>
        ${f.pedidos.map(pe=>`<div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-top:.5px solid var(--border)">
          <span style="min-width:0"><b>${esc(pe.ref)}</b> · ${esc(pe.cliente)}<br><span class="muted" style="font-size:12.5px">${esc(pe.zona)} · ${fmtAr(pe.precio)}</span></span>
          ${pe.pagado
            ? `<button class="btn sm ghost" style="flex:0 0 auto;color:var(--green)" onclick="marcarImpago('${pe.id}')">✓ Pagado (deshacer)</button>`
            : `<button class="btn sm ghost" style="flex:0 0 auto" onclick="marcarPagado('${pe.id}')">Marcar pagado</button>`}
        </div>`).join("")}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button class="btn sm green" onclick="enviarCobroWA('${f.empresa}')">WhatsApp</button>
        </div>
      </div>`).join(""):empty('check',COB_VERPAGADOS?'No hay pedidos pagados en este período.':'No hay entregados pendientes de cobro.')}
    ${filas.length?`<button class="btn block" style="margin-top:6px" onclick="imprimirCobro()">${icon('printer')} Imprimir / guardar PDF</button>`:''}`;
}
function textoCobro(f){
  const hoy=new Date().toLocaleDateString("es-AR");
  let t="Resumen de cuenta - "+empresaObj(f.empresa).nombre+" ("+hoy+")\nServicio de preparación y envío - Fullminet\n\n";
  f.pedidos.forEach(pe=>{ t+=pe.ref+" - "+pe.cliente+" ("+pe.zona+"): "+(pe.precio?fmtAr(pe.precio):"-")+"\n"; });
  t+="\nTOTAL A COBRAR: "+fmtAr(f.total);
  return t;
}
function enviarCobroWA(empId){
  const f=cobroReparto(COB_DESDE,COB_HASTA).find(x=>x.empresa===empId);
  if(!f||!f.pedidos.length){ toast("No hay pedidos para esta empresa"); return; }
  window.open("https://wa.me/"+INFORME_TEL+"?text="+encodeURIComponent(textoCobro(f)),"_blank");
}
function imprimirCobro(){
  const filas=cobroReparto(COB_DESDE,COB_HASTA); if(!filas.length){ toast("No hay repartos"); return; }
  const w=window.open("","_blank","width=860,height=920"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  const secc=filas.map(f=>{ const rows=f.pedidos.map((pe,i)=>`<tr><td class="c">${i+1}</td><td>${esc(pe.ref)}</td><td>${esc(pe.cliente)}</td><td>${esc(pe.zona)}</td><td>${esc(pe.destino)}</td><td class="c b">${pe.precio?fmtAr(pe.precio):'—'}</td></tr>`).join("");
    return `<h2>${esc(empresaObj(f.empresa).nombre)} — Total a cobrar: ${fmtAr(f.total)}</h2>
      <table><thead><tr><th class="c">#</th><th>N° orden</th><th>Cliente</th><th>Zona</th><th>Destino</th><th class="c">Precio</th></tr></thead><tbody>${rows}</tbody></table>`; }).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Resumen de cuenta</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}'+
    'p{font-size:12px;color:#333;margin:0 0 10px}table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:8px}'+
    'th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#2c3e50;color:#fff}.c{text-align:center}.b{font-weight:bold}@page{size:A4;margin:13mm}</style></head><body>'+
    '<h1>Resumen de cuenta — Fullminet</h1><p>Servicio de preparación y envío · Fecha: '+hoy+'</p>'+secc+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
/* Resumen de entregas: qué se entregó y a quién, con filtro de fecha */
/* ---- CHECKOUT DEL DÍA: la empleada confirma que lo despachado coincide ---- */
let CHK_FECHA="";
let GFORM_URL = "";  // pegá acá la URL de tu Google Form (la del "formResponse")
function chkDia(){ return CHK_FECHA || new Date().toISOString().slice(0,10); }
function pantallaCheckout(){
  const dia=chkDia();
  const ini=new Date(dia+"T00:00:00").getTime(), fin=ini+86400000;
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO"
    && (p.creado||0)>=ini && (p.creado||0)<fin);
  // por marca
  const porMarca={}; EMPRESAS.forEach(e=>porMarca[e.id]={nombre:e.nombre,n:0});
  peds.forEach(p=>{ const e=p.empresa||"—"; if(!porMarca[e]) porMarca[e]={nombre:nombreEmp(e),n:0}; porMarca[e].n++; });
  // por reparto
  const porRep={}; peds.forEach(p=>{ const q=p.metodo==="correo"?"Correo":(p.cadete||"Sin asignar"); porRep[q]=(porRep[q]||0)+1; });
  // unidades totales
  let uds=0; const prods={};
  peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>{ uds+=it.cant||0; prods[it.prodNombre]=(prods[it.prodNombre]||0)+(it.cant||0); }); }catch(e){ logErr("auto",e); } });
  const marcas=Object.values(porMarca).filter(x=>x.n>0);
  const inp="width:100%;padding:8px 11px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='panel';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Checkout del día</div>
    <div class="subtitle">Confirmá que lo que salió coincide con lo cargado. Al confirmar queda un registro firmado.</div>
    <div class="card" style="margin:14px 0">
      <span class="label">Día a confirmar</span>
      <input type="date" value="${dia}" onchange="CHK_FECHA=this.value;pantallaCheckout()" style="${inp}">
    </div>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="n">${peds.length}</div><div class="l">Órdenes</div></div>
      <div class="kpi"><div class="n">${uds}</div><div class="l">Unidades</div></div>
      <div class="kpi"><div class="n">${Object.keys(porRep).length}</div><div class="l">Repartidores</div></div>
      <div class="kpi"><div class="n">${marcas.length}</div><div class="l">Marcas</div></div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <span class="label">Por marca</span>
      <table class="tbl2">${marcas.map(x=>`<tr><td>${esc(x.nombre)}</td><td style="text-align:right;font-weight:700">${x.n}</td></tr>`).join("")||'<tr><td class="muted">Sin órdenes este día</td></tr>'}</table>
    </div>
    <div class="card" style="margin-bottom:12px">
      <span class="label">Por repartidor</span>
      <table class="tbl2">${Object.entries(porRep).sort((a,b)=>b[1]-a[1]).map(([q,n])=>`<tr><td>${esc(q)}</td><td style="text-align:right;font-weight:700">${n}</td></tr>`).join("")||'<tr><td class="muted">—</td></tr>'}</table>
    </div>
    <div class="card" style="margin-bottom:14px">
      <span class="label">Quién confirma</span>
      <input id="chkNombre" placeholder="Nombre de quien despachó" style="${inp};margin-bottom:10px">
      <label class="row" style="gap:8px;align-items:flex-start;font-size:14px;cursor:pointer">
        <input type="checkbox" id="chkOk" style="margin-top:3px">
        <span>Confirmo que revisé y que lo despachado coincide con lo cargado (${peds.length} órdenes · ${uds} unidades).</span>
      </label>
    </div>
    <button class="btn block" onclick="confirmarCheckout()">✓ Confirmar y registrar el día</button>
    <button class="btn ghost block" style="margin-top:8px" onclick="imprimirCheckout()">${icon('printer')} Imprimir resumen del día</button>
    ${chkHistorialHTML()}`;
}
function chkHistorialHTML(){
  const r=PEDIDOS.find(p=>p.tipo==="checkouts"); const lista=((r&&r.lista)||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,10);
  if(!lista.length) return "";
  return `<div class="label" style="margin-top:20px">Confirmaciones anteriores</div>
    ${lista.map(c=>`<div class="card" style="margin-bottom:8px;padding:11px 14px">
      <div class="row" style="justify-content:space-between"><b>${esc(c.dia)}</b><span class="muted">${c.ordenes} órd · ${c.unidades} u</span></div>
      <div class="muted" style="font-size:12.5px;margin-top:2px">Confirmó ${esc(c.quien||"—")} · ${new Date(c.ts).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
    </div>`).join("")}`;
}
async function confirmarCheckout(){
  const dia=chkDia();
  const quien=($("#chkNombre").value||"").trim();
  const ok=$("#chkOk").checked;
  if(!quien){ toast("Poné el nombre de quien despachó"); return; }
  if(!ok){ toast("Marcá la confirmación"); return; }
  const ini=new Date(dia+"T00:00:00").getTime(), fin=ini+86400000;
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && (p.creado||0)>=ini && (p.creado||0)<fin);
  let uds=0; peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>uds+=it.cant||0); }catch(e){ logErr("auto",e); } });
  const reg={dia, quien, ordenes:peds.length, unidades:uds, ts:Date.now()};
  const r=PEDIDOS.find(p=>p.tipo==="checkouts");
  const lista=((r&&r.lista)||[]).concat([reg]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"checkouts",lista});
  // enviar a Google Form si está configurado
  if(GFORM_URL) enviarAGoogleForm(reg);
  toast("Día confirmado ✓"+(GFORM_URL?" y enviado":""));
  pantallaCheckout();
}
function enviarAGoogleForm(reg){
  try{
    // el form recibe los campos por la URL; se completa con los entry.XXXX del form
    const params=new URLSearchParams();
    params.append("entry.fecha", reg.dia);
    params.append("entry.quien", reg.quien);
    params.append("entry.ordenes", reg.ordenes);
    params.append("entry.unidades", reg.unidades);
    fetch(GFORM_URL, {method:"POST", mode:"no-cors", body:params});
  }catch(e){ console.warn("Google Form:", e); }
}
function imprimirCheckout(){
  const dia=chkDia();
  const ini=new Date(dia+"T00:00:00").getTime(), fin=ini+86400000;
  const peds=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && (p.creado||0)>=ini && (p.creado||0)<fin);
  let uds=0, prods={}; const porRep={};
  peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>{ uds+=it.cant||0; prods[it.prodNombre]=(prods[it.prodNombre]||0)+(it.cant||0); }); }catch(e){ logErr("auto",e); }
    const q=p.metodo==="correo"?"Correo":(p.cadete||"Sin asignar"); porRep[q]=(porRep[q]||0)+1; });
  const w=window.open("","_blank","width=800,height=900"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const filas=peds.sort((a,b)=>(a.creado||0)-(b.creado||0)).map((p,i)=>{
    let it=[]; try{ it=itemsPedido(p); }catch(e){ logErr("auto",e); }
    return `<tr><td>${i+1}</td><td>${esc(numOrden(p))}</td><td>${esc(p.cliente||"")}</td>
      <td>${esc(nombreEmp(p.empresa))}</td><td>${esc(p.metodo==="correo"?"Correo":(p.cadete||"—"))}</td>
      <td>${it.map(x=>x.cant+"× "+esc(x.prodNombre)).join("<br>")}</td></tr>`; }).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Checkout ${dia}</title>
  <style>@page{size:A4;margin:13mm}body{font-family:-apple-system,system-ui,Segoe UI,sans-serif;color:#111;font-size:12px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:#666;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;font-size:10px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #111;padding:5px}
  td{padding:5px;border-bottom:.5px solid #ddd;vertical-align:top}.pr{font-size:10px}
  .kpi{display:flex;gap:10px;margin:10px 0}.kpi div{flex:1;border:1px solid #ddd;border-radius:7px;padding:8px 10px}.kpi b{display:block;font-size:17px}.kpi span{font-size:10px;color:#666;text-transform:uppercase}
  .firma{margin-top:40px;display:flex;gap:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:5px;color:#666;font-size:11px}
  </style></head><body>
  <h1>Checkout del día · ${dia}</h1><div class="sub">Fullminet · emitido ${new Date().toLocaleString("es-AR")}</div>
  <div class="kpi"><div><b>${peds.length}</b><span>Órdenes</span></div><div><b>${uds}</b><span>Unidades</span></div>
    <div><b>${Object.keys(porRep).length}</b><span>Repartidores</span></div></div>
  <table><thead><tr><th>#</th><th>Orden</th><th>Cliente</th><th>Marca</th><th>Reparto</th><th>Productos</th></tr></thead>
  <tbody>${filas}</tbody></table>
  <div class="firma"><div>Despachó / confirmó</div><div>Fecha y firma</div></div>
  <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},400)}<\/scr`+`ipt></body></html>`);
  w.document.close();
}
/* Checklist de preparación del día en 10x15 para la impresora térmica */
/* Checklist de preparación del día en 10x15 (térmica), AGRUPADO POR EMPRESA.
   Se muestra DENTRO de la app (sin abrir ventana nueva) para que aparezca siempre, también en el celular. */
function imprimirChecklistDia(empresaFiltro){
  const dia=chkDia();
  const pedsAll=soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO"
    && !p.cerradoEn && ["pendiente","preparado"].includes(p.estado));
  if(!pedsAll.length){ toast("No hay pedidos para preparar"); return; }
  const peds = empresaFiltro ? pedsAll.filter(p=>p.empresa===empresaFiltro) : pedsAll;
  if(empresaFiltro && !peds.length){ toast("No hay pedidos de "+empresaObj(empresaFiltro).nombre+" para preparar"); return; }
  let udsTot=0; peds.forEach(p=>{ try{ itemsPedido(p).forEach(it=>udsTot+=it.cant||0); }catch(e){ logErr("auto",e); } });

  // agrupar por empresa, respetando el orden de EMPRESAS
  const grupos={}; peds.forEach(p=>{ (grupos[p.empresa]=grupos[p.empresa]||[]).push(p); });
  Object.values(grupos).forEach(g=>g.sort((a,b)=>(a.creado||0)-(b.creado||0)));
  let cuerpo=""; let n=0;
  EMPRESAS.forEach(e=>{
    const g=grupos[e.id]; if(!g||!g.length) return;
    let uEmp=0; g.forEach(p=>{ try{ itemsPedido(p).forEach(it=>uEmp+=it.cant||0);}catch(_){ logErr("auto",_); } });
    cuerpo+='<div class="marca">'+esc(e.nombre)+' · '+g.length+' ped · '+uEmp+' u</div>';
    g.forEach(p=>{ n++;
      let it=[]; try{ it=itemsPedido(p); }catch(_){ logErr("auto",_); }
      const prods=it.map(x=>'<div class="pl">&#9744; '+x.cant+'&times; '+esc(x.prodNombre)+'</div>').join("");
      const esCorreo=p.metodo==="correo";
      const via=esCorreo?"CORREO":"CADETE";
      const detalle=esCorreo?"Correo":(p.cadete||"\u2014");
      const formato=formatoEnvio(p);
      cuerpo+='<div class="ord">'+
        '<div class="oh"><span class="chk">&#9744;</span><b>'+n+'. '+esc(p.cliente||"\u2014")+'</b>'+
          '<span class="via '+(esCorreo?'vc':'vd')+'">'+via+'</span></div>'+
        '<div class="om">N&deg; '+esc(numOrden(p))+' &middot; '+esc(detalle)+' &middot; '+esc(anilloDe(p).label)+
          ' &middot; <span class="fmt fmt-'+esc(formato.toLowerCase())+'">'+esc(formato.toUpperCase())+'</span></div>'+
        prods+'</div>';
    });
  });

  // selector de marca (para poder re-imprimir solo una, ej. cuando entran pedidos nuevos de una sola marca)
  const gruposAll={}; pedsAll.forEach(p=>{ (gruposAll[p.empresa]=gruposAll[p.empresa]||[]).push(p); });
  const opcionesMarca=EMPRESAS.filter(e=>gruposAll[e.id]&&gruposAll[e.id].length)
    .map(e=>'<option value="'+esc(e.id)+'" '+(empresaFiltro===e.id?'selected':'')+'>'+esc(e.nombre)+' ('+gruposAll[e.id].length+')</option>').join("");
  const selectorMarca=opcionesMarca?(
    '<select onchange="imprimirChecklistDia(this.value||null)" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;padding:8px 10px;border-radius:9px;border:1px solid #ccc;background:#fff">'+
      '<option value="" '+(!empresaFiltro?'selected':'')+'>Todas las marcas</option>'+
      opcionesMarca+
    '</select>'
  ):"";

  const estilos='<style id="chkCss">'+
    '#chkOverlay{position:fixed;inset:0;z-index:99999;background:#f5f5f7;overflow:auto;-webkit-overflow-scrolling:touch}'+
    '#chkBar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;padding:10px;background:#fff;border-bottom:1px solid #ddd}'+
    '#chkBar button{font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:9px 18px;border-radius:9px;border:1px solid #0a84ff;background:#0a84ff;color:#fff;cursor:pointer}'+
    '#chkBar button.sec{background:#fff;color:#0a84ff}'+
    '#hoja{width:100mm;margin:12px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15);color:#000;padding:3mm;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.3}'+
    '#hoja h1{font-size:15px;margin:0;text-align:center}'+
    '#hoja .sub{text-align:center;font-size:10.5px;color:#333;margin:.5mm 0 2mm;border-bottom:1.4px solid #000;padding-bottom:1.5mm}'+
    '#hoja .marca{font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;background:#000;color:#fff;padding:1.2mm 2mm;border-radius:1mm;margin:2.6mm 0 1.4mm}'+
    '#hoja .ord{border:1.2px solid #000;border-radius:1mm;padding:1.6mm 2mm;margin-bottom:1.6mm}'+
    '#hoja .oh{font-size:12.5px;display:flex;gap:1.5mm;align-items:center}#hoja .chk{font-size:16px;line-height:1}#hoja .oh b{flex:1;min-width:0}'+
    '#hoja .via{font-size:9.5px;font-weight:800;letter-spacing:.05em;padding:1px 6px;border-radius:2px;border:1.2px solid #000;white-space:nowrap}'+
    '#hoja .vc{background:#000;color:#fff}#hoja .vd{background:#fff;color:#000}'+
    '#hoja .fmt{font-size:9px;font-weight:800;letter-spacing:.03em;padding:0px 5px;border-radius:2px;border:1px solid #999;white-space:nowrap}'+
    '#hoja .fmt-nube{background:#eef4ff;color:#1d4ed8;border-color:#1d4ed8}'+
    '#hoja .fmt-flex{background:#fff3cd;color:#7a5a00;border-color:#7a5a00}'+
    '#hoja .fmt-pickit{background:#e8e6ff;color:#4b3fa8;border-color:#4b3fa8}'+
    '#hoja .om{font-size:9.5px;color:#333;margin:.5mm 0 1mm}#hoja .pl{font-size:11.5px;padding:.4mm 0 .4mm 3mm}'+
    '#hoja .foot{margin-top:2mm;font-size:10px;border-top:1.4px solid #000;padding-top:1.5mm}'+
    '@media print{@page{size:100mm 150mm;margin:0}'+
      'body{visibility:hidden}#chkOverlay,#chkOverlay *{visibility:visible}'+
      '#chkOverlay{position:absolute;inset:0;background:#fff;overflow:visible}'+
      '#chkBar{display:none}#hoja{margin:0;box-shadow:none;width:100mm}}'+
    '</style>';

  const subTxt=(empresaFiltro?('<b>'+esc(empresaObj(empresaFiltro).nombre)+'</b> &middot; '):"")+peds.length+' &oacute;rdenes &middot; '+udsTot+' unidades';
  const hoja='<div id="hoja"><h1>Preparaci&oacute;n &middot; '+dia+'</h1>'+
    '<div class="sub">'+subTxt+'</div>'+
    cuerpo+'<div class="foot">Prepar&oacute;: ______________  Fecha: ______</div></div>';

  const prev=document.getElementById("chkOverlay"); if(prev) prev.remove();
  const prevCss=document.getElementById("chkCss"); if(prevCss) prevCss.remove();
  document.head.insertAdjacentHTML("beforeend", estilos);
  const ov=document.createElement("div"); ov.id="chkOverlay";
  ov.innerHTML='<div id="chkBar">'+
    selectorMarca+
    '<button onclick="window.print()">&#128424;&#65039; Imprimir / Guardar PDF</button>'+
    '<button class="sec" onclick="cerrarChecklistDia()">&times; Cerrar</button></div>'+hoja;
  document.body.appendChild(ov);
}
function cerrarChecklistDia(){
  const o=document.getElementById("chkOverlay"); if(o) o.remove();
  const c=document.getElementById("chkCss"); if(c) c.remove();
}

/* Chequeo READ-ONLY: pedidos de HOY y si descontaron stock. Resalta los que deberían y no lo hicieron.
   La app descuenta cuando el pedido pasa a "preparado"; por eso todo lo que está en preparado o más
   y no tiene stockBajado es un problema (salvo que el descuento automático esté apagado). */
function chequeoDescuentosHoy(){
  const dia=chkDia();
  const ini=new Date(dia+"T00:00:00").getTime(), fin=ini+86400000;
  const activo=descuentoActivo();
  const peds=soloPedidos().filter(p=>(p.cliente||"")!=="_PRUEBA_DIAGNOSTICO" && (p.creado||0)>=ini && (p.creado||0)<fin);
  const post=["preparado","asignado","en_reparto","entregado","confirmado"];
  function clasif(p){
    if(p.estado==="anulado") return {k:4,ic:"\u26d4",txt:"Anulado",col:"#8a8a8a"};
    if(p.stockBajado && p.noDescuenta) return {k:1,ic:"\ud83d\udfe1",txt:"Sali\u00f3 de R\u00edo Tercero \u2014 no toca el stock de Bs As",col:"#0a84ff"};
    if(p.stockBajado) return {k:0,ic:"\u2705",txt:"Descontado",col:"#0f9d58"};
    if(activo && post.includes(p.estado)) return {k:3,ic:"\u26a0\ufe0f",txt:"DEBER\u00cdA haber descontado y no lo hizo",col:"#e5484d"};
    return {k:2,ic:"\u2b1c",txt:"Todav\u00eda no (falta preparar)",col:"#b0851f"};
  }
  const rows=peds.map(p=>({p,c:clasif(p)})).sort((a,b)=>((b.c.k===3)-(a.c.k===3))||(a.c.k-b.c.k)||((a.p.creado||0)-(b.p.creado||0)));
  const cont={ok:0,rt:0,pend:0,falta:0,anul:0};
  rows.forEach(r=>{ cont[{0:"ok",1:"rt",2:"pend",3:"falta",4:"anul"}[r.c.k]]++; });
  const problemas=cont.falta;

  const filas=rows.map(r=>{ const p=r.p,c=r.c;
    return '<div style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:1px solid '+(c.k===3?'#f2b8b8':'var(--border)')+';background:'+(c.k===3?'#fff5f5':'var(--bg-2)')+';border-radius:11px;margin-top:8px">'+
      '<div style="font-size:18px;line-height:1.2">'+c.ic+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:600">'+esc(p.cliente||"\u2014")+' <span class="muted" style="font-weight:400;font-size:12px">\u00b7 N\u00b0 '+esc(numOrden(p))+'</span></div>'+
        '<div style="font-size:12px;color:var(--text-3);margin:2px 0 3px">'+esc(nombreEmp(p.empresa))+' \u00b7 '+esc(p.estado||"")+'</div>'+
        '<div style="font-size:12.5px;font-weight:600;color:'+c.col+'">'+c.txt+'</div>'+
        (c.k===3?'<button class="btn sm" style="margin-top:7px;padding:5px 11px" onclick="descontarAhora(\''+p.id+'\');setTimeout(function(){chequeoDescuentosHoy()},500)">\u21bb Descontar ahora</button>':"")+
      '</div></div>';
  }).join("");

  const resumen='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;margin:2px 0 8px">'+
    '<div><div style="font-size:22px;font-weight:800;color:#0f9d58">'+cont.ok+'</div><div class="muted" style="font-size:10.5px">Descontados</div></div>'+
    '<div><div style="font-size:22px;font-weight:800;color:#0a84ff">'+cont.rt+'</div><div class="muted" style="font-size:10.5px">R\u00edo Tercero</div></div>'+
    '<div><div style="font-size:22px;font-weight:800;color:#b0851f">'+cont.pend+'</div><div class="muted" style="font-size:10.5px">Sin preparar</div></div>'+
    '<div><div style="font-size:22px;font-weight:800;color:'+(problemas?"#e5484d":"var(--text-3)")+'">'+cont.falta+'</div><div class="muted" style="font-size:10.5px">A revisar</div></div></div>';

  const banner = !activo
    ? '<div style="background:#fff4e5;border:1px solid #e0b000;border-radius:10px;padding:10px 12px;font-size:13px;color:#7a5a00;margin-bottom:8px">El descuento autom\u00e1tico de stock est\u00e1 <b>desactivado</b> en Ajustes, as\u00ed que es normal que no descuenten solos.</div>'
    : (problemas
        ? '<div style="background:#fff5f5;border:1px solid #e5484d;border-radius:10px;padding:10px 12px;font-size:13px;color:#c62828;margin-bottom:8px"><b>Hay '+problemas+' pedido'+(problemas===1?"":"s")+' que deber\u00edan haber descontado y no lo hicieron.</b> Tocá "Descontar ahora" en cada uno.</div>'
        : '<div style="background:#eafaf0;border:1px solid #0f9d58;border-radius:10px;padding:10px 12px;font-size:13px;color:#0f6b40;margin-bottom:8px"><b>\u2705 Todo en orden.</b> Todos los pedidos de hoy que ya se prepararon descontaron bien.</div>');

  const prev=document.getElementById("chkDescOverlay"); if(prev) prev.remove();
  const ov=document.createElement("div"); ov.id="chkDescOverlay";
  ov.setAttribute("style","position:fixed;inset:0;z-index:99999;background:var(--bg,#f5f5f7);overflow:auto;-webkit-overflow-scrolling:touch");
  ov.innerHTML='<div style="position:sticky;top:0;background:var(--bg,#fff);border-bottom:1px solid var(--border,#ddd);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px">'+
      '<b style="font-size:16px">Chequeo de descuentos \u00b7 '+esc(dia)+'</b>'+
      '<button class="btn sm ghost" onclick="cerrarChequeoDesc()">\u2715 Cerrar</button></div>'+
    '<div style="max-width:640px;margin:0 auto;padding:14px">'+banner+resumen+
      (rows.length?filas:'<div class="muted" style="text-align:center;padding:30px">No hay pedidos de hoy.</div>')+
    '</div>';
  document.body.appendChild(ov);
}
function cerrarChequeoDesc(){ const o=document.getElementById("chkDescOverlay"); if(o) o.remove(); }
function pantallaEntregas(){
  const arr=entregadosEn(ENT_DESDE,ENT_HASTA);
  const porEmp={}; arr.forEach(x=>{ const e=empresaObj(x.p.empresa).nombre; porEmp[e]=(porEmp[e]||0)+1; });
  const chips=Object.entries(porEmp).map(([e,n])=>`<span class="chip">${esc(e)}: ${n}</span>`).join(" ");
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='pedidos';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Resumen de entregas</div>
    <div class="subtitle">Lo que se entregó y a quién</div>
    <div class="card" style="margin:14px 0">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input type="date" value="${ENT_DESDE}" onchange="ENT_DESDE=this.value;pantallaEntregas()" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input type="date" value="${ENT_HASTA}" onchange="ENT_HASTA=this.value;pantallaEntregas()" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)"></div>
      </div>
      ${(ENT_DESDE||ENT_HASTA)?`<button class="btn sm ghost" style="margin-top:10px" onclick="ENT_DESDE='';ENT_HASTA='';pantallaEntregas()">Ver todo</button>`:`<div class="hint" style="margin-top:8px">Mostrando todas. Elegí un rango para filtrar por fecha.</div>`}
    </div>
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <b>${arr.length} entrega${arr.length===1?'':'s'}</b>
      ${arr.length?`<button class="btn sm green" onclick="enviarInformeWA()">Enviar por WhatsApp</button>
      <button class="btn sm ghost" onclick="imprimirEntregas()">${icon('printer')} PDF (imprimir/guardar)</button>`:''}
    </div>
    ${chips?`<div style="margin-bottom:12px">${chips}</div>`:''}
    ${arr.length?arr.map(x=>{ const p=x.p; return `
      <div class="card" style="margin-bottom:10px;padding:14px 16px">
        <div class="row" style="justify-content:space-between;align-items:baseline;gap:10px">
          <span style="font-weight:600;min-width:0">${esc(p.cliente||'—')} <span class="muted" style="font-weight:400;font-size:13px">· N° ${esc(numOrden(p))}</span></span>
          <span class="muted" style="font-size:13px;white-space:nowrap">${new Date(x.fe).toLocaleDateString("es-AR")}</span>
        </div>
        <div class="muted" style="font-size:13px;margin-top:3px">${esc(empresaObj(p.empresa).nombre)} · ${p.metodo==='correo'?'Correo':'Cadete'}${p.ciudad?(' · '+esc(p.ciudad)):''}${p.cadete?(' · '+esc(p.cadete)):''}</div>
        <div class="muted" style="font-size:13px;margin-top:3px">${esc(p.items||'—')}</div>
      </div>`; }).join(""):empty('check','No hay entregas en este período.')}`;
}
const INFORME_TEL="5493571542025";   // WhatsApp donde se manda el informe (3571 54-2025)
function waNumero(tel){ const d=(tel||"").replace(/\D/g,""); if(!d) return ""; return d.startsWith("54")?d:("549"+d); }
function enviarRepartoWA(){
  const arr=soloPedidos().filter(p=>p.metodo==="cadete" && ["preparado","asignado","en_reparto"].includes(p.estado));
  if(!arr.length){ toast("No hay pedidos de cadete para repartir"); return; }
  arr.sort((a,b)=>(anilloDe(a).n==null?99:anilloDe(a).n)-(anilloDe(b).n==null?99:anilloDe(b).n));
  const hoy=new Date().toLocaleDateString("es-AR");
  let txt="Reparto Cardinal · "+hoy+" ("+arr.length+" pedidos)\n\n";
  arr.forEach(p=>{ const an=anilloDe(p);
    txt+="N° "+numOrden(p)+"  ["+an.label+"]\n"+(p.cliente||"")+"\n"+(p.dir||"")+(p.ciudad?(" - "+p.ciudad):"")+"\nTel: "+(p.tel||"-")+"\n\n"; });
  if(!CADETERIA_TEL){ const t=prompt("WhatsApp de Cardinal (con código de área, ej: 3571542025):",""); if(!t){ toast("Falta el WhatsApp de Cardinal"); return; } CADETERIA_TEL=t; }
  window.open("https://wa.me/"+waNumero(CADETERIA_TEL)+"?text="+encodeURIComponent(txt),"_blank");
}
function enviarInformeWA(){
  const arr=entregadosEn(ENT_DESDE,ENT_HASTA);
  if(!arr.length){ toast("No hay entregas para informar"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  let txt="Informe de entregas "+hoy+" ("+arr.length+" pedidos)\n\n";
  arr.forEach(x=>{ const p=x.p, an=anilloDe(p);
    txt+="- N° "+numOrden(p)+"  "+(p.cliente||"")+"  ("+an.label+(p.cadete?(" · "+p.cadete):"")+")\n"; });
  window.open("https://wa.me/"+INFORME_TEL+"?text="+encodeURIComponent(txt),"_blank");
}
function imprimirEntregas(){
  const arr=entregadosEn(ENT_DESDE,ENT_HASTA);
  if(!arr.length){ toast("No hay entregas en este período"); return; }
  const w=window.open("","_blank","width=900,height=920"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  const fc=ts=>new Date(ts).toLocaleDateString("es-AR");
  const periodo=(ENT_DESDE||ENT_HASTA)?("Período: "+(ENT_DESDE?fc(new Date(ENT_DESDE+"T00:00:00").getTime()):"inicio")+" a "+(ENT_HASTA?fc(new Date(ENT_HASTA+"T00:00:00").getTime()):"hoy")):"Período: todo";
  const porEmp={}; arr.forEach(x=>{ const e=empresaObj(x.p.empresa).nombre; porEmp[e]=(porEmp[e]||0)+1; });
  const resumen=Object.entries(porEmp).map(([e,n])=>e+": "+n).join(" · ");
  const filas=arr.map((x,i)=>{ const p=x.p; return `<tr><td class="c">${i+1}</td><td>${fc(x.fe)}</td><td>${esc(p.cliente||'—')}</td><td>${esc(empresaObj(p.empresa).nombre)}</td><td>${esc((p.ciudad||'')+(p.provincia?(', '+p.provincia):''))}</td><td>${p.metodo==='correo'?'Correo':'Cadete'}</td><td>${esc(p.items||'—')}</td></tr>`; }).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Entregas</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:20px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:11.5px}'+
    'th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{background:#2c3e50;color:#fff}'+
    '.c{text-align:center}tbody tr:nth-child(even) td{background:#f2f4f7}@page{size:A4 landscape;margin:12mm}</style></head><body>'+
    '<h1>Resumen de entregas</h1><p>'+periodo+' · '+arr.length+' entregas · '+resumen+'</p>'+
    '<table><thead><tr><th class="c">#</th><th>Fecha</th><th>Cliente</th><th>Empresa</th><th>Destino</th><th>Método</th><th>Productos</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
/* Comprobante: lo que el gestor preparó y le entrega al cadete (con firma) */
function imprimirComprobante(){
  const arr=soloPedidos().filter(p=>p.cadete && ["asignado","en_reparto"].includes(p.estado));   // solo pendientes de reparto
  if(!arr.length){ toast("No hay pedidos asignados a un cadete todavía"); return; }
  const byCad={}; arr.forEach(p=>{ (byCad[p.cadete]=byCad[p.cadete]||[]).push(p); });
  const hoy=new Date().toLocaleDateString("es-AR");
  const secciones=Object.entries(byCad).map(([cad,peds])=>{
    const filas=peds.map((p,i)=>{ const an=anilloDe(p); const nItems=parseItems(p.items).reduce((s,it)=>s+(it.cant||1),0);
      return `<tr><td class="c">${i+1}</td><td>${esc(numOrden(p))}</td><td>${esc(p.cliente||'—')}</td><td>${esc(an.label)}</td><td>${esc((p.ciudad||'')+(p.provincia?(', '+p.provincia):''))}</td><td class="c">${nItems}</td><td></td></tr>`; }).join("");
    return `<div class="hoja"><h1>Comprobante de entrega al cadete</h1>
      <p>Fecha: ${hoy} · Cadete: <b>${esc(cad)}</b> · ${peds.length} pedidos</p>
      <table><thead><tr><th class="c">#</th><th>N° orden</th><th>Cliente</th><th>Zona</th><th>Destino</th><th class="c">Bultos</th><th class="c">OK</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="firmas"><div>Entregó (gestor)<br><br>__________________</div><div>Recibí conforme (cadete)<br><br>__________________</div></div></div>`;
  }).join("");
  const w=window.open("","_blank","width=900,height=920"); if(!w){ toast("Permití las ventanas emergentes"); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Comprobante cadete</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:19px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:12px}'+
    'th,td{border:1px solid #999;padding:7px 9px;text-align:left}th{background:#2c3e50;color:#fff}'+
    '.c{text-align:center}tbody tr:nth-child(even) td{background:#f2f4f7}'+
    '.firmas{display:flex;justify-content:space-between;margin-top:26mm;font-size:12px;text-align:center}'+
    '.firmas div{width:45%}.hoja{page-break-before:always}.hoja:first-child{page-break-before:auto}@page{size:A4;margin:14mm}</style></head><body>'+
    secciones+'<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function imputacionEmp(st,desde,hasta){
  const g={};
  const minC=ultimoCierreTs();   // arranca desde el último cierre
  (st.movs||[]).filter(m=>m.empresa && (m.ts||0)>=minC && enRango(m.ts,desde,hasta)).forEach(m=>{
    const e=m.empresa;
    if(!g[e]) g[e]={empresa:e,total:0,aporte:0,canales:{},prods:{}};
    if(m.tipo==="salida"){ g[e].total+=m.cant; const c=m.canal||"?"; g[e].canales[c]=(g[e].canales[c]||0)+m.cant; g[e].prods[m.prod]=(g[e].prods[m.prod]||0)+m.cant; }
    else if(m.tipo==="entrada"){ g[e].aporte+=m.cant; }
  });
  return Object.values(g).map(x=>({...x, saldo:x.total-x.aporte})).sort((a,b)=>b.total-a.total);
}
/* Cuenta corriente: retiros (debe) y aportes (haber) de una empresa, con saldo neto en unidades */
function cuentaCorriente(st,empresa,desde,hasta){
  const movs=(st.movs||[]).filter(m=>m.empresa===empresa && (m.tipo==="salida"||m.tipo==="entrada") && enRango(m.ts,desde,hasta))
    .sort((a,b)=>a.ts-b.ts);
  const retiro=movs.filter(m=>m.tipo==="salida").reduce((s,m)=>s+m.cant,0);
  const aporte=movs.filter(m=>m.tipo==="entrada").reduce((s,m)=>s+m.cant,0);
  return { movs, retiro, aporte, saldo:retiro-aporte };
}
/* Entradas/salidas de un producto (salidas separadas por empresa) */
function flujoProducto(prod, st){
  let ent=0,sal=0; const porEmp={};
  (st.movs||[]).filter(m=>m.prod===prod).forEach(m=>{
    if(m.tipo==="entrada") ent+=m.cant;
    else if(m.tipo==="salida"){ sal+=m.cant; if(m.empresa) porEmp[m.empresa]=(porEmp[m.empresa]||0)+m.cant; }
  });
  return {ent,sal,porEmp};
}
/* Imprime en A4: planilla de stock (entró/retiró por empresa/quedan) + cuenta corriente por empresa */
function imprimirStock(){
  const st=stockState();
  const w=window.open("","_blank","width=860,height=920");
  if(!w){ toast("Permití las ventanas emergentes"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  const fc=ts=>new Date(ts).toLocaleDateString("es-AR");
  // --- Planilla de stock (estado real, sin filtro de fecha) ---
  const prods=PRODUCTOS.slice();   // todos los productos del catálogo
  const thEmp=EMPRESAS.map(e=>`<th class="c">Retiró ${esc(e.nombre.split(" ")[0])}</th>`).join("");
  const filasGen=prods.map(p=>{ const f=flujoProducto(p.nombre,st), q=nivel(p.nombre,st);
    const tdEmp=EMPRESAS.map(e=>`<td class="c">${f.porEmp[e.id]||0}</td>`).join("");
    return `<tr><td>${esc(p.nombre)}</td><td class="c">${f.ent}</td>${tdEmp}<td class="c b">${q}</td></tr>`; }).join("")
    || `<tr><td colspan="${EMPRESAS.length+3}" class="c">Sin movimientos todavía.</td></tr>`;
  const planilla=`<div class="hoja"><h1>Planilla de stock</h1>
    <p>Fecha: ${hoy} · Stock compartido (lo pone ${esc(empresaObj(STOCK_DUENO).nombre)})</p>
    <table><thead><tr><th>Producto</th><th class="c">Entró</th>${thEmp}<th class="c">Quedan</th></tr></thead>
    <tbody>${filasGen}</tbody></table></div>`;
  // --- Cuenta corriente por empresa (filtrada por período) ---
  const periodo=(STOCK_DESDE||STOCK_HASTA)
    ? `Período: ${STOCK_DESDE?fc(new Date(STOCK_DESDE+"T00:00:00").getTime()):"inicio"} a ${STOCK_HASTA?fc(new Date(STOCK_HASTA+"T00:00:00").getTime()):"hoy"}`
    : "Período: todo";
  const cuentas=EMPRESAS.map(e=>{
    const cc=cuentaCorriente(st,e.id,STOCK_DESDE,STOCK_HASTA);
    const esDueno=e.id===STOCK_DUENO;
    const filas=cc.movs.map(m=>`<tr><td>${fc(m.ts)}</td><td>${m.tipo==="entrada"?"Aporte":"Retiro"}</td><td>${esc(m.prod)}</td><td>${esc(m.ref||m.motivo||"—")}</td><td class="c b">${m.tipo==="entrada"?"−":"+"}${m.cant}</td></tr>`).join("")
      || `<tr><td colspan="5" class="c">Sin movimientos en este período.</td></tr>`;
    const cab=esDueno?"Stock propio":`A pagar a ${esc(empresaObj(STOCK_DUENO).nombre)}`;
    const pieRetiro=`<tr><td colspan="4" style="text-align:right">Retiró</td><td class="c">${cc.retiro}</td></tr>`;
    const pieAporte=cc.aporte?`<tr><td colspan="4" style="text-align:right">Aportó</td><td class="c">−${cc.aporte}</td></tr>`:"";
    const pieSaldo=esDueno?"":`<tr><td colspan="4" style="text-align:right;font-weight:bold">SALDO A PAGAR A ${esc(empresaObj(STOCK_DUENO).nombre.split(" ")[0]).toUpperCase()}</td><td class="c b">${cc.saldo}</td></tr>`;
    return `<div class="hoja"><h1>Cuenta corriente — ${esc(e.nombre)}</h1>
      <p>${periodo} · ${cab}</p>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Pedido / motivo</th><th class="c">Unidades</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>${pieRetiro}${pieAporte}${pieSaldo}</tfoot></table></div>`;
  }).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Stock</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:19px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}'+
    'th,td{border:1px solid #999;padding:6px 9px;text-align:left;vertical-align:top}th{background:#2c3e50;color:#fff}'+
    'tfoot td{background:#eef1f5}.c{text-align:center}.b{font-weight:bold}small{color:#666}'+
    'tbody tr:nth-child(even) td{background:#f2f4f7}'+
    '.hoja{page-break-before:always}.hoja:first-child{page-break-before:auto}@page{size:A4;margin:14mm}</style></head><body>'+
    planilla+cuentas+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function toast(m){ const t=$("#toast"); t.textContent=m; t.className="";
  const cls=/^✅/.test(m)?"ok":/^(⚠|❌)/.test(m)?"warn":"";
  if(cls) t.classList.add(cls);
  t.classList.add("show");
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2600); }

/* ---- Diálogo propio: reemplaza notify()/confirm() nativos, mismo estilo que el resto de la app ---- */
function dlgIcono(m){
  if(/^✅/.test(m)) return {c:"ok",e:"✅"};
  if(/^(⚠|❌)/.test(m)) return {c:"warn",e:"⚠️"};
  if(/^(❓|¿)/.test(m)) return {c:"q",e:"❓"};
  return {c:"q",e:"ℹ️"};
}
function dlgPartes(m){
  const s=String(m==null?"":m).replace(/^(✅|⚠️|⚠|❌|❓)\s*/,"");
  const i=s.indexOf("\n\n"); const i2=i<0?s.indexOf("\n"):i;
  if(i2<0) return s.length>90 ? {t:"",b:s} : {t:s,b:""};
  if(i2>90) return {t:"",b:s};
  return {t:s.slice(0,i2), b:s.slice(i2).replace(/^\n+/,"")};
}
function dlgCerrar(ov,val){ ov.classList.remove("show");
  setTimeout(()=>ov.remove(),180); if(ov._resolve) ov._resolve(val); }
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Escape") return;
  const ov=document.querySelector(".dlg-ov.show"); if(!ov) return;
  dlgCerrar(ov,false);
});
function notify(msg){
  const ov=document.createElement("div"); ov.className="dlg-ov";
  const {c,e}=dlgIcono(msg), {t,b}=dlgPartes(msg);
  ov.innerHTML=`<div class="dlg-card">
    <div class="dlg-ico ${c}">${e}</div>
    ${t?`<div class="dlg-title">${esc(t)}</div>`:""}
    ${b?`<div class="dlg-body">${esc(b)}</div>`:""}
    <div class="dlg-acts"><button class="btn block" data-ok>Entendido</button></div>
  </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>ov.classList.add("show"));
  ov.addEventListener("click",ev=>{ if(ev.target===ov) dlgCerrar(ov); });
  ov.querySelector("[data-ok]").addEventListener("click",()=>dlgCerrar(ov));
  ov.querySelector("[data-ok]").focus();
}
