/* ============================================================
   14b-control-dia — "Control del día": todo lo que sale hoy, agrupado
   por empresa y por tipo de envío, con el estado de cada pedido y una
   lista de lo que hay que revisar. Es una pantalla de la app, así que
   se actualiza sola cada vez que se importan o cambian pedidos.
   Solo la ve el admin (está en el menú Hoy).
   ============================================================ */
let CD_EMP="";   // filtro por empresa ("" = todas)

/* Pedidos del día: los creados hoy y los que siguen activos (sin entregar), menos anulados */
function cdPedidos(){
  const hoy0=new Date(); hoy0.setHours(0,0,0,0);
  const activos=["pendiente","preparado","asignado","en_reparto","despachado","en_camino"];
  return soloPedidos().filter(p=>p.estado!=="anulado" && (p.cliente||"")!=="_PRUEBA_DIAGNOSTICO"
    && ((p.creado||0)>=hoy0.getTime() || activos.includes(p.estado)));
}
/* Tipo de envío, como lo vemos en la etiqueta */
function cdEnvio(p){
  if(p.pickit) return "Pickit";
  if(canalDe(p)==="ml_flex" && !p.etiquetaPdf && p.estado==="pendiente") return "Para mañana";
  if(p.metodo==="cadete") return "Flex · Cardinal";
  return "Correo";
}
function cdZona(p){ return cdEnvio(p)==="Flex · Cardinal"||cdEnvio(p)==="Para mañana" ? anilloDe(p).label : ""; }
function cdItems(p){ try{ return itemsPedido(p); }catch(e){ return []; } }
/* Estado para leer de un vistazo */
function cdEstado(p){
  const k=ctlEstado(p);
  return { faltan:["Falta preparar","#8a8a8e"], listos:["Preparado","var(--amber)"], camino:["En camino","var(--accent)"],
           entregados:["Entregado","var(--green)"], mal:["Con problema","var(--red)"] }[k] || ["—","#8a8a8e"];
}
/* Lo que hay que mirar de cada pedido. Devuelve una lista de textos cortos (vacía = está bien) */
function cdAlertas(p){
  const a=[]; const env=cdEnvio(p); const its=cdItems(p);
  if(p.despachoAviso && !p.despachoAvisoVisto) a.push("Avisaron un problema en el despacho");
  if(!its.length) a.push("Sin productos para descontar");
  else if(p.prodsDudosos || (p.prods||[]).some(x=>x&&x.reconocido===false)) a.push("Producto sin reconocer");
  if(env==="Flex · Cardinal" && p.cadete!=="Cardinal") a.push("Flex sin Cardinal asignado");
  if(env==="Flex · Cardinal" && /sin cadete|Correo/i.test(anilloDe(p).label)) a.push("Zona sin reconocer (CP "+(p.cp||"?")+")");
  if(env==="Para mañana") a.push("Mercado Libre todavía no generó la etiqueta");
  const hoy0=new Date(); hoy0.setHours(0,0,0,0);
  if(p.estado==="pendiente" && (p.creado||0) && p.creado<hoy0.getTime()) a.push("Pendiente desde el "+fmtFechaCorta(p.creado));
  if(p.estado==="pendiente" && p.telegramVeredicto && !p.fotoRevisada) a.push("La foto no coincide con el pedido");
  if(p.estado!=="pendiente" && !p.fotoPrep) a.push("Salió sin foto");
  if(p.estado!=="pendiente" && !p.stockBajado && descuentoActivo()) a.push("Salió sin descontar stock");
  return a;
}
function cdFiltrar(emp){ CD_EMP=emp; vistaControlDia(); }

