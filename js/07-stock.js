/* ============================================================
   07-stock — Stock: niveles, movimientos, mínimos e imputación por empresa
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
/* --- Stock con kardex de movimientos (idea adaptada de InvenTree) --- */
function stockRecord(){
  const docs=PEDIDOS.filter(p=>p.tipo==="stock");
  if(docs.length<=1) return docs[0];
  return docs.slice().sort((a,b)=>((b.movs||[]).length-(a.movs||[]).length))[0];   // el que más movimientos tiene
}
function stockDuplicados(){ return PEDIDOS.filter(p=>p.tipo==="stock").length; }
/* Pedidos IGNORADOS: los que destildaste a propósito. Se guardan en la nube para no traerlos nunca más. */
function ignoradosRecord(){ return PEDIDOS.find(p=>p.tipo==="ignorados"); }
function ignoradosSet(){ const r=ignoradosRecord(); return new Set((r&&r.refs)||[]); }
async function agregarIgnorados(refs){
  const nuevos=(refs||[]).filter(Boolean);
  if(!nuevos.length) return;
  const r=ignoradosRecord();
  const arr=[...new Set(((r&&r.refs)||[]).concat(nuevos))];
  if(r) await DB.update(r.id,{refs:arr}); else await DB.create({tipo:"ignorados",refs:arr});
}
/* Vaciar TODO el stock para empezar de cero (los pedidos no se tocan; conserva precios/config) */
async function vaciarStock(){
  if(!await askConfirm("¿Vaciar TODO el stock?\n\nSe borran todos los movimientos (cargas y salidas). Los pedidos y los precios NO se tocan.",{yes:"Vaciar todo",danger:true})) return;
  if(!await askConfirm("¿Seguro? Esto no se puede deshacer.\n\nDespués cargás el remito UNA sola vez y queda limpio.",{yes:"Sí, vaciar",danger:true})) return;
  try{
    const docs=PEDIDOS.filter(p=>p.tipo==="stock");
    if(!docs.length){ toast("No hay stock que vaciar"); return; }
    const main=stockRecord();
    toast("Limpiando "+docs.length+" registros… puede tardar 1 o 2 minutos, NO cierres la página");
    await borrarMovs(()=>true);                              // borra también los movimientos de la colección nueva
    const tareas=docs.map(d=> d.id===main.id ? {id:d.id,patch:{movs:[]}} : {id:d.id,patch:{tipo:"stock_viejo",movs:[]}});
    for(let i=0;i<tareas.length;i+=15){                       // tandas de 15 en paralelo
      await Promise.all(tareas.slice(i,i+15).map(t=>DB.update(t.id,t.patch)));
    }
    notify("✅ STOCK EN CERO\n\nSe limpiaron "+docs.length+" registros. Ahora cargá el remito UNA sola vez (Cargar stock).");
  }catch(e){ notify("⚠️ No pude vaciar el stock: "+(e&&e.message||e)); }
  setTimeout(()=>vistaOperador(),700);
}
/* Diagnóstico: prueba conexión, lectura y escritura, y muestra el resultado claro */
async function diagnosticoStock(){
  let r="🩺 DIAGNÓSTICO · versión "+APP_VERSION+"\n\n";
  r+="Datos: "+(DB.modo==="firebase"?"Firebase (nube) ✅":"⚠️ MODO LOCAL: solo este navegador, revisá la configuración")+"\n";
  try{ const u=(typeof firebase!=="undefined"&&firebase.auth&&firebase.auth().currentUser); r+="Usuario: "+(u?(u.email+" ✅"):"⚠️ SIN LOGIN (las escrituras pueden fallar)")+"\n"; }catch(e){ logErr("auto",e); }
  const docs=PEDIDOS.filter(p=>p.tipo==="stock");
  r+="Registros de stock: "+docs.length+(docs.length>1?" ⚠️ (duplicados: usá Reparar)":"")+"\n";
  const st=stockRecord();
  r+="Movimientos en el registro activo: "+((st&&st.movs&&st.movs.length)||0)+"\n";
  try{
    if(st){ await DB.update(st.id,{_ping:Date.now()}); r+="Prueba de escritura: ✅ OK\n"; }
    else { const id=await DB.create({tipo:"stock",min:{},movs:[]}); r+="Prueba de escritura (creación): ✅ OK\n"; }
  }catch(e){ r+="Prueba de escritura: ❌ FALLÓ → "+(e&&e.message||e)+"\n"; }
  try{
    const pid=await DB.create({tipo:"pedido",empresa:"labs",canal:"tiendanube",cliente:"_PRUEBA_DIAGNOSTICO",estado:"anulado",creado:Date.now(),ref:"",dir:"",ciudad:"",provincia:"",items:"",metodo:"correo"});
    r+="Prueba CREAR PEDIDO: ✅ OK\n";
    try{ await DB.delete(pid); r+="Prueba ELIMINAR: ✅ OK\n"; }catch(e2){ r+="Prueba ELIMINAR: ❌ → "+(e2&&e2.message||e2)+"\n"; }
  }catch(e){ r+="Prueba CREAR PEDIDO: ❌ FALLÓ → "+(e&&e.message||e)+"\n"; }
  try{
    if(typeof firebase!=="undefined" && firebase.firestore){
      const g=await firebase.firestore().collection("usuarios").doc("gestor@fullminent.org").get();
      r+="Usuario gestor: "+(g.exists?("rol "+(g.data().rol||"—")+" ✅"):"⚠️ NO EXISTE en usuarios (por eso no ve nada)")+"\n";
    }
  }catch(e){ r+="Usuario gestor: (no pude verificar: "+(e&&e.message||e)+")\n"; }
  notify(r+"\nSacale captura a este cartel y pasásela a Claude si algo está en ⚠️/❌.");
}
/* Fusiona todos los registros de stock duplicados en uno solo (los extra quedan anulados) */
async function repararStock(){
  const docs=PEDIDOS.filter(p=>p.tipo==="stock");
  if(docs.length<=1){ toast("El stock está sano (un solo registro)"); return; }
  const main=stockRecord();
  const movs=[...(main.movs||[])], vistos=new Set(movs.map(m=>m.ts+"|"+m.prod+"|"+m.tipo+"|"+m.cant));
  let min={...(main.min||{})}, zonas=main.zonas, margen=main.margen, correoGestion=main.correoGestion, descontar=main.descontar;
  for(const d of docs){ if(d.id===main.id) continue;
    (d.movs||[]).forEach(m=>{ const k=m.ts+"|"+m.prod+"|"+m.tipo+"|"+m.cant; if(!vistos.has(k)){ vistos.add(k); movs.push(m); } });
    min=Object.assign({},d.min||{},min); if(zonas==null)zonas=d.zonas; if(margen==null)margen=d.margen;
    if(correoGestion==null)correoGestion=d.correoGestion; if(descontar==null)descontar=d.descontar;
  }
  movs.sort((a,b)=>(a.ts||0)-(b.ts||0));
  const data={min,movs}; if(zonas!=null)data.zonas=zonas; if(margen!=null)data.margen=margen;
  if(correoGestion!=null)data.correoGestion=correoGestion; if(descontar!=null)data.descontar=descontar;
  await DB.update(main.id,data);
  for(const d of docs){ if(d.id!==main.id) await DB.update(d.id,{tipo:"stock_viejo",movs:[]}); }
  toast("Stock reparado: "+(docs.length-1)+" registro(s) duplicado(s) fusionado(s) ✅");
  setTimeout(()=>vistaOperador(),700);
}
/* ===== DEPÓSITOS POR MARCA: cada producto pertenece a una marca (su dueño) ===== */
function marcasRecord(){ return PEDIDOS.find(p=>p.tipo==="marcasProd"); }
function marcasProdMap(){ const r=marcasRecord(); return (r&&r.map)||{}; }
function marcaDeProducto(nombre){ return marcasProdMap()[nombre] || "labs"; }   // default: todo lo viejo es Labs
async function setMarcaProducto(nombre, marca){
  const r=marcasRecord(); const map=Object.assign({},(r&&r.map)||{}); map[nombre]=marca;
  if(r) await DB.update(r.id,{map}); else await DB.create({tipo:"marcasProd",map});
}
/* ===== Movimientos de stock =====
   Antes vivían TODOS dentro del documento "stock" (crecía sin límite y Firestore corta en 1 MB).
   Ahora cada movimiento nuevo va a su propia colección "movs"; los viejos se siguen leyendo del documento. */
