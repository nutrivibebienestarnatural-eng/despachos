/* ============================================================
   13-catalogo — Catálogo, cupones, mínimos y lectura de etiquetas de ML
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
/* Fusiona los productos dados de alta manualmente al catálogo en memoria */
function cargarProdsExtra(){
  try{ prodsExtra().forEach(x=>{ if(x&&x.nombre && !PRODUCTOS.some(p=>p.nombre===x.nombre)) PRODUCTOS.push({nombre:x.nombre, barcode:x.barcode||""}); }); }catch(e){ logErr("auto",e); }
}
/* Le pasa al bot de Telegram (api/telegram-sync) el listado de pedidos pendientes y qué debía
   llevar cada uno, para que /api/telegram-webhook pueda mostrarlos y verificar fotos de pickeo
   sin necesitar acceso directo a Firestore. Se llama solo, cada vez que cambian los pedidos.
   OJO: solo manda los que ya aprobaste (telegramAprobado) — así Claudia nunca ve un pedido antes
   de que vos lo revisaste, por si el sistema se equivocó al importarlo (packs, cantidades, etc). */
// Pedidos creados ANTES de este momento (los que ya estaban en curso cuando se agregó el filtro de
// aprobación) se siguen mandando al bot como siempre, para no dejar a Claudia sin nada de un día
// para el otro — el filtro de "Para aprobar" rige solo para los pedidos nuevos de acá en adelante.
const TG_APROBACION_DESDE=new Date("2026-09-29T00:00:00-03:00").getTime();
function pedidoListoParaTelegram(p){ return !!(p.telegramAprobado || (p.creado||0)<TG_APROBACION_DESDE); }
async function sincronizarPedidosTelegram(){
  try{
    const aItem=p=>({ id:p.id, cliente:p.cliente||"", estado:p.estado,
      items:(()=>{ try{ return itemsPedido(p).map(it=>({nombre:it.prodNombre||it.nombre, cant:it.cant})); }catch(e){ return []; } })() });
    const todosPend=soloPedidos().filter(p=>p.estado==="pendiente");
    const pendientes=todosPend.filter(pedidoListoParaTelegram).map(aItem);
    const haceUnDia=Date.now()-24*3600*1000;
    // pedidos ya avanzados (preparado en adelante) de las últimas 24hs, para el modo "Chequear un
    // pedido" del bot — permite releer una foto de algo ya armado y avisar si en realidad está mal.
    const preparados=soloPedidos().filter(p=>p.estado!=="pendiente"&&p.estado!=="anulado"&&(p.creado||0)>=haceUnDia).map(aItem);
    // antes solo mandaba si detectaba un cambio (comparando una firma) — lo saco: es más seguro
    // mandar siempre la lista fresca cada 5 segundos que arriesgarse a un caso raro donde no se
    // detecte el cambio y el bot se quede con datos viejos sin que nadie note por qué.
    await fetch("/api/telegram-sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pedidos:pendientes,preparados})});
    // pedidos pendientes nuevos que todavía no te avisé por Telegram: te mando la lista para que
    // la mires en Control → "Para aprobar" antes de habilitarlos para el bot.
    const porAvisar=todosPend.filter(p=>!pedidoListoParaTelegram(p) && !p.telegramAvisoTs);
    if(porAvisar.length) await avisarNuevosPedidosTelegram(porAvisar);
  }catch(e){ /* sync en segundo plano: si falla, no afecta el resto de la app */ }
}
async function avisarNuevosPedidosTelegram(peds){
  for(const p of peds){ try{ await DB.update(p.id,{telegramAvisoTs:Date.now()}); }catch(e){ logErr("auto",e); } }   // marco primero: si falla el envío, no lo reintento en loop
  const lista=peds.map(p=>{
    const its=(()=>{ try{ return itemsPedido(p); }catch(_){ return []; } })();
    return "• "+(p.cliente||"—")+" — "+(its.map(x=>x.cant+"x "+x.prodNombre).join(", ")||"(sin productos)");
  }).join("\n");
  const texto="📋 "+peds.length+" pedido"+(peds.length===1?"":"s")+" nuevo"+(peds.length===1?"":"s")+" para Claudia — revisalos antes de aprobarlos:\n\n"+lista+"\n\nEntrá a Control → \"Para aprobar\" para darles el OK.";
  await enviarTelegram(texto);
}
/* Sin esto, sincronizar/revisar Telegram solo pasaba cuando cambiaba ALGÚN pedido en la base
   (disparado por el listener de Firestore) — si nada más cambiaba mientras tanto, lo que hacía
   el bot (marcar preparado, guardar una foto) quedaba sin reflejarse en la página hasta que
   pasara otra cosa. Con este chequeo cada pocos segundos, no depende de eso. */
let TG_POLL_INICIADO=false;
function iniciarPollingTelegram(){
  if(TG_POLL_INICIADO) return; TG_POLL_INICIADO=true;
  setInterval(()=>{ sincronizarPedidosTelegram(); revisarFotosTelegram(); revisarCorreccionesTelegram(); }, 5000);
}
/* Levanta las fotos que llegaron por el bot de Telegram (pickeo con IA) y las guarda en el
   pedido correspondiente — quedan igual que si alguien las hubiera subido a mano, así aparecen
   solas en Control con el veredicto de la IA como nota. */
async function revisarFotosTelegram(){
  try{
    const r=await fetch("/api/telegram-fotos"); const data=await r.json().catch(()=>({}));
    const fotos=(data&&data.fotos)||[];
    for(const f of fotos){
      const p=PEDIDOS.find(x=>x.id===f.pedidoId); if(!p) continue;   // el pedido ya no existe: lo salteo
      try{
        await guardarFotoPedido(f.pedidoId, f.foto);
        if(f.completo && p.estado==="pendiente"){
          // la IA dio todo OK: avanza sola a Preparado (descuenta stock) — sin esperar que alguien
          // la confirme a mano en Control, así el circuito por Telegram queda de punta a punta.
          await DB.update(f.pedidoId,{telegramVeredicto:f.veredicto||"", fotoRevisada:true});
          await avanzar(f.pedidoId,"preparado","Preparado automático (verificado por foto + IA vía Telegram)");
        } else {
          await DB.update(f.pedidoId,{telegramVeredicto:f.veredicto||""});
        }
      }catch(e){ console.warn("foto de Telegram no guardada:", f.pedidoId, e); }
    }
  }catch(e){ /* sync en segundo plano: si falla, no afecta el resto de la app */ }
}
/* Levanta las correcciones que el ADMIN mandó por texto desde el bot de Telegram ("✏️ Corregir este
   pedido") y las aplica al pedido — el bot no puede escribir en Firestore directamente, así que las
   deja en una cola hasta que la app (con la sesión real) las procese. Cada línea que mandó por
   Telegram se busca en el catálogo (igual que "corregir" a mano en Importar); lo que no reconoce
   queda marcado para revisar en Control, no se pierde. */
async function revisarCorreccionesTelegram(){
  try{
    const r=await fetch("/api/telegram-correcciones"); const data=await r.json().catch(()=>({}));
    const correcciones=(data&&data.correcciones)||[];
    for(const c of correcciones){
      const p=PEDIDOS.find(x=>x.id===c.pedidoId); if(!p) continue;   // el pedido ya no existe: lo salteo
      try{
        const prods=(c.items||[]).map(it=>{
          const m=mejorProducto(it.nombre);
          return { nombre: m?m.nombre:it.nombre, cant: Math.max(1,+it.cant||1), sku:"", reconocido: !!m, noPack:true };
        });
        const items=prods.map(x=>x.cant+"x "+x.nombre).join(" · ");
        await DB.update(c.pedidoId,{prods, items, prodsDudosos: prods.some(x=>!x.reconocido)});
      }catch(e){ console.warn("corrección de Telegram no aplicada:", c.pedidoId, e); }
    }
  }catch(e){ /* sync en segundo plano: si falla, no afecta el resto de la app */ }
}
/* Agregar un producto nuevo al catálogo (se guarda en la nube) */
function prodsExtra(){ const r=PEDIDOS.find(p=>p.tipo==="prodsExtra"); return (r&&r.lista)||[]; }
/* ===== DATOS DE PRUEBA: 3 compras realistas para probar el circuito ===== */
async function crearComprasPrueba(){
  if(!await askConfirm("Voy a crear 3 pedidos de PRUEBA:\n\n• Tienda Nube (CABA, cadete) — 2 productos\n• ML Flex (CABA, cadete) — 1 producto\n• ML Correo (interior) — 1 pack x3\n\nSon para que pruebes preparar/escanear/despachar. Después los borrás con un botón. ¿Dale?")) return;
  const base={tipo:"pedido", estado:"pendiente", creado:Date.now(), esPrueba:true, tel:"1122334455",
    eventos:[{estado:"pendiente",ts:Date.now(),nota:"Pedido de PRUEBA"}]};
  // 1) Tienda Nube - CABA - 2 productos simples
  await DB.create(Object.assign({},base,{ empresa:"labs", canal:"tiendanube", ref:"#PRUEBA-TN",
    cliente:"🧪 PRUEBA Tienda Nube", dir:"Av. Corrientes 1234", ciudad:"Balvanera", provincia:"CABA", cp:"1043",
    metodo:"cadete", origen:"bsas", items:"1x Creatina (90 capsulas) · 2x Omega 3 (60 capsulas)",
    prods:[{nombre:"Creatina (90 capsulas)",cant:1},{nombre:"Omega 3 (60 capsulas)",cant:2}] }));
  // 2) ML Flex - CABA - 1 producto (cadete)
  await DB.create(Object.assign({},base,{ empresa:"nutrivibe", canal:"ml_flex", ref:"#PRUEBA-FLEX",
    cliente:"🧪 PRUEBA ML Flex", dir:"Thames 575", ciudad:"Villa Crespo", provincia:"CABA", cp:"1414",
    metodo:"cadete", origen:"bsas", items:"1x Ashwagandha 100% Pura - Estrés, Insomnio, Fatiga (60 Capsulas)",
    prods:[{nombre:"Ashwagandha 100% Pura - Estrés, Insomnio, Fatiga (60 Capsulas)",cant:1,sku:"ASHW"}] }));
  // 3) ML Correo - interior - 1 pack x3
  await DB.create(Object.assign({},base,{ empresa:"nutrivibe", canal:"ml_flex", ref:"#PRUEBA-CORREO",
    cliente:"🧪 PRUEBA ML Correo", dir:"Via del Sol 1152", ciudad:"San Luis", provincia:"San Luis", cp:"5700",
    metodo:"correo", correo:"Correo Argentino", origen:"bsas", items:"1x Pack X 3 - Multimagnesio 5 En 1",
    prods:[{nombre:"Pack X 3 - Multimagnesio 5 En 1",cant:1,sku:"0714604143758",nomML:"Pack X 3 - Multimagnesio 5 En 1"}] }));
  toast("✓ 3 compras de prueba creadas");
  OPVIEW="hoy"; vistaOperador();
}
/* 5 pedidos de prueba combinando AKG / NMN / ZMA, para probar el bot de Telegram del pickeo
   (detección de a quién corresponde la foto + comparación de productos). Quedan marcados
   esPrueba:true, así los borra el mismo botón "Borrar compras de prueba". */
async function crearPedidosPruebaTelegram(){
  if(!await askConfirm("Voy a crear 5 pedidos de PRUEBA combinando AKG / NMN / ZMA, para probar el bot de Telegram. Después los borrás con \"Borrar compras de prueba\". ¿Dale?")) return;
  const base={tipo:"pedido", empresa:"nutrivibe", canal:"ml_flex", estado:"pendiente", esPrueba:true,
    dir:"Depósito de prueba", ciudad:"CABA", provincia:"CABA", tel:"", metodo:"cadete", origen:"bsas"};
  const datos=[
    {cliente:"🧪 PRUEBA - Ana Gómez",   prods:[{nombre:"AKG",cant:2},{nombre:"NMN",cant:1}]},
    {cliente:"🧪 PRUEBA - Bruno Díaz",  prods:[{nombre:"ZMA",cant:1},{nombre:"NMN",cant:1}]},
    {cliente:"🧪 PRUEBA - Carla Ruiz",  prods:[{nombre:"AKG",cant:3}]},
    {cliente:"🧪 PRUEBA - Diego Paz",   prods:[{nombre:"AKG",cant:1},{nombre:"ZMA",cant:1},{nombre:"NMN",cant:1}]},
    {cliente:"🧪 PRUEBA - Elena Sosa",  prods:[{nombre:"ZMA",cant:2}]},
  ];
  for(const d of datos){
    const items=d.prods.map(p=>p.cant+"x "+p.nombre).join(" · ");
    const ts=Date.now();
    await DB.create(Object.assign({},base,{ cliente:d.cliente, items, prods:d.prods, creado:ts,
      eventos:[{estado:"pendiente",ts,nota:"Pedido de PRUEBA (Telegram) creado"}] }));
  }
  toast("✓ 5 pedidos de prueba creados");
  OPVIEW="hoy"; vistaOperador();
}
async function borrarComprasPrueba(){
  const pruebas=PEDIDOS.filter(p=>p.esPrueba);
  if(!pruebas.length){ toast("No hay compras de prueba"); return; }
  if(!await askConfirm("Borrar las "+pruebas.length+" compras de prueba? (no afecta tus pedidos reales)",{yes:"Borrar"})) return;
  for(const p of pruebas){ try{ await DB.delete(p.id); }catch(e){ logErr("auto",e); } }
  toast("✓ Compras de prueba borradas");
  OPVIEW="hoy"; vistaOperador();
}
function verPacksAprendidos(){
  const map=packsMap(); const keys=Object.keys(map);
  const cont=keys.length? keys.map(k=>{ const d=map[k];
    const comps=(d.comps||[]).map(c=>c.cant+"× "+esc(c.prod)).join(", ");
    return `<div class="card" style="margin-bottom:8px">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="min-width:0">
          <b style="font-size:14px">${esc(d.nombre||d.sku||k)}</b>
          ${d.sku?`<div class="muted" style="font-size:11px">SKU ${esc(d.sku)}</div>`:''}
          <div style="font-size:13px;color:var(--accent);margin-top:4px">📦 descuenta: ${comps||'(nada)'}</div>
        </div>
        <button class="btn sm ghost" style="color:var(--red);flex:0 0 auto" onclick="borrarPackAprendido('${encodeURIComponent(k)}')">Borrar</button>
      </div>
    </div>`; }).join("")
    : `<div class="card"><div class="muted" style="text-align:center;padding:20px">Todavía no enseñaste ningún pack.</div></div>`;
  app().innerHTML=`
    ${segOp('stock')}
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver a Stock</button>
    <div class="title" style="margin-top:14px">Packs aprendidos</div>
    <div class="subtitle">Lo que el sistema aprendió a descontar por cada pack. Si alguno está mal, borralo y volvé a enseñarlo al importar.</div>
    ${cont}`;
}
async function borrarPackAprendido(encKey){
  const k=decodeURIComponent(encKey);
  if(!await askConfirm("¿Borrar este pack aprendido? La próxima vez que importes una venta con ese SKU te va a preguntar de nuevo qué descuenta.",{yes:"Borrar"})) return;
  await olvidarPack(k);
  toast("Pack borrado ✓ Se va a re-preguntar al importar");
  verPacksAprendidos();
}
async function agregarProductoNuevo(){
  const nombre=prompt("Nombre del producto nuevo (tal cual lo querés ver):");
  if(!nombre||!nombre.trim()) return;
  const n=nombre.trim();
  if(PRODUCTOS.some(p=>p.nombre.toLowerCase()===n.toLowerCase())){ toast("Ese producto ya existe"); return; }
  const codigo=prompt("Código de barras / SKU (opcional, dejalo vacío si no tenés):","")||"";
  // marca dueña del producto (a qué depósito pertenece)
  let marca=DEPOSITO_ACTIVO||"labs";
  const opts=EMPRESAS.map((e,i)=>(i+1)+") "+e.nombre).join("\n");
  const rM=prompt("¿De qué marca es este producto? (a qué depósito va)\n\n"+opts+"\n\nPoné el número:", String(EMPRESAS.findIndex(e=>e.id===marca)+1||1));
  const idx=parseInt(rM,10)-1; if(EMPRESAS[idx]) marca=EMPRESAS[idx].id;
  const cantIni=prompt("¿Cuántas unidades cargás ahora? (0 si no querés cargar todavía)","0");
  const cant=parseInt(cantIni,10)||0;
  const r=PEDIDOS.find(p=>p.tipo==="prodsExtra");
  const nuevo={nombre:n, barcode:codigo.trim()};
  const lista=((r&&r.lista)||[]).concat([nuevo]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"prodsExtra",lista});
  await setMarcaProducto(n, marca);                       // guarda a qué depósito pertenece
  PRODUCTOS.push(nuevo);                                  // disponible al toque
  if(cant>0) await pushMov(n,"entrada",cant,"Alta de producto");
  toast("Producto agregado ✓"+(cant>0?(" · +"+cant):""));
  vistaStock();
}
/* ===== CUPONES DE FIDELIZACIÓN: registro de a quién le diste el 10% OFF ===== */
const CODIGO_FIEL="FIEL10";
function cuponesRecord(){ return PEDIDOS.find(p=>p.tipo==="cupones"); }
function cuponesLista(){ const r=cuponesRecord(); return ((r&&r.lista)||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0)); }
async function cuponAgregar(c){
  const r=cuponesRecord(); const lista=((r&&r.lista)||[]).concat([c]);
  if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"cupones",lista});
}
async function cuponEditar(id, patch){
  const r=cuponesRecord(); if(!r) return;
  const lista=(r.lista||[]).map(c=>c.id===id?Object.assign({},c,patch):c);
  await DB.update(r.id,{lista});
}
async function cuponBorrar(id){
  const r=cuponesRecord(); if(!r) return;
  await DB.update(r.id,{lista:(r.lista||[]).filter(c=>c.id!==id)});
}
function vistaCupones(){
  const lista=cuponesLista();
  const pendientes=lista.filter(c=>!c.usado).length;
  const usados=lista.filter(c=>c.usado).length;
  app().innerHTML=`
    ${segOp('stock')}
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver a Stock</button>
    <div class="title" style="margin-top:14px">Cupones de fidelización</div>
    <div class="subtitle">Registrá a quién le diste el 10% OFF. Código: <b>${CODIGO_FIEL}</b> (se aplica solo en tu Tienda Nube).</div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border)">
        <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800">${lista.length}</div><div class="muted" style="font-size:11px">Entregados</div></div>
        <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:var(--amber)">${pendientes}</div><div class="muted" style="font-size:11px">Sin usar</div></div>
        <div style="background:var(--bg-2);padding:14px 16px"><div style="font-size:22px;font-weight:800;color:var(--green)">${usados}</div><div class="muted" style="font-size:11px">Ya usaron</div></div>
      </div>
    </div>
    <button class="btn block" style="margin-bottom:12px;background:var(--accent);color:#fff" onclick="nuevoCupon()">➕ Registrar cliente que pidió el cupón</button>
    ${lista.length? lista.map(c=>`
      <div class="card" style="margin-bottom:8px">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="min-width:0">
            <b style="font-size:14px">${esc(c.nombre||'—')}</b>
            ${c.usado?'<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;background:#1d9e7522;color:var(--green);margin-left:6px">✓ USÓ</span>':'<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;background:#e0b00022;color:#b58600;margin-left:6px">PENDIENTE</span>'}
            <div class="muted" style="font-size:11px;margin-top:2px">${c.tel?esc(c.tel)+' · ':''}${c.ts?new Date(c.ts).toLocaleDateString("es-AR"):''}${c.nota?' · '+esc(c.nota):''}</div>
          </div>
          <div class="row" style="gap:6px;flex:0 0 auto">
            ${!c.usado?`<button class="btn sm" style="background:var(--green);color:#fff" onclick="marcarCuponUsado('${c.id}')">Marcar usado</button>`:`<button class="btn sm ghost" onclick="marcarCuponUsado('${c.id}',true)">Deshacer</button>`}
            <button class="btn sm ghost" style="color:var(--red)" onclick="borrarCupon('${c.id}')">✕</button>
          </div>
        </div>
      </div>`).join("")
    : `<div class="card"><div class="muted" style="text-align:center;padding:20px">Todavía no registraste ningún cupón. Cuando un cliente te escriba por el QR, anotalo acá.</div></div>`}`;
}
async function nuevoCupon(){
  const nombre=prompt("Nombre del cliente que pidió el 10% OFF:");
  if(!nombre||!nombre.trim()) return;
  const tel=prompt("Teléfono / WhatsApp (opcional):","")||"";
  await cuponAgregar({id:"c"+Date.now(), nombre:nombre.trim(), tel:tel.trim(), ts:Date.now(), usado:false, nota:""});
  toast("Cliente registrado ✓");
  vistaCupones();
}
async function marcarCuponUsado(id, deshacer){
  await cuponEditar(id, {usado:!deshacer, usadoTs:deshacer?null:Date.now()});
  toast(deshacer?"Marcado como pendiente":"✓ Marcado como usado");
  vistaCupones();
}
async function borrarCupon(id){
  if(!await askConfirm("¿Borrar este registro de cupón?",{yes:"Borrar",danger:true})) return;
  await cuponBorrar(id); toast("Borrado"); vistaCupones();
}
/* Sugiere mínimos según el promedio de ventas: cubre 15 días, sobre todo el historial */
function calcularMinimosSugeridos(){
  const st=stockState();
  const salidas=(st.movs||[]).filter(m=>m.tipo==="salida");
  if(!salidas.length) return [];
  // rango real de datos (primera y última salida) para saber cuántos días abarca el historial
  const tsList=salidas.map(m=>m.ts||0).filter(Boolean);
  const primero=Math.min(...tsList), ultimo=Math.max(...tsList);
  const dias=Math.max(1,(ultimo-primero)/86400000);   // días que abarca el historial
  // total vendido por producto
  const porProd={};
  salidas.forEach(m=>{ porProd[m.prod]=(porProd[m.prod]||0)+m.cant; });
  const res=[];
  Object.entries(porProd).forEach(([prod,total])=>{
    const porDia=total/dias;
    const sugerido=Math.max(1, Math.ceil(porDia*15));   // cubre 15 días
    const actualMin=minDe(prod,st);
    const stkActual=nivel(prod,st);
    res.push({prod, total, porDia, sugerido, actualMin, stkActual});
  });
  return res.sort((a,b)=>b.total-a.total);
}
function REP_MIN(){ return REP_MIN_LISTA||[]; }
let REP_MIN_LISTA=null;
function vistaMinimos(){
  REP_MIN_LISTA=calcularMinimosSugeridos();
  const lista=REP_MIN_LISTA;
  app().innerHTML=`
    ${segOp('stock')}
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver a Stock</button>
    <div class="title" style="margin-top:14px">Mínimos sugeridos</div>
    <div class="subtitle">Calculado según tus ventas: el mínimo cubre <b>15 días</b> de venta promedio. Revisá y aplicá si te parece bien.</div>
    ${!lista.length?`<div class="card"><div class="muted" style="text-align:center;padding:24px">Todavía no hay ventas registradas para calcular. Cuando despaches, vuelvo a calcular.</div></div>`:`
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:520px">
        <thead><tr>
          <th style="text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-3);padding:10px 8px">Producto</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;color:var(--text-3);padding:10px 8px">Vendido total</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;color:var(--text-3);padding:10px 8px">Mín. actual</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;color:var(--accent);padding:10px 8px">Mín. sugerido</th>
        </tr></thead>
        <tbody>${lista.map(r=>`<tr style="border-top:.5px solid var(--border)">
          <td style="padding:10px 8px;font-size:13.5px">${esc(r.prod)}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;color:var(--text-2)">${r.total}</td>
          <td style="padding:10px 8px;text-align:right;font-size:13px;color:var(--text-2)">${r.actualMin}</td>
          <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:15px;color:var(--accent)">${r.sugerido}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <button class="btn block green" onclick="aplicarMinimosSugeridos()">✓ Aplicar estos ${lista.length} mínimos</button>
    <div class="hint" style="margin-top:8px;text-align:center">Al aplicar, se guardan como el mínimo de cada producto. Después el sistema te avisa cuando reponer.</div>`}`;
}
async function aplicarMinimosSugeridos(){
  const lista=REP_MIN();
  if(!lista.length) return;
  if(!await askConfirm("¿Aplicar los "+lista.length+" mínimos sugeridos?\n\nSe van a guardar como el mínimo de cada producto. Podés cambiarlos después a mano.")) return;
  const st=stockState(); const min={...(st.min||{})};
  lista.forEach(r=>{ min[r.prod]=r.sugerido; });
  st.min=min; await persistStock(st);
  toast("✓ "+lista.length+" mínimos aplicados");
  OPVIEW="stock"; render();
}
function vistaStock(){
  const st=stockState(), pick=pickingConsolidado();
  const desc=st.descontar!==false;
  const imp=imputacion(st);
  const impE=imputacionEmp(st,STOCK_DESDE,STOCK_HASTA);
  const q=(STOCK_Q||"").toLowerCase().trim();
  const rows=PRODUCTOS.map((p,i)=>{ const stk=nivel(p.nombre,st), mn=minDe(p.nombre,st), d=demandaDe(p,pick);
    const tieneMov=(st.movs||[]).some(m=>m.prod===p.nombre);
    return {p,i,stk,mn,d,rep:pedirDe(p.nombre,st),tieneMov, marca:marcaDeProducto(p.nombre)}; })
    .filter(r=> !DEPOSITO_ACTIVO || r.marca===DEPOSITO_ACTIVO )
    .filter(r=> (q ? r.p.nombre.toLowerCase().includes(q) : (STOCK_TODOS||r.tieneMov)) );   // por defecto solo los cargados; buscador o "ver todos" muestran el resto
  const reponer=rows.filter(r=>r.rep>0);
  const movs=(st.movs||[]).slice(-12).reverse();
  const inp="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  const grid="display:grid;grid-template-columns:1fr 56px 56px 44px 60px;gap:8px;align-items:center;padding:9px 0;border-top:.5px solid var(--border)";
  app().innerHTML=`
    ${segOp('stock')}
    <div class="muted" style="font-size:11.5px;margin-bottom:8px">Versión ${APP_VERSION} · Registro de stock: ${(stockRecord()&&stockRecord().id)?esc(String(stockRecord().id).slice(-6)):'—'} · ${((stockRecord()||{}).movs||[]).length} movimientos</div>
    ${stockDuplicados()>1?`<div class="card" style="margin-bottom:14px;border:1.5px solid var(--red);background:#fdf1f1">
      <div style="font-weight:700;color:var(--red)">⚠️ Hay ${stockDuplicados()} registros de stock duplicados</div>
      <div class="hint" style="margin:6px 0 10px">Por eso puede que veas el stock en 0. Tocá el botón y los junto en uno solo (no se pierde nada).</div>
      <button class="btn block" onclick="repararStock()">🔧 Reparar stock ahora</button>
    </div>`:''}
    <div class="title">Stock</div>
    <div class="subtitle">${rows.length} ${(STOCK_TODOS||q)?'productos':'productos cargados'} · ${reponer.length} por reponer</div>
    <div class="seg" style="margin-bottom:12px">
      <button class="${!DEPOSITO_ACTIVO?'on':''}" onclick="DEPOSITO_ACTIVO='';vistaStock()">Todos</button>
      ${EMPRESAS.map(e=>`<button class="${DEPOSITO_ACTIVO===e.id?'on':''}" onclick="DEPOSITO_ACTIVO='${e.id}';vistaStock()">${esc(e.nombre.split(" ")[0])}</button>`).join("")}
    </div>
    <input id="stockQtop" autocomplete="off" placeholder="🔍 Buscá un producto (ej: multimagnesio)…" value="${esc(STOCK_Q||'')}" oninput="STOCK_Q=this.value;clearTimeout(window.__sq);window.__sq=setTimeout(vistaStock,250)" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:12px;font:inherit;font-size:16px;background:var(--bg);margin-bottom:12px;box-shadow:var(--sh-sm)">
    ${q?`<div class="card" style="margin-bottom:16px;border:1px solid var(--accent)">
      <span class="label">Resultado de "${esc(STOCK_Q)}"</span>
      ${rows.length? rows.map(r=>`<div class="row" style="justify-content:space-between;align-items:center;padding:8px 0;border-top:.5px solid var(--border)">
        <span style="font-size:14px;min-width:0">${esc(r.p.nombre)}</span>
        <b style="font-size:20px;flex:0 0 auto;margin-left:10px;color:${r.stk<=0?'var(--red)':(r.mn>0&&r.stk<r.mn?'var(--amber)':'var(--text)')}">${r.stk}</b>
      </div>`).join("") : `<div class="muted" style="padding:12px 0;text-align:center">No encontré ningún producto con ese nombre.</div>`}
    </div>`:''}
    <div class="row" style="margin:-4px 0 12px">
      <button class="btn sm ghost" onclick="STOCK_TODOS=!STOCK_TODOS;vistaStock()">${STOCK_TODOS?'Ver solo los cargados':'Ver todos los del catálogo'}</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <span class="label">Registrar movimiento</span>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <select id="mvProd" style="${inp};flex:1;min-width:150px">${PRODUCTOS.map(p=>`<option>${esc(p.nombre)}</option>`).join("")}</select>
        <select id="mvTipo" style="${inp};width:110px"><option value="entrada">Entrada</option><option value="salida">Salida</option></select>
        <input id="mvCant" type="number" inputmode="numeric" placeholder="Cant." style="${inp};width:80px;text-align:center">
      </div>
      <input id="mvMotivo" placeholder="Motivo (ej: compra, rotura, ajuste)" style="${inp};margin-top:8px">
      <div class="row" style="margin-top:8px;align-items:center;gap:8px">
        <span class="muted" style="font-size:12px;white-space:nowrap">Aporta</span>
        <select id="mvEmp" style="${inp};flex:1"><option value="">— ninguna (Labs / ajuste) —</option>${EMPRESAS.filter(e=>e.id!==STOCK_DUENO).map(e=>`<option value="${e.id}">${esc(e.nombre)} pone este stock</option>`).join("")}</select>
      </div>
      <button class="btn block" style="margin-top:10px" onclick="registrarMov()">Registrar</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;margin-bottom:2px">Precios de reparto</div>
      <div class="hint" style="margin-bottom:10px">Cargá lo que te cobra <b>Cardinal</b> por zona. A la marca le cobrás ese costo + el margen. Correo es solo gestión (la etiqueta ya la paga el cliente).</div>
      <div class="label">Costo de Cardinal (CABA y zonas)</div>
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">
        ${[["caba","CABA"],["1","Zona 1"],["2","Zona 2"],["3","Zona 3"]].map(([k,lbl])=>`<div class="field" style="flex:1;min-width:74px"><span class="label">${lbl}</span>
          <div class="row" style="align-items:center;gap:3px"><span class="muted">$</span>
          <input id="zc_${k}" type="number" inputmode="numeric" value="${zonaCosto()[k]||''}" style="${inp};padding:7px"></div></div>`).join("")}
      </div>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:110px"><span class="label">Margen (tu ganancia)</span>
          <div class="row" style="align-items:center;gap:3px"><span class="muted">$</span><input id="zc_margen" type="number" inputmode="numeric" value="${margenReparto()}" style="${inp};padding:7px"></div></div>
        <div class="field" style="flex:1;min-width:110px"><span class="label">Correo (gestión)</span>
          <div class="row" style="align-items:center;gap:3px"><span class="muted">$</span><input id="zc_correo" type="number" inputmode="numeric" value="${correoGestion()}" style="${inp};padding:7px"></div></div>
      </div>
      <div class="hint" style="margin-top:8px">Ej: Zona 2 cuesta ${fmtAr(zonaCosto()[2]||0)} + margen ${fmtAr(margenReparto())} = le cobrás <b>${fmtAr((zonaCosto()[2]||0)+margenReparto())}</b>. Correo: <b>${fmtAr(correoGestion())}</b>.</div>
      <button class="btn ghost" style="margin-top:12px" onclick="guardarPreciosZona()">Guardar precios</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row" style="justify-content:space-between;align-items:center;gap:12px">
        <div>
          <div style="font-weight:600">Descontar del stock al preparar</div>
          <div class="hint" style="margin-top:3px">${desc?'Cada pedido que marcás preparado descuenta del stock.':'Los envíos NO tocan el stock (dejalo así mientras acomodás).'}</div>
        </div>
        <button class="btn ${desc?'':'ghost'}" style="flex:0 0 auto" onclick="toggleDescuento()">${desc?'Activado':'Desactivado'}</button>
      </div>
    </div>
    <div class="row" style="margin-bottom:12px;flex-wrap:wrap">
      <button class="btn" onclick="pantallaCargarStock()">${icon('upload')} Cargar stock</button>
      <button class="btn ghost" onclick="guardarMinimos()">Guardar mínimos</button>
      <button class="btn ghost" onclick="imprimirStock()">${icon('printer')} Imprimir A4</button>
      <button class="btn ghost" onclick="agregarProductoNuevo()">➕ Agregar producto</button>
      <button class="btn ghost" onclick="verPacksAprendidos()">📦 Ver / corregir packs aprendidos</button>
      <button class="btn ghost" onclick="OPVIEW='minimos';vistaOperador()">🎯 Calcular mínimos según ventas</button>
      <button class="btn ghost" onclick="OPVIEW='cupones';vistaOperador()">🎟️ Cupones de fidelización</button>
      <button class="btn ghost" onclick="crearComprasPrueba()">🧪 Crear 3 compras de prueba</button>
      <button class="btn ghost" onclick="crearPedidosPruebaTelegram()">🧪 Crear 5 pedidos de prueba (AKG/NMN/ZMA, para el bot)</button>
      ${PEDIDOS.some(p=>p.esPrueba)?`<button class="btn ghost" style="color:var(--red)" onclick="borrarComprasPrueba()">🗑️ Borrar compras de prueba</button>`:''}
      <button class="btn ghost" onclick="repararProdsPedidos()">🔧 Reparar productos de pedidos</button>
      <button class="btn ghost" onclick="imprimirReposicion()">${icon('printer')} Planilla de reposición</button>
      <button class="btn ghost" onclick="pantallaSalidas()">${icon('box')} Lo que salió</button>
      <button class="btn ghost" onclick="pantallaRepickeo()">↻ Re-pickear órdenes</button>
      <button class="btn ghost" onclick="diagnosticoStock()">🩺 Diagnóstico</button>
      ${ROL==='admin'?`<button class="btn ghost" style="color:var(--red)" onclick="vaciarStock()">🧹 Vaciar stock</button>`:''}
    </div>
    <div class="label">Lo que queda · stock compartido <span class="muted" style="font-weight:400">(cuando baja de 5, pedís 5 · lo pone ${esc(empresaObj(STOCK_DUENO).nombre)})</span></div>
    <input id="stockQ" autocomplete="off" placeholder="🔍 Buscar producto…" value="${esc(STOCK_Q||'')}" oninput="STOCK_Q=this.value;clearTimeout(window.__sq);window.__sq=setTimeout(vistaStock,250)" style="${inp};margin-bottom:10px">
    <div class="card" style="margin-bottom:16px">
      ${rows.map(r=>{ const f=flujoProducto(r.p.nombre,st);
        const split=Object.entries(f.porEmp).map(([e,n])=>esc(empresaObj(e).nombre.split(" ")[0])+" "+n).join(" · ");
        return `<div style="padding:7px 0;border-top:.5px solid var(--border)">
        <div class="row" style="justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:13.5px;font-weight:600;min-width:0;flex:1">${esc(r.p.nombre)}</span>
          <span class="row" style="align-items:center;gap:5px;flex:0 0 auto">
            <button class="btn sm ghost" style="width:29px;font-size:16px;font-weight:700;padding:2px 0" onclick="ajustarUno('${encodeURIComponent(r.p.nombre)}',-1)">−</button>
            <b style="min-width:36px;text-align:center;font-size:15px;font-variant-numeric:tabular-nums;color:${r.stk<0?'var(--red)':(r.stk<=r.mn?'var(--amber)':'var(--text)')}">${r.stk}</b>
            <button class="btn sm ghost" style="width:29px;font-size:16px;font-weight:700;padding:2px 0" onclick="ajustarUno('${encodeURIComponent(r.p.nombre)}',1)">+</button>
            <input id="mn_${r.i}" type="number" inputmode="numeric" value="${r.mn}" title="Mínimo" style="${inp};width:44px;text-align:center;padding:4px;font-size:12px">
            <button class="btn sm ghost" style="padding:5px 8px;font-size:11.5px" onclick="ajustarStock('${encodeURIComponent(r.p.nombre)}')">Fijar</button>
          </span>
        </div>
        <div class="muted" style="font-size:11.5px;margin-top:2px;cursor:pointer" onclick="verMovsProd('${encodeURIComponent(r.p.nombre)}')">Entraron ${f.ent} · Salieron ${f.sal}${split?` <span style="opacity:.85">(${split})</span>`:""}${r.rep>0?` · <span style="color:var(--amber);font-weight:600">pedir ${r.rep}</span>`:""} <span style="color:var(--accent)">${STOCK_DET===r.p.nombre?'▲ ocultar':'▼ ver movimientos'}</span></div>
        ${STOCK_DET===r.p.nombre?movsProdHTML(r.p.nombre,st):""}
      </div>`; }).join("")||empty('box', q?('No encontré productos con "'+esc(STOCK_Q)+'".'):'Cargá stock con el botón de arriba para empezar.')}
    </div>
    <div class="label" style="margin-top:18px">Cuenta corriente · lo que retiró cada una</div>
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:120px"><span class="label">Desde</span><input id="stDesde" type="date" value="${STOCK_DESDE}" onchange="STOCK_DESDE=this.value;vistaStock()" style="${inp}"></div>
        <div style="flex:1;min-width:120px"><span class="label">Hasta</span><input id="stHasta" type="date" value="${STOCK_HASTA}" onchange="STOCK_HASTA=this.value;vistaStock()" style="${inp}"></div>
      </div>
      ${(STOCK_DESDE||STOCK_HASTA)?`<button class="btn sm ghost" style="margin-top:10px" onclick="STOCK_DESDE='';STOCK_HASTA='';vistaStock()">Ver todo el período</button>`:`<div class="hint" style="margin-top:8px">Mostrando todo. Elegí un rango para filtrar lo que retiró cada empresa.</div>`}
    </div>
    ${impE.length?impE.map(g=>{ const esDueno=g.empresa===STOCK_DUENO;
      return `<div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b style="font-size:16px">${esc(empresaObj(g.empresa).nombre)}</b>
          <span class="muted">Retiró <b style="color:var(--text);font-variant-numeric:tabular-nums">${g.total} u</b></span>
        </div>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          ${Object.entries(g.canales).map(([c,n])=>`<span class="chip ${c==='ml_flex'?'flex':'tn'}">${esc(canalObj(c).nombre)}: ${n}</span>`).join("")}
        </div>
        ${g.aporte>0?`<div class="row" style="justify-content:space-between;margin-top:8px"><span class="muted">Aportó al stock</span><b style="color:var(--green)">+${g.aporte} u</b></div>`:""}
        ${esDueno?`<div class="hint" style="margin-top:10px">Vende de su propio stock.</div>`
                 :`<div class="row" style="justify-content:space-between;margin-top:10px;padding-top:10px;border-top:.5px solid var(--border)">
                     <b>Saldo a pagar a ${esc(empresaObj(STOCK_DUENO).nombre.split(" ")[0])}</b>
                     <b style="color:var(--amber);font-size:17px;font-variant-numeric:tabular-nums">${g.saldo} u</b></div>`}
        <div style="margin-top:6px">
          ${Object.entries(g.prods).sort((a,b)=>b[1]-a[1]).map(([n,c])=>`<div class="row" style="justify-content:space-between;padding:7px 0;border-top:.5px solid var(--border)"><span style="font-size:14px">${esc(n)}</span><b style="font-variant-numeric:tabular-nums">${c}</b></div>`).join("")}
        </div>
      </div>`; }).join(""):`<div class="card" style="margin-bottom:16px">${empty('box','No hay retiros en este período.')}</div>`}
    <div class="label">Últimos movimientos</div>
    <div class="card">
      ${movs.map(m=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-top:.5px solid var(--border)">
        <span style="font-size:14px">${esc(m.prod)}${m.motivo?` <span class="muted">· ${esc(m.motivo)}</span>`:''}</span>
        <span style="font-weight:700;color:${m.tipo==='salida'?'var(--red)':'var(--green)'}">${m.tipo==='salida'?'−':'+'}${m.cant}</span>
      </div>`).join("")||empty('box','Sin movimientos todavía.')}
    </div>`;
}
async function registrarMov(){
  const prod=($("#mvProd")||{}).value, tipo=($("#mvTipo")||{}).value||"entrada",
        cant=+(($("#mvCant")||{}).value||0), motivo=(($("#mvMotivo")||{}).value||"").trim(),
        emp=($("#mvEmp")||{}).value||"";
  if(!prod||!cant){ toast("Elegí producto y cantidad"); return; }
  await pushMov(prod,tipo,cant,motivo, emp?{empresa:emp}:{});
  toast((tipo==="salida"?"−":"+")+cant+" "+prod);
}
/* Corrige el stock de un producto a la cantidad real (arregla errores de carga) */
async function ajustarUno(nombreEnc,delta){
  const nombre=decodeURIComponent(nombreEnc);
  const actual=nivel(nombre,stockState());
  if(delta<0 && actual<=0){ toast("Ya está en 0"); return; }
  await pushMov(nombre, delta>0?"entrada":"salida", 1, "Ajuste manual");
  vistaStock();
}
async function ajustarStock(nombreEnc){
  const nombre=decodeURIComponent(nombreEnc);
  const actual=nivel(nombre,stockState());
  const v=prompt("¿Cuántas unidades tenés REALMENTE de:\n\n"+nombre+"\n\n(ahora el sistema marca "+actual+")", String(actual));
  if(v===null) return;
  const target=parseInt((String(v).match(/-?\d+/)||[])[0],10);
  if(isNaN(target)){ toast("Poné un número"); return; }
  const delta=target-actual;
  if(delta===0){ toast("Ya estaba en "+target); return; }
  await pushMov(nombre, delta>0?"entrada":"salida", Math.abs(delta), "Ajuste manual");
  toast(nombre.split(" ").slice(0,2).join(" ")+" → "+target);
  vistaStock();
}
async function guardarPreciosZona(){
  const st=stockState(); const c={...zonaCosto()}; const num=id=>{ const el=$("#"+id); const v=el?parseInt((el.value||"").replace(/\D/g,""),10):NaN; return isNaN(v)?null:v; };
  ["caba","1","2","3"].forEach(k=>{ const v=num("zc_"+k); if(v!=null) c[k]=v; });
  st.zonas=c;
  const m=num("zc_margen"); if(m!=null) st.margen=m;
  const g=num("zc_correo"); if(g!=null) st.correoGestion=g;
  await persistStock(st); toast("Precios guardados"); vistaStock();
}
async function guardarMinimos(){ const min={...stockState().min};
  PRODUCTOS.forEach((p,i)=>{ const el=$("#mn_"+i); if(el && el.value!=null && el.value!=="") min[p.nombre]=+el.value; });
  await setMin(min); toast("Mínimos guardados"); }
/* Cargar stock pegando una lista "nombre = cantidad" (ej: de un remito) */
function pantallaCargarStock(txt){
  app().innerHTML=`
    <button class="btn sm ghost" onclick="OPVIEW='stock';vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">Cargar stock</div>
    <div class="subtitle">Leé el <b>PDF del remito</b>, o pegá una línea por producto (<b>nombre = cantidad</b>). Yo lo cruzo con tu catálogo.</div>
    <input type="file" id="remitoPDF" accept="application/pdf" style="display:none" onchange="leerRemitoPDF(this.files[0])">
    <button class="btn block" style="margin-top:12px" onclick="document.getElementById('remitoPDF').click()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>Leer PDF de remito</button>
    <div class="hint" style="margin:10px 0 4px">Tiene que ser el <b>PDF</b> del remito (no una foto). Después revisás abajo y confirmás.</div>
    <textarea id="csTxt" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:10px;font:inherit;background:var(--bg);min-height:170px;margin-top:8px" placeholder="Bisglicinato de Magnesio 500 mg (60 capsulas) = 15
Omega 3 (60 capsulas) = 20">${esc(txt||"")}</textarea>
    <button class="btn block" style="margin-top:12px" onclick="previsualizarCarga()">Ver qué se va a cargar</button>
    <div id="csPrev"></div>`;
}
/* Lee el texto de un PDF en el ORDEN NATURAL del documento (ideal para remitos de una columna) */
async function pdfTextoRemito(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let out="";
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    let lastY=null;
    tc.items.forEach(it=>{ if(!it.str||!it.str.trim()){ return; }
      const y=Math.round(it.transform[5]);
      if(lastY!==null && Math.abs(y-lastY)>2) out+="\n";
      else if(out && !out.endsWith("\n")) out+=" ";
      out+=it.str.trim(); lastY=y; });
    out+="\n";
  }
  return out;
}
/* Lee el texto de un PDF por filas (sin cortar en columnas) */
async function pdfTextoPlano(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const lineas=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    const items=tc.items.map(it=>({x:it.transform[4],y:it.transform[5],s:it.str})).filter(it=>it.s.trim());
    items.sort((a,b)=>(Math.round(b.y/3)-Math.round(a.y/3))||(a.x-b.x));
    let cy=null,line=[];
    items.forEach(it=>{ const yy=Math.round(it.y/3);
      if(cy===null||yy===cy){ line.push(it.s); } else { lineas.push(line.join(" ")); line=[it.s]; } cy=yy; });
    if(line.length) lineas.push(line.join(" "));
  }
  return lineas.join("\n");
}
/* Extrae producto + cantidad de un remito (ancla en el código PLN y la cantidad final) */
function parseRemito(text){
  const out=[]; const bloques=(text||"").split(/(?=\bPLN\d+)/i);
  bloques.forEach(b=>{
    if(!/\bPLN\d+/i.test(b)) return;
    // La cantidad viene con decimales (ej "15.00", "5.00") en la columna Cantidad
    const qm=b.match(/(\d+)[.,]\d{2}(?!\d)/);
    let cant = qm ? Math.round(parseFloat(qm[1])) : null;
    if(cant==null){ const ints=[...b.matchAll(/(\d{1,4})/g)].map(m=>+m[1]).filter(v=>v>0&&v<10000); cant=ints.length?ints[ints.length-1]:null; }
    const sk=(b.match(/\bPLN\s?-?\s?(\d{3,6})\b/i)||[])[1];      // guardo el código PLN
    // nombre = sacar el código PLN y la cantidad; dejar el resto (incluye "(60 Capsulas)")
    let nombre=b.replace(/^[\s\S]*?PLN\d+\s*/i,"").replace(/\d+[.,]\d{2}(?!\d)/,"").replace(/\s+/g," ").trim();
    if(nombre && cant) out.push({nombre, cant, sku: sk?("PLN"+sk):null});
  });
  return out;
}
/* ---- ETIQUETA DE MERCADO LIBRE: crea el pedido y carga los productos por código de barras ---- */
function parseEtiquetaML(texto){
  const L=texto.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const T=texto.replace(/[ \t]+/g," ");
  // el N° de venta de ML son ~13-16 dígitos, a veces partido en dos líneas ("20000" + "18016578394")
  let venta="";
  let vm=T.match(/Venta:\s*(\d[\d\s]{0,20}?\d)(?:\s|$|Pack|SKU)/i) || T.match(/Venta:\s*(\d+)/i);
  if(!vm || vm[1].replace(/\s/g,"").length<11){                 // si quedó corto, uno con la línea siguiente
    const lv=texto.split(/\n/); const iv=lv.findIndex(x=>/Venta:/i.test(x));
    if(iv>=0){ const junto=(lv[iv].replace(/.*Venta:\s*/i,"")+ (lv[iv+1]||"")).replace(/\D/g,"").slice(0,16); if(junto.length>=11) vm=[null,junto]; }
  }
  if(vm){ const limpio=vm[1].replace(/\s/g,""); if(limpio.length>=11) venta=limpio.slice(0,16); }
  const envio=((T.match(/Envio:\s*(\d[\d ]{4,20}\d)/i)||T.match(/Envio:\s*(\d+)/i)||[])[1]||"").replace(/\D/g,"");   // viene partido: "4802881 2120"
  // CP: formato Flex ("CP: 1642" o número arriba) o Correo ("CP:2000")
  let cp=(T.match(/CP:\s*(\d{4})\b/)||[])[1]||"";
  if(!cp){ const i=L.findIndex(x=>/^CP:?$/.test(x)); if(i>0){ const m=L[i-1].match(/^(\d{4})$/); if(m) cp=m[1]; } }
  // Cliente: "Destinatario:" (Flex) o el nombre antes de "Domicilio:" (Correo)
  let cli=(T.match(/Destinatario:\s*([^(\n]+)/i)||[])[1]||"";
  if(!cli){ const i=L.findIndex(x=>/^Domicilio:/i.test(x));
    if(i>0){ let k=i-1; if(/^\([^)]*\)$/.test(L[k]) && k>0) k--;   // la línea justo arriba suele ser el alias "(USUARIOML)"
      cli=L[k].replace(/\s*\([^)]*\)\s*$/,"").trim(); } }
  // Dirección: "Direccion:" (Flex) o "Domicilio:" (Correo)
  let dir=(T.match(/Direccion:\s*(.+?)(?:\s*Barrio:|\s*Referencia:|\s*Destinatario:|\n|$)/i)||[])[1]||"";
  if(!dir) dir=(T.match(/Domicilio:\s*(.+?)(?:\s*CP:|\s*Central:|\s*Ciudad de destino:|\n|$)/i)||[])[1]||"";
  // Localidad/provincia
  let loc="", prov="Buenos Aires";
  const cd=(T.match(/Ciudad de destino:\s*(.+?)(?:\s*\(([^)]+)\))?(?:\n|Referencia:|$)/i));
  if(cd){ loc=(cd[1]||"").trim(); if(cd[2]) prov=cd[2].trim(); }
  else { const iCP=L.findIndex(x=>/^CP:?$/.test(x)||/CP:\s*\d{4}/.test(x));
    if(iCP>=0) for(let j=iCP+1;j<Math.min(iCP+4,L.length);j++){ const c=L[j];
      if(c && !/^(RESIDENCIAL|COMERCIAL|Direccion|Barrio|Referencia|Destinatario|Domicilio|Central|Ciudad)/i.test(c) && !/^\d{4}$/.test(c)){ loc=c; break; } } }
  // Nota para el cadete: a veces ML duplica "Referencia:" (ej "Referencia: 6 A Referencia: Piso 6...").
  // Uso la ÚLTIMA aparición y corto recién en el próximo campo conocido, uniendo el salto de línea
  // (si no, se perdía el final de la referencia, tipo "entre calle X y calle Y").
  let nota="";
  { const refs=[...T.matchAll(/Referencia:\s*/gi)];
    if(refs.length){ const start=refs[refs.length-1].index+refs[refs.length-1][0].length;
      const resto=T.slice(start);
      const corte=resto.search(/\n\s*(Destinatario:|Domicilio:|Central:|Ciudad de destino:)/i);
      nota=(corte>=0?resto.slice(0,corte):resto.split(/\n\s*\n/)[0]).replace(/\s*\n\s*/g," ").trim(); } }
  // Productos: capturo SKU (código de barras largo O código corto tipo LADY/Q10/CITPOT), nombre de ML y cantidad.
  // OJO: no todas las etiquetas imprimen "SKU:" para cada producto (algunos ítems solo traen el código como
  // barra gráfica, sin texto) — por eso ancoro en "Cantidad:" (que sí aparece siempre, una vez por producto)
  // y le busco el "SKU:" más cercano hacia atrás si lo hay; si no hay, igual reconstruyo el nombre.
  const prods=[], items=[], vistos=new Set();
  const cantMatches=[...texto.matchAll(/Cantidad:\s*(\d+)/g)];
  // el SKU puede traer símbolos (ej "POT+MAG"): tomo todo hasta el espacio
  const skuMatches=[...texto.matchAll(/SKU:\s*([^\s]{2,})/g)];
  // En las etiquetas actuales de ML los nombres de los productos van AL FINAL, después de
  // "Despacha tu(s) producto(s) cuanto antes…", uno por línea y en el mismo orden que las "Cantidad:".
  const nombresFinal=[];
  { const iDesp=L.findIndex(x=>/^Despacha tus? productos?/i.test(x));
    if(iDesp>=0) for(let j=iDesp+1;j<L.length;j++){ const t=L[j];
      if(/^(Pack ID|Venta|Envio|Remitente|Identifi|SKU|Cantidad|Destinatario|Domicilio)\b/i.test(t)) break;
      nombresFinal.push(t); } }
  // si hay más líneas que productos es porque algún nombre largo ocupó 2 líneas: las junto
  while(nombresFinal.length>cantMatches.length && cantMatches.length>0){
    let m=0; nombresFinal.forEach((n,i)=>{ if(i && n.length<nombresFinal[m].length) m=i; });
    const i=Math.max(1,m); nombresFinal.splice(i-1,2,nombresFinal[i-1]+" "+nombresFinal[i]); }
  let idxProd=0;
  // para nunca confundir el nombre del cliente con un producto (pasa cuando el nombre queda
  // pegado justo arriba del primer producto en el texto de la etiqueta)
  const cliNorm=(cli||"").toLowerCase().trim();
  // algunas etiquetas imprimen el código de barras sin el 0 inicial (12 dígitos en vez de 13);
  // comparo ignorando ceros a la izquierda para que igual matchee con el catálogo
  const normBarcode=s=>(s||"").replace(/^0+(?=\d)/,"");
  let siguienteSku=0;
  for(const mc of cantMatches){
    const cant=parseInt(mc[1],10)||1;
    // el SKU de este producto (si lo hay) es el último "SKU:" que aparece ANTES de esta "Cantidad:"
    let sku="", idxAncla=mc.index;
    while(siguienteSku<skuMatches.length && skuMatches[siguienteSku].index < mc.index){ sku=skuMatches[siguienteSku][1].trim(); idxAncla=skuMatches[siguienteSku].index; siguienteSku++; }
    const clave = sku ? ("sku:"+sku) : ("pos:"+mc.index);
    if(vistos.has(clave)) continue; vistos.add(clave);
    // nombre que muestra ML: la(s) línea(s) de producto arriba del SKU (o de la Cantidad, si no hay SKU en esta etiqueta).
    // A veces el nombre ocupa 2 líneas (nombres largos) — junto hasta 2 líneas seguidas que no sean otro campo.
    const antesArr=texto.slice(0,idxAncla).split(/\n/); const nombreLineas=[];
    for(let k=antesArr.length-1;k>=0 && nombreLineas.length<2;k--){
      const t=antesArr[k].trim();
      if(!t) continue;
      if(/^(Pack ID|Venta|Cantidad|Sabor|Tipo de envase|SKU|Identifi|Despacha|Productos?)\b/i.test(t) || /^\d+$/.test(t)){
        if(nombreLineas.length) break; else continue;
      }
      // nunca uso el nombre del cliente (con o sin su alias entre paréntesis) como si fuera un producto
      const tSinAlias=t.replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
      if(cliNorm && tSinAlias===cliNorm) continue;
      nombreLineas.unshift(t);
    }
    const nomFinal=nombresFinal[idxProd++]||"";
    const nomML=(nomFinal || nombreLineas.join(" ").replace(/^[A-Z0-9]{2,}\s+/,"").replace(/^\d{6,}\s*/,""))
      .replace(/\s+(Sin sabor|Frasco)\s*$/i,"").trim();
    // ¿lo conozco? 1) diccionario de packs  2) código de barras exacto (tolerante a 0 inicial)  3) nombre
    // 1º lo que ya aprendiste por SKU (packs/vínculos), 2º código de barras exacto, 3º por nombre
    const packDefinido = packDef(sku, nomML);
    let prodCat=null, esAprendido=false, conflictoSku=false;
    if(packDefinido && packDefinido.comps && packDefinido.comps.length){
      // si es un simple vínculo SKU→producto (no un pack real de varios), reviso que lo que dice ESTA
      // etiqueta no contradiga lo aprendido: Mercado Libre reutiliza el mismo SKU corto para productos
      // distintos (pasó con "CURC" → Cúrcuma orgánica Y Cúrcuma con Jengibre), y confiar ciego pisa mal el producto
      const esAliasSimple = packDefinido.comps.length===1 && (packDefinido.comps[0].cant||1)===1;
      const sugerido = esAliasSimple && nomML ? mejorProducto(packDeNombre(nomML).nombre) : null;
      conflictoSku = !!(sugerido && sugerido.nombre!==packDefinido.comps[0].prod);
      if(!conflictoSku){
        esAprendido=true;   // es un SKU ya enseñado (simple o pack), y coincide con lo que dice la etiqueta
        prodCat = PRODUCTOS.find(pp=>pp.nombre===packDefinido.comps[0].prod) || null;
      }
    }
    if(!esAprendido){
      prodCat = (sku && PRODUCTOS.find(pp=>normBarcode(pp.barcode)===normBarcode(sku)))
        || (conflictoSku ? null : (nomML?mejorProducto(packDeNombre(nomML).nombre):null));   // en conflicto no adivino: que lo confirme una persona
    }
    // "Pack X 3 - Malato De Magnesio" con Cantidad: 1 → son 3 frascos (salvo que ese pack ya esté enseñado)
    const pn = esAprendido ? {n:1} : packDeNombre(nomML);
    const cantReal = cant*(pn.n||1);
    const etiq = nomML || (sku?("SKU "+sku):"Producto sin código detectado");
    prods.push({ nombre: prodCat?prodCat.nombre:etiq, cant:cantReal, sku, nomML, reconocido: !!prodCat || esAprendido, ...(pn.n>1?{packX:pn.n}:{}) });
    items.push(cantReal+"x "+(prodCat?prodCat.nombre:etiq));
  }
  if(!cli && !venta && !prods.length) return null;
  // etiqueta a un punto Pickit (locker): el PDF de ML imprime "PICKIT" o "Comprador retira en Centro de Envío: <punto>"
  const esPickit=/\bPICKIT\b/i.test(texto) || /Comprador\s*retira\s*en\s*Centro\s*de\s*Env[ií]o/i.test(texto);
  return { ref: venta?("#"+venta):(envio?("#"+envio):""), cliente:cli.trim(), tel:"", dir:dir.trim(),
    ciudad:loc, provincia:prov, cp, items:items.join(" · "), prods, nota:nota.trim(), etiquetaML:true,
    pickit:esPickit, envio:envio.replace(/\D/g,""), empresaML: empresaPorVendedorML(texto) };
}
/* Procesa UN archivo de etiqueta ML y devuelve sus filas listas para IMP_FILAS (sin tocar el estado global).
   Se usa tanto para una sola etiqueta como para varias juntas (leerEtiquetaML hace el loop). */
