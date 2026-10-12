/* ============================================================
   02-estados — Estados del pedido, sugerencia de ruta y registro de errores
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
const EST = {
  pendiente: {label:"Pendiente",            desc:"Pedido recibido, falta preparar",            color:"var(--text-3)"},
  preparado: {label:"Preparado",            desc:"Empaquetado y rotulado",                     color:"var(--amber)"},
  asignado:  {label:"Asignado a cadete",    desc:"Un cadete lo tomó para repartir",            color:"var(--accent)"},
  en_reparto:{label:"En reparto",           desc:"El cadete salió a entregar",                 color:"var(--accent)"},
  despachado:{label:"Despachado al correo", desc:"Entregado al correo con nº de seguimiento",   color:"var(--amber)"},
  en_camino: {label:"En camino",            desc:"Viajando por correo al destino",             color:"var(--accent)"},
  entregado: {label:"Entregado",            desc:"Llegó al cliente",                           color:"var(--green)"},
  confirmado:{label:"Confirmado por cliente",desc:"El cliente confirmó la recepción",          color:"var(--green)"},
  anulado:   {label:"Anulado",              desc:"Pedido anulado, no se despacha",            color:"var(--red)"},
  finalizado:{label:"Finalizado",           desc:"Entregado y cobrado. Cerrado.",              color:"#5a5a5e"},
};
const FLUJO_CADETE = ["pendiente","preparado","asignado","en_reparto","entregado","confirmado"];
const FLUJO_CORREO = ["pendiente","preparado","despachado","en_camino","entregado","confirmado"];
const flujo  = p => (p && p.metodo==="correo") ? FLUJO_CORREO : FLUJO_CADETE;
const idxEst = p => flujo(p).indexOf(p.estado);
const estObj = id => EST[id] || EST.pendiente;

/* Reabastecimiento: envío en bloque Río Tercero → depósito Bs As */
const REABAS = [
  {id:"prep_rt",     label:"Preparando en Río Tercero", color:"var(--text-3)"},
  {id:"en_transito", label:"En tránsito a Bs As",       color:"var(--amber)"},
  {id:"recibido",    label:"Recibido en depósito",      color:"var(--green)"},
];
const reabasObj = id => REABAS.find(e=>e.id===id) || REABAS[0];

/* Canales de venta */
const CANAL = {
  tiendanube:{label:"Tienda Nube", cls:"tn"},
  ml_flex:   {label:"ML Flex",     cls:"flex"},
  manual:    {label:"Manual",      cls:""},
};

/* =========================================================================
   3) SUGERENCIA DE RUTA
   Regla simple: AMBA → cadete desde Bs As (mismo día / Flex).
   Otra provincia → correo (por defecto desde Bs As, que suele convenir).
   Es solo una sugerencia: el operador siempre puede cambiarla.
   ========================================================================= */
function sugerirRuta(provincia, ciudad){
  const t=((provincia||"")+" "+(ciudad||"")).toLowerCase();
  const esAMBA = /caba|capital federal|ciudad aut|ciudad de buenos aires/.test(t)
    || (/buenos aires/.test(t) && /(lan[uú]s|avellaneda|quilmes|san isidro|vicente l[oó]pez|mor[oó]n|matanza|tigre|lomas|san mart[ií]n|tres de febrero|berazategui|florencio varela|ituzaing[oó]|hurlingham|escobar|pilar|merlo|moreno|jos[eé] c\. paz|malvinas)/.test(t));
  if(esAMBA) return {metodo:"cadete",origen:"bsas"};            // AMBA: cadete propio / Flex
  if(/c[oó]rdoba/.test(t)) return {metodo:"correo",origen:"riotercero"}; // tu provincia: sale de RT
  return {metodo:"correo",origen:"bsas"};                        // resto del interior: conviene capital
}

/* =========================================================================
   3.9) ERRORES: nada se pierde en silencio
   ========================================================================= */
const ERRORES=[];
function logErr(donde, e, grave){
  const msg=String((e&&e.message)||e||"");
  const reg={donde:String(donde||"?"), msg, stack:String((e&&e.stack)||"").split("\n").slice(0,3).join(" | "), ts:Date.now()};
  ERRORES.unshift(reg); if(ERRORES.length>80) ERRORES.pop();
  console.warn("[error]", reg.donde, msg, e);
  if(grave){
    try{ toast("⚠ "+reg.donde+": "+msg.slice(0,90)); }catch(_){ logErr("auto",_); }
    avisarErrorTelegram(reg);
  }
  return reg;
}
let ERR_ULTIMO_AVISO=0;
function avisarErrorTelegram(reg){
  if(Date.now()-ERR_ULTIMO_AVISO < 60000) return;            // como mucho un aviso por minuto
  ERR_ULTIMO_AVISO=Date.now();
  try{ if(typeof enviarTelegram==="function")
    enviarTelegram("🐞 ERROR EN LA APP\n\n"+reg.donde+"\n"+reg.msg+"\n\n"+(ROL||"?")+" · "+new Date(reg.ts).toLocaleString("es-AR"));
  }catch(_){ logErr("auto",_); }
}
/* Errores que nadie atrapó: antes quedaban solo en la consola */
window.addEventListener("error", e=>{ logErr("pantalla", e.error||e.message, true); });
window.addEventListener("unhandledrejection", e=>{ logErr("tarea en segundo plano", e.reason, true); });

/* =========================================================================
   4) CAPA DE DATOS (Firebase o modo demo). Interfaz única.
   ========================================================================= */