let MOVS_EXT=[], MOVS_SUB=false;
function suscribirMovs(){
  if(MOVS_SUB || DB.modo!=="firebase") return;
  MOVS_SUB=true;
  try{
    firebase.firestore().collection("movs").onSnapshot(s=>{
      MOVS_EXT=s.docs.map(d=>({_id:d.id, ...d.data()}));
      if(typeof render==="function") try{ render(); }catch(e){ logErr("render movs",e); }
    }, e=>logErr("suscribir movs", e));
  }catch(e){ logErr("suscribir movs", e); }
}
async function agregarMovs(arr){
  const movs=(arr||[]).filter(Boolean).map(m=>({ts:Date.now(), ...m}));
  if(!movs.length) return;
  if(DB.modo==="firebase"){
    try{
      const col=firebase.firestore().collection("movs");
      for(let i=0;i<movs.length;i+=400){                      // Firestore: máx 500 operaciones por lote
        const lote=firebase.firestore().batch();
        movs.slice(i,i+400).forEach(m=>lote.set(col.doc(), m));
        await lote.commit();
      }
      MOVS_EXT=MOVS_EXT.concat(movs);                        // al toque en pantalla, sin esperar el snapshot
    }catch(e){
      logErr("guardar movimientos (uso el modo viejo)", e);   // si las reglas no dejan, guardo como antes
      const st=stockState(); st.movs=(stockRecord()&&stockRecord().movs||[]).concat(movs); await persistStock(st, true);
    }
  } else {
    const st=stockState(); st.movs=st.movs.concat(movs); await persistStock(st, true);
  }
}
/* Borra los movimientos que cumplan la condición (ej: deshacer el descuento de un pedido) */
async function borrarMovs(cond){
  if(DB.modo==="firebase"){
    const borrar=MOVS_EXT.filter(cond);
    for(const m of borrar){ try{ await firebase.firestore().collection("movs").doc(m._id).delete(); }catch(e){ logErr("borrar mov", e); } }
    MOVS_EXT=MOVS_EXT.filter(m=>!cond(m));
  }
  // los viejos (los que están adentro del documento stock) se filtran igual
  const r=stockRecord();
  if(r && (r.movs||[]).some(cond)){
    const quedan=(r.movs||[]).filter(m=>!cond(m));
    await DB.update(r.id,{movs:quedan});
  }
}
function stockState(){
  const r=stockRecord()||{}; let min={...(r.min||{})}, movs=(r.movs||[]).concat(MOVS_EXT);
  if(r.data){ for(const k in r.data){ const v=r.data[k]||{};   // migra formato viejo
    if(v.min) min[k]=v.min;
    if(v.cant) movs.push({ts:Date.now(),prod:k,tipo:"inicial",cant:v.cant,motivo:"Saldo inicial"}); } }
  return {min,movs,descontar:r.descontar,zonas:r.zonas,margen:r.margen,correoGestion:r.correoGestion};
}
function descuentoActivo(){ return stockState().descontar!==false; }
async function toggleDescuento(){ const st=stockState(); st.descontar=!st.descontar;
  await persistStock(st); toast(st.descontar?"Descuento de stock activado":"Descuento de stock desactivado"); vistaStock(); }
