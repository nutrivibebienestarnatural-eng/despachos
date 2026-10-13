/* ============================================================
   04-utiles — Estado en memoria y utilidades generales
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
let PEDIDOS=[], ROL=null, CADETE_ACTIVO=null, FILTRO="todos", OPVIEW="control", EMPLEADO=false, PED_Q="", SOLO_FOTO=false;
let USER=null, USERROL=null, AUTH_READY=false, SUBSCRITO=false, PREVIEW=null;
let STOCK_DESDE="", STOCK_HASTA="", STOCK_Q="", STOCK_TODOS=false, DEPOSITO_ACTIVO="";
let ENT_DESDE="", ENT_HASTA="";
let SIM=null, SIM_STEP=0, SIM_METODO="cadete", SIM_TIMER=null;   // simulación del ciclo
let LISTA_OP=[];   // último listado mostrado al operador (para imprimir en lote)
let RUTA_ACTUAL=[];// hoja de ruta calculada (para Maps/impresión)
const $=s=>document.querySelector(s);
const app=()=>$("#app");
/* Mantener el foco al redibujar: si estabas escribiendo en un buscador y la pantalla se vuelve a pintar,
   el cursor vuelve al mismo campo y posición (así no hay que tocar el campo letra por letra) */
(function(){
  let foco=null;
  document.addEventListener("input",e=>{ const t=e.target;
    if(t&&t.id&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA")&&t.type!=="file"&&t.type!=="checkbox") foco={id:t.id,s:t.selectionStart,e:t.selectionEnd,ts:Date.now()}; },true);
  const iniciar=()=>{
    const root=document.getElementById("app"); if(!root) return;
    new MutationObserver(()=>{
      if(!foco||Date.now()-foco.ts>3000) return;
      const el=document.getElementById(foco.id);
      if(el&&document.activeElement!==el){ el.focus();
        try{ el.setSelectionRange(foco.s,foco.e); }catch(_){ logErr("auto",_); } }
    }).observe(root,{childList:true,subtree:true});
  };
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",iniciar); else iniciar();
})();
/* Pantalla completa: oculta menú lateral + barra superior y, si el navegador lo permite, pide fullscreen real */
function toggleZen(){
  const on=document.body.classList.toggle("zen");
  try{
    if(on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
    else if(!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  }catch(e){ logErr("auto",e); }
}
function zenBtn(){ const on=document.body.classList.contains("zen");
  return `<button class="btn sm ghost" onclick="toggleZen()">${on?'✕ Salir de pantalla completa':'⛶ Pantalla completa'}</button>`; }
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=ts=>{ if(!ts)return""; const d=new Date(ts);
  return d.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}); };
const soloPedidos=()=>PEDIDOS.filter(p=>!p.tipo||p.tipo==="pedido");
const numOrden=p=>{ const r=((p&&p.ref)||"").trim(); if(r) return r.startsWith("#")?r:("#"+r); return (p&&p.id)||""; };   // N° de orden con # adelante
/* ===== Etiqueta PDF del correo (la que genera Tienda Nube) ===== */
function leerArchivoBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader();
  r.onload=()=>res(String(r.result).split(",")[1]||""); r.onerror=rej; r.readAsDataURL(file); }); }
async function archivoEtiqueta(file){
  if(!file) return null;
  if(file.size>700*1024){ notify("Ese PDF pesa mucho ("+Math.round(file.size/1024)+" KB). Tiene que ser menor a 700 KB."); return null; }
  const b64=await leerArchivoBase64(file);
  return {etiquetaPdf:b64, etiquetaPdfNombre:file.name||"etiqueta-correo.pdf"};
}
async function adjuntarEtiquetaCorreo(id,file){
  const dat=await archivoEtiqueta(file); if(!dat) return;
  await DB.update(id,dat); toast("Etiqueta del correo adjuntada 📎"); vistaOperador();
}
/* ===== Foto del pedido preparado (control) ===== */
// Se achica y comprime a JPEG para que entre en el documento de Firestore (límite 1 MB)
function comprimirFoto(file,max=1100,calidad=0.6){ return new Promise((res,rej)=>{
  const url=URL.createObjectURL(file); const img=new Image();
  img.onload=()=>{ const k=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
    let q=calidad, d=c.toDataURL("image/jpeg",q);
    while(d.length>650*1024 && q>0.25){ q-=0.1; d=c.toDataURL("image/jpeg",q); }
    res(d); };
  img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen")); };
  img.src=url; }); }
/* ===== Guardado de fotos =====
   Firestore permite 1 MB por documento y el pedido ya puede traer el PDF de la etiqueta.
   Por eso en el pedido va SOLO una miniatura liviana, y la foto grande se guarda aparte. */