function vistaControlDia(){
  try{ pintarSidebar(); }catch(e){ logErr("auto",e); }
  const todos=cdPedidos();
  const peds=todos.filter(p=>!CD_EMP || p.empresa===CD_EMP);
  const empresas=[...new Set(todos.map(p=>p.empresa))].sort((a,b)=>nombreEmp(a).localeCompare(nombreEmp(b)));
  const GR=["Flex · Cardinal","Correo","Pickit","Para mañana"];
  const cuenta=f=>peds.filter(f).length;
  const unidades=peds.reduce((s,p)=>s+cdItems(p).reduce((t,i)=>t+(+i.cant||0),0),0);
  const conAlerta=peds.filter(p=>cdAlertas(p).length);
  const salenHoy=peds.filter(p=>cdEnvio(p)!=="Para mañana");
  const preparados=salenHoy.filter(p=>p.estado!=="pendiente").length;

  // empresa × envío
  const filaEmp=(nombre,arr)=>`<tr${nombre==="Total"?' style="font-weight:800"':''}><td>${esc(nombre)}</td>${GR.map(g=>`<td style="text-align:right">${arr.filter(p=>cdEnvio(p)===g).length||"·"}</td>`).join("")}<td style="text-align:right;font-weight:800">${arr.length}</td></tr>`;
  const tablaEmp=`<table class="tbl2"><tr style="color:var(--text-2);font-size:11px"><td>EMPRESA</td>${GR.map(g=>`<td style="text-align:right">${esc(g.toUpperCase())}</td>`).join("")}<td style="text-align:right">TOTAL</td></tr>
    ${empresas.filter(e=>!CD_EMP||e===CD_EMP).map(e=>filaEmp(nombreEmp(e), peds.filter(p=>p.empresa===e))).join("")}
    ${(!CD_EMP && empresas.length>1)?filaEmp("Total",peds):""}</table>`;

  // Cardinal por zona
  const flex=peds.filter(p=>cdEnvio(p)==="Flex · Cardinal");
  const zonas=[...new Set(flex.map(p=>anilloDe(p).label))];
  const ordenZ=["CABA","Zona 1","Zona 2","Zona 3"];
  zonas.sort((a,b)=>(ordenZ.indexOf(a)<0?9:ordenZ.indexOf(a))-(ordenZ.indexOf(b)<0?9:ordenZ.indexOf(b)));
  const tablaZonas=flex.length?`<table class="tbl2"><tr style="color:var(--text-2);font-size:11px"><td>ZONA</td>${empresas.filter(e=>!CD_EMP||e===CD_EMP).map(e=>`<td style="text-align:right">${esc(nombreEmp(e).toUpperCase())}</td>`).join("")}<td style="text-align:right">PEDIDOS</td></tr>
    ${zonas.map(z=>{ const zs=flex.filter(p=>anilloDe(p).label===z); const mala=/sin cadete|Correo/i.test(z);
      return `<tr><td${mala?' style="color:var(--red);font-weight:700"':''}>${esc(mala?z+" · revisar":z)}</td>${empresas.filter(e=>!CD_EMP||e===CD_EMP).map(e=>`<td style="text-align:right">${zs.filter(p=>p.empresa===e).length||"·"}</td>`).join("")}<td style="text-align:right;font-weight:800">${zs.length}</td></tr>`; }).join("")}</table>`
    :`<div class="muted" style="font-size:13px">No hay pedidos Flex.</div>`;

  // Qué juntar (lo que sale hoy y todavía falta preparar)
  const prods={};
  salenHoy.filter(p=>p.estado==="pendiente").forEach(p=>cdItems(p).forEach(it=>{ const k=it.prodNombre||it.nombre; if(!prods[k]) prods[k]={}; prods[k][p.empresa]=(prods[k][p.empresa]||0)+(+it.cant||0); }));
  const filasProd=Object.entries(prods).map(([k,v])=>[k,v,Object.values(v).reduce((s,n)=>s+n,0)]).sort((a,b)=>b[2]-a[2]||a[0].localeCompare(b[0]));
  const tablaProd=filasProd.length?`<table class="tbl2"><tr style="color:var(--text-2);font-size:11px"><td>PRODUCTO</td>${empresas.filter(e=>!CD_EMP||e===CD_EMP).map(e=>`<td style="text-align:right">${esc(nombreEmp(e).toUpperCase())}</td>`).join("")}<td style="text-align:right">TOTAL</td></tr>
    ${filasProd.map(([k,v,t])=>`<tr><td>${esc(k)}</td>${empresas.filter(e=>!CD_EMP||e===CD_EMP).map(e=>`<td style="text-align:right">${v[e]||"·"}</td>`).join("")}<td style="text-align:right;font-weight:800">${t}</td></tr>`).join("")}</table>`
    :`<div class="muted" style="font-size:13px">Nada pendiente de preparar 👍</div>`;

  // Para revisar
  const listaRevisar=conAlerta.length?conAlerta.map(p=>`<div style="padding:9px 0;border-top:.5px solid var(--border)">
      <div style="font-weight:650">${esc(p.cliente||"—")} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(numOrden(p))} · ${esc(nombreEmp(p.empresa))} · ${esc(cdEnvio(p))}</span></div>
      <div style="font-size:12.5px;color:var(--red);margin-top:2px">${cdAlertas(p).map(esc).join(" · ")}</div></div>`).join("")
    :`<div style="color:var(--green);font-weight:700;font-size:14px">✓ Nada para revisar</div>`;

  // Detalle por envío
  const detalle=GR.map(g=>{
    const ps=peds.filter(p=>cdEnvio(p)===g).sort((a,b)=>nombreEmp(a.empresa).localeCompare(nombreEmp(b.empresa))||String(cdZona(a)).localeCompare(String(cdZona(b)))||String(a.cliente||"").localeCompare(String(b.cliente||"")));
    if(!ps.length) return "";
    const conZona=g==="Flex · Cardinal"||g==="Para mañana";
    return `<div class="card" style="margin-bottom:14px">
      <div style="font-weight:800;font-size:15px;margin-bottom:6px">${esc(g)} · ${ps.length} ${ps.length===1?"pedido":"pedidos"}</div>
      <div style="overflow-x:auto"><table class="tbl2" style="min-width:560px">
        <tr style="color:var(--text-2);font-size:11px"><td>CLIENTE</td><td>EMPRESA</td>${conZona?"<td>ZONA</td>":""}<td>PRODUCTOS</td><td style="text-align:right">UNID.</td><td>ESTADO</td><td>FOTO</td></tr>
        ${ps.map(p=>{ const its=cdItems(p); const e=cdEstado(p); const al=cdAlertas(p);
          const foto=p.fotoPrep?(p.fotoRevisada?(p.telegramVeredicto?"🤖✓":"✓"):"sin revisar"):"—";
          return `<tr><td><div style="font-weight:650">${esc(p.cliente||"—")}</div><div class="muted" style="font-size:11px">${esc(numOrden(p))}${p.ciudad?" · "+esc(p.ciudad):""}</div>${al.length?`<div style="font-size:11px;color:var(--red)">⚠ ${al.map(esc).join(" · ")}</div>`:""}</td>
            <td>${esc(nombreEmp(p.empresa))}</td>${conZona?`<td>${esc(cdZona(p))}</td>`:""}
            <td style="font-size:12.5px">${its.map(i=>i.cant+"× "+esc(i.prodNombre||i.nombre)).join("<br>")||'<span style="color:var(--red)">sin productos</span>'}</td>
            <td style="text-align:right;font-weight:700">${its.reduce((s,i)=>s+(+i.cant||0),0)}</td>
            <td><span style="font-size:11.5px;font-weight:700;color:${e[1]}">${esc(e[0])}</span></td>
            <td style="font-size:12px">${foto}</td></tr>`; }).join("")}
      </table></div></div>`; }).join("");

  const hoyTxt=new Date().toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"2-digit"});
  app().innerHTML=`
    ${segOp("controldia")}
    <div class="title">Control del día</div>
    <div class="subtitle">${esc(hoyTxt)} · salen hoy ${salenHoy.length} de ${peds.length} pedidos · ${preparados} preparados · ${conAlerta.length?`<b style="color:var(--red)">${conAlerta.length} para revisar</b>`:'<b style="color:var(--green)">nada para revisar</b>'}. Se actualiza solo cuando importás o cambia un pedido.</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0 14px">
      <button class="btn sm ${CD_EMP===""?"":"ghost"}" onclick="cdFiltrar('')">Todas</button>
      ${empresas.map(e=>`<button class="btn sm ${CD_EMP===e?"":"ghost"}" onclick="cdFiltrar('${e}')">${esc(nombreEmp(e))}</button>`).join("")}
      <button class="btn sm ghost" style="margin-left:auto" onclick="pdfEtiquetasDelDia()">🏷️ PDF de etiquetas (10×15)</button>
    </div>
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="kpi"><div class="n">${peds.length}</div><div class="l">Pedidos</div></div>
      <div class="kpi"><div class="n">${unidades}</div><div class="l">Unidades</div></div>
      <div class="kpi"><div class="n">${cuenta(p=>cdEnvio(p)==="Flex · Cardinal")}</div><div class="l">Flex · Cardinal</div></div>
      <div class="kpi"><div class="n">${cuenta(p=>cdEnvio(p)==="Correo")}</div><div class="l">Correo</div></div>
      <div class="kpi"><div class="n">${cuenta(p=>cdEnvio(p)==="Pickit")}</div><div class="l">Pickit</div></div>
      <div class="kpi"><div class="n">${cuenta(p=>cdEnvio(p)==="Para mañana")}</div><div class="l">Para mañana</div></div>
    </div>
    <div class="card" style="margin-bottom:14px;${conAlerta.length?"border-color:var(--red)":""}">
      <span class="label">⚠ Para revisar antes de que salga</span>${listaRevisar}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="min-width:0"><span class="label">Pedidos por empresa y envío</span><div style="overflow-x:auto">${tablaEmp}</div></div>
      <div class="card" style="min-width:0"><span class="label">Cardinal por zona</span><div style="overflow-x:auto">${tablaZonas}</div></div>
    </div>
    <div class="card" style="margin-bottom:14px"><span class="label">Qué juntar · lo que falta preparar</span><div style="overflow-x:auto">${tablaProd}</div></div>
    <div class="label" style="margin:4px 0 8px">Detalle por envío</div>
    ${detalle||'<div class="muted">No hay pedidos hoy.</div>'}`;
}