function nivel(prod,st){ return (st.movs||[]).filter(m=>m.prod===prod).reduce((s,m)=>s+(m.tipo==="salida"?-m.cant:m.cant),0); }
async function persistStock(st, conMovs){ const r=stockRecord();
  const data={min:st.min};
  if(conMovs) data.movs=st.movs;        // solo cuando hace falta reescribirlos (modo demo / reparación)
  if(st.descontar!==undefined) data.descontar=st.descontar;   // solo si está definido (undefined = ON por defecto)
  if(st.zonas!==undefined && st.zonas!==null) data.zonas=st.zonas;
  if(st.margen!==undefined && st.margen!==null) data.margen=st.margen;
  if(st.correoGestion!==undefined && st.correoGestion!==null) data.correoGestion=st.correoGestion;
  if(r) await DB.update(r.id,{...data,data:null});
  else await DB.create({tipo:"stock",...data}); }
async function pushMov(prod,tipo,cant,motivo,extra={}){
  await agregarMovs([{prod,tipo,cant:Math.abs(+cant||0),motivo:motivo||"",...extra}]); }
/* Descuenta del pool compartido los items de un pedido, etiquetando empresa+canal (imputación) */
async function descontarStockPedido(id, scanMap, forzar){
  const p=await DB.get(id); if(!p || (p.stockBajado && !forzar)) return;
  // Marcas "siempre Bs As" (Nutrivibe, Suplemundo) descuentan siempre. Labs que sale de Río Tercero NO descuenta del stock de Bs As.
  if(p.origen==="riotercero" && !saleSiempreBsAs(p.empresa)){
    await DB.update(id,{stockBajado:true, noDescuenta:true});   // marcado como despachado sin tocar stock Bs As
    return;
  }
  const items = (scanMap && Object.keys(scanMap).length)
    ? Object.entries(scanMap).filter(([,c])=>c>0).map(([prodNombre,c])=>({prodNombre, cant:c}))
    : itemsPedido(p);
  if(items.length){
    const an=anilloDe(p);                                    // zona del pedido
    const quien=p.metodo==="correo"?"Correo":(p.cadete||"sin asignar");
    await agregarMovs(items.map(it=>({prod:it.prodNombre,tipo:"salida",cant:Math.abs(it.cant||1),
        motivo:"Venta "+(p.ref||p.id),empresa:p.empresa,canal:canalDe(p),ref:p.ref||p.id,
        cliente:p.cliente||"",destino:[p.ciudad,p.provincia].filter(Boolean).join(", "),zona:an.label,quien:quien,pedidoId:p.id})));
  }
  await DB.update(id,{stockBajado:true});
}
async function setMin(map){ const st=stockState(); st.min=map; await persistStock(st); }
function demandaDe(prod,pick){ return pick.filter(r=>matchNombre(r.nombre,prod.nombre)).reduce((s,r)=>s+r.cant,0); }
/* Imputación: agrupa las salidas por venta según empresa + canal */
function imputacion(st){
  const sal=(st.movs||[]).filter(m=>m.tipo==="salida" && m.empresa);
  const g={};
  sal.forEach(m=>{ const k=(m.empresa||"?")+"|"+(m.canal||"?");
    if(!g[k]) g[k]={empresa:m.empresa,canal:m.canal,unidades:0,prods:{}};
    g[k].unidades+=m.cant; g[k].prods[m.prod]=(g[k].prods[m.prod]||0)+m.cant; });
  return Object.values(g).sort((a,b)=>b.unidades-a.unidades);
}
/* Lo que sacó cada empresa del pool, juntando canales (para la cuenta con el dueño del stock) */
function enRango(ts,desde,hasta){
  if(desde){ const d=new Date(desde+"T00:00:00").getTime(); if(ts<d) return false; }
  if(hasta){ const h=new Date(hasta+"T23:59:59").getTime(); if(ts>h) return false; }
  return true;
}
/* Informe de salidas: todo lo que se retiró del stock, por producto y por empresa */
let SAL_DESDE="", SAL_HASTA="", SAL_EXP={}, SAL_MIN=null;   // null = automático: desde el último cierre   // SAL_MIN: corte exacto del último cierre   // SAL_EXP: qué productos tienen abierto el detalle de "a dónde fue"
function salMinEfectivo(){ return SAL_MIN===null ? ultimoCierreTs() : SAL_MIN; }
function salidasResumen(desde,hasta){
  const st=stockState();
  const min=salMinEfectivo();
  const sal=(st.movs||[]).filter(m=>m.tipo==="salida" && (m.ts||0)>=min && enRango(m.ts,desde,hasta));
  const porProd={};
  sal.forEach(m=>{ const k=m.prod; if(!porProd[k]) porProd[k]={prod:k,total:0,porEmp:{},detalle:[]};
    porProd[k].total+=m.cant; const e=m.empresa||"—"; porProd[k].porEmp[e]=(porProd[k].porEmp[e]||0)+m.cant;
    porProd[k].detalle.push(m); });                                  // guardo cada salida para ver a dónde fue
  Object.values(porProd).forEach(r=>r.detalle.sort((a,b)=>(b.ts||0)-(a.ts||0)));
  const lista=Object.values(porProd).sort((a,b)=>b.total-a.total);
  const totEmp={}; sal.forEach(m=>{ const e=m.empresa||"—"; totEmp[e]=(totEmp[e]||0)+m.cant; });
  return {lista, total:sal.reduce((s,m)=>s+m.cant,0), totEmp};
}
let REP_DESDE="", REP_HASTA="", REP_SEL={};