async function procesarEtiquetaMLArchivo(file){
  const texto=await pdfTextoRemito(file);
  // separo por N° de venta único (así una etiqueta con hoja de envío + picking no se duplica)
  // ventas: cada bloque "Venta:" une los dígitos partidos y toma los primeros 16
  const ventasRaw=(texto.match(/Venta:\s*(\d[\d\s]{0,20})/g)||[]).map(v=>v.replace(/Venta:\s*/,"").replace(/\s/g,"").slice(0,16));
  const ventas=[...new Set(ventasRaw.filter(v=>v.length>=11))];
  let filas=[];
  if(ventas.length<=1){ const f=parseEtiquetaML(texto); if(f) filas=[f]; }
  else {
    // corto el texto en tramos por cada aparición de una venta nueva, ordenados por dónde aparecen
    // (etiquetas con 3+ órdenes juntas pueden quedar muy compactas: si dos tramos se pisan,
    // parseEtiquetaML puede agarrar el N° de venta o el cliente de la orden vecina)
    const posiciones=ventas.map(v=>{ let idx=texto.indexOf("Venta:"+v); if(idx<0) idx=texto.indexOf("Venta: "+v); return {v, idx}; })
      .filter(x=>x.idx>=0).sort((a,b)=>a.idx-b.idx);
    posiciones.forEach((p,pi)=>{
      const topeSiguiente=(pi+1<posiciones.length)?posiciones[pi+1].idx:(p.idx+800);
      const tramo=texto.slice(Math.max(0,p.idx-600), topeSiguiente);
      const f=parseEtiquetaML(tramo); if(!f||!(f.cliente||f.prods.length)) return;
      f.ref="#"+p.v;   // fuerzo el N° de venta al que ancla este tramo: así dos órdenes nunca terminan compartiendo el mismo ref (lo que hacía que una se "tapara" a la otra)
      // el nombre que sigue justo a "Venta: <n>" en el propio tramo es más confiable que la
      // primera "Destinatario:" del documento (que en etiquetas de 3+ puede ser de otra orden)
      const mNombre=texto.slice(p.idx, topeSiguiente).match(/Venta:\s*[\d\s]+\s*\n\s*([^\n]+)/i);
      if(mNombre){ const cand=mNombre[1].trim();
        if(cand.length>3 && !/^(Pack ID|SKU|Cantidad|Sabor|Tipo de envase|Producto)/i.test(cand)) f.cliente=cand; }
      filas.push(f);
    });
    // dedup por ref (por si el mismo N° de venta aparece más de una vez en el propio archivo)
    const seen=new Set(); filas=filas.filter(f=>{ if(seen.has(f.ref))return false; seen.add(f.ref); return true; });
  }
  if(!filas.length) return {filas:[], sinReconocer:true};
  // guardo el PDF completo (para 1 etiqueta) y también parto por página (para varias)
  let adj=null, paginasPorVenta={}, paginasDetalle={};
  try{
    const b64=await leerArchivoBase64(file);
    if(file.size<=700*1024) adj={etiquetaPdf:b64, etiquetaPdfNombre:file.name||"etiqueta-ml.pdf"};
    // parto el PDF: una página de envío por cada venta, y guardo aparte la hoja de picking/detalle
    // (antes se descartaba) para poder mostrarla como preview sin abrir el PDF completo
    if(filas.length>1 && typeof PDFLib!=="undefined"){
      const { PDFDocument }=PDFLib;
      const bin=atob(b64); const raw=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) raw[i]=bin.charCodeAt(i);
      const src=await PDFDocument.load(raw);
      const copiarPagina=async pn=>{ const nuevo=await PDFDocument.create();
        const [pg]=await nuevo.copyPages(src,[pn-1]); nuevo.addPage(pg);
        const bytes=await nuevo.save();
        let s=""; const u=new Uint8Array(bytes); for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
        return btoa(s); };
      // busco en qué página está cada N° de venta leyendo el texto por página
      pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdfjs=await pdfjsLib.getDocument({data:raw.slice(0)}).promise;
      for(let pn=1; pn<=pdfjs.numPages; pn++){
        const tc=await (await pdfjs.getPage(pn)).getTextContent();
        const txtPlano=tc.items.map(it=>it.str).join(" ");
        const txt=txtPlano.replace(/\s/g,"");
        for(const f of filas){ const num=(f.ref||"").replace(/\D/g,""); if(!num || !txt.includes(num)) continue;
          if(/CP|Destinatario|Domicilio/i.test(txtPlano)){
            if(!paginasPorVenta[f.ref]) paginasPorVenta[f.ref]=await copiarPagina(pn);   // hoja de envío (tiene el QR)
          } else if(!paginasDetalle[f.ref]){
            paginasDetalle[f.ref]=await copiarPagina(pn);   // hoja de picking/detalle (cantidades y productos)
          }
        }
      }
    }
  }catch(e){ console.warn("split etiquetas:", e); }
  // busco la venta en TODOS los pedidos (incluso archivados/entregados), no solo los activos
  const todos=PEDIDOS.filter(p=>p.tipo===undefined || p.cliente!==undefined);
  const refsActivas=new Set(soloPedidos().map(p=>p.ref).filter(Boolean));
  const yaEnSistema=filas.filter(f=>f.ref).map(f=>{
    const match=todos.find(p=>p.ref===f.ref);
    return match?{f, p:match}:null;
  }).filter(Boolean);
  const armar=f=>{ f.empresa=f.empresaML||IMP_EMPRESA; f.marcaDetectada=!!f.empresaML; f.canal="ml_flex";
    if(paginasPorVenta[f.ref]){ f.etiquetaPdf=paginasPorVenta[f.ref]; f.etiquetaPdfNombre="etiqueta-"+(f.ref||"").replace(/\D/g,"")+".pdf"; }
    else if(adj && filas.length===1){ f.etiquetaPdf=adj.etiquetaPdf; f.etiquetaPdfNombre=adj.etiquetaPdfNombre; }
    if(paginasDetalle[f.ref]) f.hojaDetalle=paginasDetalle[f.ref];   // hoja de picking, para previsualizar sin abrir el PDF
    const rr=sugerirRuta(f.provincia,f.ciudad); f.origen=(rr&&rr.origen)||"bsas";
    // en Mercado Libre, lo que no es Flex ni Pickit lo entregás vos en un Punto de Despacho de ML
    // (no es "Correo Argentino" propiamente — el usuario lo aclaró 2026-09-24)
    if(llegaCadete(f)){ f.metodo="cadete"; f.correo=""; } else { f.metodo="correo"; f.correo="Punto de Despacho"; }
    return f; };
  let resultado=filas.filter(f=>!f.ref||!refsActivas.has(f.ref)).map(armar);
  if(!resultado.length){
    // estaba cargada: pregunto si la quiere de nuevo (con -b) en vez de solo bloquearla
    const info=yaEnSistema[0];
    if(info){ const est=info.p.cerradoEn?"archivada (cierre anterior)":(estObj(info.p.estado).label||info.p.estado);
      if(await askConfirm("Esta venta ya figura en el sistema"+(file.name?(" ("+file.name+")"):"")+":\n\n"+(info.p.cliente||"")+" · N° "+info.p.ref+"\nEstado: "+est+"\n\n¿Querés cargarla igual como pedido nuevo?\n(Aceptar = crear de nuevo · Cancelar = no hacer nada)")){
        resultado=filas.map(f=>{ f.ref=(f.ref||"")+"-b"; return armar(f); });
      } else { return {filas:[], yaCargada:true}; }
    } else { return {filas:[], yaCargada:true}; }
  }
  return {filas:resultado};
}
/* Lee una o varias etiquetas de ML de una (FileList o un solo File) y las agrega a IMP_FILAS,
   así se puede subir de a una o varias juntas, ya sea un PDF con varias órdenes o varios PDF sueltos. */
