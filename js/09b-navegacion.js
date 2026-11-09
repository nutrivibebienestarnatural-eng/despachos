/* ============================================================
   09b-navegacion — El menú del admin, en 4 secciones
   Una sola lista manda: SECCIONES. Si agregás una pantalla nueva,
   la ponés acá y aparece sola en el menú y en la barra de arriba.
   ============================================================ */

/* Cada pantalla: id (lo que va en OPVIEW o el nombre del sub), nombre visible y la función que la dibuja */
const SECCIONES=[
  {id:"hoy", nombre:"Hoy", icono:"🎯", subs:[
    {id:"control",      nombre:"Tablero",        fn:"vistaControl"},
    {id:"controldia",   nombre:"Control del día",fn:"vistaControlDia"},
    {id:"hoy",          nombre:"Resumen del día",fn:"vistaHoy"},
    {id:"prepararhoy",  nombre:"Preparar",       fn:"vistaPrepararHoy"},
    {id:"despachar",    nombre:"📷 Despacho",    fn:"vistaDespachar"},
    {id:"checkout",     nombre:"Checkout",       fn:"pantallaCheckout"},
  ]},
  {id:"pedidos", nombre:"Pedidos", icono:"📦", subs:[
    {id:"pedidos",      nombre:"Todos",          fn:"vistaPedidos"},
    {id:"entregas",     nombre:"Entregas",       fn:"pantallaEntregas"},
    {id:"ruta",         nombre:"Hoja de ruta",   fn:"vistaRuta"},
    {id:"zonas",        nombre:"Zonas",          fn:"pantallaZonas"},
    {id:"repickeo",     nombre:"Repickeo",       fn:"pantallaRepickeo"},
    {id:"etiquetas",    nombre:"Etiquetas",      fn:"pantallaEtiquetas"},
  ]},
  {id:"stock", nombre:"Stock", icono:"🗃️", subs:[
    {id:"stock",        nombre:"Stock",          fn:"vistaStock"},
    {id:"salidas",      nombre:"Lo que salió",   fn:"pantallaSalidas"},
    {id:"minimos",      nombre:"Mínimos",        fn:"vistaMinimos"},
    {id:"cargarstock",  nombre:"Cargar remito",  fn:"pantallaCargarStock"},
    {id:"deposito",     nombre:"Depósito",       fn:"vistaDeposito"},
  ]},
  {id:"plata", nombre:"Plata", icono:"💰", subs:[
    {id:"cuenta",       nombre:"Cuenta",         fn:"pantallaCuenta"},
    {id:"cobro",        nombre:"Facturar",       fn:"pantallaCobro"},
    {id:"cortecaja",    nombre:"Corte de caja",  fn:"vistaCorteCaja"},
    {id:"cierre",       nombre:"Cierre",         fn:"pantallaCierre"},
  ]},
  {id:"mas", nombre:"Más", icono:"⋯", subs:[
    {id:"listados",     nombre:"Listados",       fn:"vistaListados"},
    {id:"consolidado",  nombre:"Consolidado",    fn:"vistaConsolidado"},
    {id:"exportar",     nombre:"Exportar",       fn:"vistaExportar"},
    {id:"informes",     nombre:"Informes",       fn:"vistaInformes"},
    {id:"cupones",      nombre:"Cupones",        fn:"vistaCupones"},
    {id:"panel",        nombre:"Panel viejo",    fn:"vistaPanel"},
  ]},
];
function subPorId(id){
  for(const s of SECCIONES){ const x=s.subs.find(y=>y.id===id); if(x) return {sec:s, sub:x}; }
  return null;
}
/* Ir a una pantalla por su id (sirve desde cualquier botón: irA('salidas')) */
function irA(id){
  const r=subPorId(id); if(!r){ logErr("navegar", "no existe la pantalla "+id); return; }
  OPVIEW=id; PREP_ID=null;
  vistaOperador();
  window.scrollTo(0,0);
}
/* Barra con las pantallas de la sección actual (reemplaza al viejo segOp) */
function segOp(activo){
  if(ROL!=="admin" || PREVIEW) return "";
  const r=subPorId(activo||OPVIEW); if(!r) return "";
  return `<div class="row navsec" style="justify-content:space-between;margin-bottom:14px"><div class="seg" style="flex-wrap:wrap">${
    r.sec.subs.map(s=>`<button class="${s.id===(activo||OPVIEW)?'on':''}" onclick="irA('${s.id}')">${esc(s.nombre)}</button>`).join("")
  }</div></div>`;
}
/* Menú lateral: 4 secciones + Importar y Salir */
function pintarSidebar(){
  const sb=document.getElementById("sidebar"); if(!sb) return;
  if(ROL!=="admin" || PREVIEW){ document.body.classList.remove("sys"); sb.innerHTML=""; return; }
  document.body.classList.add("sys");
  const ped=(typeof soloPedidos==="function")?soloPedidos():[];
  const badge={
    hoy: ped.filter(p=>p.estado==="pendiente").length,
    pedidos: ped.filter(p=>!p.cerradoEn && !["entregado","confirmado","anulado"].includes(p.estado)).length,
    stock: 0,
    plata: ped.filter(p=>p.estado!=="anulado" && !p.cobradoEn && facturable(p)).length,
    mas: 0,
  };
  const actual=(subPorId(OPVIEW)||{}).sec||{};
  sb.innerHTML=`<div class="logo-sys">
      <div class="logo-mark">F</div>
      <div class="logo-txt">Fullminet<small>Sistema de despacho</small></div>
    </div>
    ${SECCIONES.map(s=>`<button class="nav ${actual.id===s.id?'on':''}" onclick="irA('${s.subs[0].id}')">
      <span style="width:20px;text-align:center;font-size:15px">${s.icono}</span>${esc(s.nombre)}${badge[s.id]?`<span class="b">${badge[s.id]}</span>`:''}</button>`).join("")}
    <div class="sp"></div>
    <button class="nav" onclick="formImportar()"><span style="width:20px;text-align:center;font-size:15px">⬇️</span>Importar</button>
    <button class="nav" onclick="salir()"><span style="width:20px;text-align:center;font-size:15px">🚪</span>Salir</button>`;
}
/* Dibuja la pantalla pedida y, arriba, la barra de su sección.
   Las pantallas viejas (pantallaCuenta, pantallaSalidas…) no traen barra: se la agrego acá. */
function dibujarSub(id){
  const r=subPorId(id); if(!r) return false;
  const fn=window[r.sub.fn];
  if(typeof fn!=="function"){ logErr("navegar", "falta la función "+r.sub.fn); return false; }
  fn();
  const app=document.getElementById("app");
  if(app && ROL==="admin" && !PREVIEW && !app.querySelector(".navsec")){   // si la pantalla ya la trae, no la repito
    app.insertAdjacentHTML("afterbegin", segOp(id));
  }
  return true;
}

/* Router: una sola puerta para dibujar la pantalla que toca */
function vistaOperador(){
  try{ pintarSidebar(); }catch(e){ logErr("menú", e); }
  if(OPVIEW==="preparar" && PREP_ID) return pantallaPreparar(PREP_ID);
  if(OPVIEW==="preparacion") return vistaPreparacion();        // vista previa del operador
  if(!subPorId(OPVIEW)) OPVIEW="control";                      // al entrar, el tablero
  return dibujarSub(OPVIEW);
}