async function leerEtiquetaML(archivos){
  const lista = archivos==null ? [] : (archivos.length!==undefined ? Array.from(archivos) : [archivos]);
  if(!lista.length) return;
  if(typeof pdfjsLib==="undefined"){ toast("El lector de PDF no cargó, probá de nuevo"); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  toast(lista.length>1?("Leyendo "+lista.length+" etiquetas…"):"Leyendo la etiqueta…");
  let leidas=0, sinReconocer=0, yaCargadas=0, repetidasEnPantalla=0;
  // ref → índice en IMP_FILAS. Arranca con lo que YA está en pantalla (de una tanda anterior de este
  // mismo import), así subir la misma etiqueta en dos tandas separadas (antes de guardar) no duplica la fila.
  const refsDeEsteLote=new Map();
  IMP_FILAS.forEach((f,idx)=>{ if(f.ref) refsDeEsteLote.set(f.ref, idx); });
  for(const file of lista){
    try{
      const r=await procesarEtiquetaMLArchivo(file);
      if(r.sinReconocer){ sinReconocer++; continue; }
      if(r.yaCargada){ yaCargadas++; continue; }
      r.filas.forEach(f=>{
        if(f.ref && refsDeEsteLote.has(f.ref)){
          // la misma venta ya vino de otra etiqueta (de este lote o de una tanda anterior en pantalla,
          // ej. un PDF de 3 órdenes + esa misma orden subida suelta): me quedo con la que trae más datos
          const idxPrevio=refsDeEsteLote.get(f.ref);
          if(IMP_FILAS[idxPrevio]){ if(!IMP_FILAS[idxPrevio].dir && f.dir) IMP_FILAS[idxPrevio]=f; repetidasEnPantalla++; }
          return;
        }
        if(f.ref) refsDeEsteLote.set(f.ref, IMP_FILAS.length);
        IMP_FILAS.push(f); leidas++;
      });
    }catch(e){ console.error(e); sinReconocer++; }
  }
  if(!leidas){
    if(repetidasEnPantalla && !sinReconocer) toast("Esa"+(repetidasEnPantalla===1?"":"s")+" venta"+(repetidasEnPantalla===1?"":"s")+" ya la"+(repetidasEnPantalla===1?"":"s")+" tenías en pantalla, no se duplicó");
    else if(yaCargadas && !sinReconocer) toast(lista.length>1?"Esas ventas ya estaban cargadas":"Esa venta ya está cargada");
    else toast("No reconocí "+(lista.length>1?"ninguna etiqueta":"la etiqueta")+". ¿Es el PDF de Mercado Libre?");
    return;
  }
  mostrarPreviewImport();
  let msg=leidas+" etiqueta"+(leidas===1?"":"s")+" leída"+(leidas===1?"":"s");
  if(sinReconocer) msg+=" · "+sinReconocer+" no reconocida"+(sinReconocer===1?"":"s");
  if(yaCargadas) msg+=" · "+yaCargadas+" ya cargada"+(yaCargadas===1?"":"s");
  if(repetidasEnPantalla) msg+=" · "+repetidasEnPantalla+" repetida"+(repetidasEnPantalla===1?"":"s")+" (no duplicada)";
  toast(msg);
}
async function leerRemitoPDF(file){
  if(!file) return;
  if(typeof pdfjsLib==="undefined"){ toast("El lector de PDF no cargó, probá de nuevo"); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  toast("Leyendo el remito…");
  try{
    const texto=await pdfTextoRemito(file);
    const items=parseRemito(texto);
    if(!items.length){ toast("No reconocí productos. ¿Es el PDF del remito?"); return; }
    const box=$("#csTxt"); if(box) box.value=items.map(i=>(i.sku?(i.sku+" "):"")+i.nombre+" = "+i.cant).join("\n");
    previsualizarCarga();
    toast(items.length+" productos leídos del remito");
  }catch(e){ toast("No pude leer el PDF del remito"); }
}
/* Tabla de SKU (PLN...) → producto del catálogo. Se guarda en la nube y se va aprendiendo. */
function skuRecord(){ return PEDIDOS.find(p=>p.tipo==="skus"); }
function skuMap(){ const r=skuRecord(); return (r&&r.map)||{}; }
function skuDe(txt){ const m=String(txt||"").toUpperCase().match(/\bPLN\s?-?\s?(\d{3,6})\b/); return m?("PLN"+m[1]):null; }
async function aprenderSku(sku,nombreProd){
  if(!sku||!nombreProd) return;
  const r=skuRecord(); const map=Object.assign({},(r&&r.map)||{}); map[sku]=nombreProd;
  if(r) await DB.update(r.id,{map}); else await DB.create({tipo:"skus",map});
}
function prodPorSku(sku){ const n=skuMap()[sku]; return n?PRODUCTOS.find(p=>p.nombre===n):null; }
function parseCarga(){
  return ($("#csTxt").value||"").split(/\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    const i=l.lastIndexOf("="); if(i<0) return null;
    const nombre=l.slice(0,i).trim(), cant=parseInt((l.slice(i+1).match(/\d+/)||[])[0],10);
    if(!nombre||!cant) return null;
    const sku=skuDe(nombre);                                   // ej: PLN1012
    let prod=sku?prodPorSku(sku):null;                         // 1) por SKU: exacto
    if(!prod) prod=mejorProducto(nombre.replace(/\bPLN\s?-?\s?\d{3,6}\b/ig,"").trim());   // 2) por nombre
    return { entrada:nombre, cant, sku, prod: prod?prod.nombre:null, porSku: !!(sku&&prodPorSku(sku)) };
  }).filter(Boolean);
}
function previsualizarCarga(){
  const items=parseCarga(); const prev=$("#csPrev");
  if(!items.length){ prev.innerHTML=`<div class="hint" style="margin-top:12px">Pegá al menos una línea con “nombre = cantidad”.</div>`; return; }
  window.__carga=items; const okN=items.filter(i=>i.prod).length;
  const opts=(sel)=>PRODUCTOS.map(p=>`<option ${p.nombre===sel?'selected':''}>${esc(p.nombre)}</option>`).join("");
  prev.innerHTML=`
    <div class="label" style="margin-top:18px">Se va a cargar (${okN} de ${items.length})</div>
    <div class="card">
      ${items.map((it,ix)=>`<div style="padding:10px 0;border-top:.5px solid var(--border)">
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
          <span style="min-width:0;font-size:14px">
            ${it.prod?esc(it.prod):`<span style="color:var(--red)">⚠ No reconocido</span>`}
            ${it.sku?`<span class="muted" style="font-size:12px"> · ${esc(it.sku)}${it.porSku?' ✓':''}</span>`:''}
          </span>
          <b style="flex:0 0 auto">+${it.cant}</b>
        </div>
        <div class="muted" style="font-size:12px;margin-top:2px">${esc(it.entrada)}</div>
        ${it.sku&&!it.porSku?`<div style="margin-top:7px">
          <div class="muted" style="font-size:12px;margin-bottom:4px">¿Qué producto es ${esc(it.sku)}? (lo aprendo para siempre)</div>
          <select onchange="fijarSku('${esc(it.sku)}',this.value)" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)">
            <option value="">— elegir producto —</option>${opts(it.prod)}
          </select>
        </div>`:''}
      </div>`).join("")}
    </div>
    ${okN?`<button class="btn block" style="margin-top:12px" onclick="confirmarCarga()">${icon('check')} Cargar ${okN} al stock</button>`:''}
    <div class="hint" style="margin-top:8px">Los que tienen <b>PLN ✓</b> son match exacto por código. Los ⚠ no los cargo: elegí el producto en la lista y queda aprendido.</div>`;
}
async function fijarSku(sku,nombre){
  if(!nombre) return;
  await aprenderSku(sku,nombre);
  toast(sku+" → "+nombre.split(" ").slice(0,3).join(" "));
  previsualizarCarga();
}
const APP_VERSION="v50-control-en-el-celu";   // versión visible para saber qué archivo está corriendo
