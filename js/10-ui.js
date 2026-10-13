/* ============================================================
   10-ui — Piezas de interfaz, render principal y navegación por rol
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
function askConfirm(msg,opts){
  opts=opts||{};
  return new Promise(resolve=>{
    const ov=document.createElement("div"); ov.className="dlg-ov"; ov._resolve=resolve;
    const {c,e}=dlgIcono(msg), {t,b}=dlgPartes(msg);
    ov.innerHTML=`<div class="dlg-card">
      <div class="dlg-ico ${c}">${e}</div>
      ${t?`<div class="dlg-title">${esc(t)}</div>`:""}
      ${b?`<div class="dlg-body">${esc(b)}</div>`:""}
      <div class="dlg-acts">
        <button class="btn block ghost" data-no>${esc(opts.no||"Cancelar")}</button>
        <button class="btn block ${opts.danger?"red":""}" data-yes>${esc(opts.yes||"Confirmar")}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(()=>ov.classList.add("show"));
    ov.addEventListener("click",ev=>{ if(ev.target===ov) dlgCerrar(ov,false); });
    ov.querySelector("[data-no]").addEventListener("click",()=>dlgCerrar(ov,false));
    ov.querySelector("[data-yes]").addEventListener("click",()=>dlgCerrar(ov,true));
    ov.querySelector("[data-yes]").focus();
  });
}
const linkCliente=id=>location.origin+location.pathname+"?p="+id;
function copiarAcceso(rol){ const u=location.origin+location.pathname+"?rol="+rol;
  navigator.clipboard?.writeText(u).then(()=>toast("Link de "+rol+" copiado"),()=>prompt("Link:",u)); }
/* Formatea un teléfono al formato internacional de WhatsApp Argentina (54 9 ...) */
function waTel(tel){ let d=(tel||"").replace(/\D/g,""); if(!d) return "";
  if(d.startsWith("54")) return d.startsWith("549")?d:("549"+d.slice(2));
  if(d.startsWith("9")) return "54"+d;
  return "549"+d; }
/* Íconos SVG (un solo estilo: trazo, esquinas redondeadas). icon('box') -> <svg…> */
const ICONS={
  box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  truck:'<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  panel:'<rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="5" rx="1.6"/><rect x="13" y="11" width="8" height="10" rx="1.6"/><rect x="3" y="14" width="8" height="7" rx="1.6"/>',
  pin:'<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="M8.3 12.4l2.4 2.4 4.9-5.1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  route:'<circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8.2 6H14a3.2 3.2 0 0 1 3.2 3.2v6.5"/>',
  upload:'<path d="M12 16V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  printer:'<path d="M7 9V3.5h10V9"/><path d="M5 9h14a2 2 0 0 1 2 2v6h-4v-3.5H7V17H3v-6a2 2 0 0 1 2-2z"/><path d="M7 16h10v4.5H7z"/>',
  play:'<path d="M8 5.5v13l11-6.5z"/>',
  store:'<path d="M4.5 9.5V20h15V9.5"/><path d="M3 9.5L4.6 4h14.8L21 9.5a2.3 2.3 0 0 1-4.4 1 2.3 2.3 0 0 1-4.3 0 2.3 2.3 0 0 1-4.3 0A2.3 2.3 0 0 1 3 9.5z"/>',
  arrow:'<path d="M9 6l6 6-6 6"/>'
};
const icon=(n,cls="ico")=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||""}</svg>`;
const empty=(ic,txt)=>`<div class="empty"><div class="e-ico">${icon(ic)}</div><p>${txt}</p></div>`;

/* =========================================================================
   6) ACCIONES
   ========================================================================= */
async function avanzar(id, nuevo, nota="", extra={}){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const eventos=(p.eventos||[]).concat([{estado:nuevo,ts:Date.now(),nota}]);
  await DB.update(id,{estado:nuevo,eventos,...extra});
  if(nuevo==="preparado" && descuentoActivo()) await descontarStockPedido(id);
  toast("Estado: "+estObj(nuevo).label);
}
async function asignarCadete(id,cadete){ await avanzar(id,"asignado","Asignado a "+cadete,{cadete}); }
async function crearPedido(d){
  const r=sugerirRuta(d.provincia,d.ciudad);
  const emp=empresaObj(d.empresa);
  const id=await DB.create({tipo:"pedido",empresa:emp.id,canal:d.canal||emp.canalDefault,ref:d.ref||"",
    cliente:d.cliente,tel:d.tel||"",dir:d.dir||"",ciudad:d.ciudad||"",provincia:d.provincia||"",cp:d.cp||"",
    etiquetaPdf:d.etiquetaPdf||"",etiquetaPdfNombre:d.etiquetaPdfNombre||"",etiquetaMotivo:d.etiquetaPdf?"":(d.etiquetaMotivo||""),nota:d.nota||"",zonaFija:(d.zonaFija!=null?d.zonaFija:""),
    items:d.items||"",prods:(d.prods&&d.prods.length)?d.prods:prodsDesdeTexto(d.items||"").ok,origen:d.origen||r.origen,metodo:d.metodo||r.metodo,pickit:!!d.pickit,envio:d.envio||"",
    correo:d.correo||"",tracking:d.tracking||"",tnId:d.tnId||"",mlId:d.mlId||"",mlOrderIds:d.mlOrderIds||[],cadete:"",estado:"pendiente",creado:Date.now(),
    eventos:[{estado:"pendiente",ts:Date.now(),nota:"Pedido creado"}]});
  return id;
}
async function crearReabas(detalle){
  await DB.create({tipo:"reabastecimiento",detalle,estado:"prep_rt",creado:Date.now(),
    eventos:[{estado:"prep_rt",ts:Date.now(),nota:"Creado"}]});
  toast("Reabastecimiento creado");
}
async function avanzarReabas(id,nuevo){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  const eventos=(p.eventos||[]).concat([{estado:nuevo,ts:Date.now(),nota:""}]);
  await DB.update(id,{estado:nuevo,eventos});
  toast("Reabastecimiento: "+reabasObj(nuevo).label);
}
function copiarLink(id){ const u=linkCliente(id);
  navigator.clipboard?.writeText(u).then(()=>toast("Link copiado"),()=>prompt("Link:",u)); }
function waCliente(id){ const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  const msg=`Hola ${p.cliente}! Acá podés seguir tu pedido ${p.id} en vivo y, cuando lo recibas, confirmar la recepción: ${linkCliente(id)}`;
  const tel=waTel(p.tel);
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,"_blank"); }
/* Cadete: marca "en reparto" y abre WhatsApp avisando al cliente (desde el celu, un toque) */
function salirReparto(id){ const p=PEDIDOS.find(x=>x.id===id); if(!p)return;
  const msg=`Hola ${p.cliente}! Tu pedido ${p.id} ya salió y está en reparto. Seguilo en vivo y confirmá la recepción acá: ${linkCliente(id)}`;
  window.open(`https://wa.me/${waTel(p.tel)}?text=${encodeURIComponent(msg)}`,"_blank"); // sincrónico: evita bloqueo de popup
  avanzar(id,"en_reparto","Salió a repartir · avisado por WhatsApp"); }

/* =========================================================================
   7) RENDER
   ========================================================================= */
function render(){
  const q=new URLSearchParams(location.search);
  const pid=q.get("p");
  if(pid){ ROL="cliente"; return vistaCliente(pid); }   // cliente: SIN login

  // el link ?rol=operador fuerza el modo preparar (para el celu de la empleada), aunque haya login
  const rolLink=q.get("rol");
  if(rolLink==="operador"||rolLink==="empleado"){ ROL="operador"; EMPLEADO=true; if(OPVIEW!=="despachar") OPVIEW="prepararhoy"; }
  else if(rolLink==="despacho"){ ROL="operador"; EMPLEADO=true; SOLO_FOTO=true; OPVIEW="despachar"; }   // link para quien solo saca fotos, sin pestañas ni navegación
  else if(DB.modo==="firebase"){
    if(!AUTH_READY) return vistaCargando();
    if(!USER)       return vistaLogin();
    if(!USERROL)    return vistaSinAcceso();
    ROL=USERROL;                                          // rol real, desde la cuenta
  } else {
    if(!ROL){ const r=q.get("rol");                       // modo demo: rol por link
      if(r==="cadete"){ ROL="cadete"; const c=q.get("cadete"); if(c) CADETE_ACTIVO=decodeURIComponent(c); }
      else if(r==="admin"){ ROL="admin"; }
    }
    if(!ROL) return vistaInicio();
  }
  EMPLEADO=(ROL==="operador");
  const rb=$("#roleBtn"); if(rb){ rb.style.display=(ROL==="admin"||ROL==="sim"||DB.modo==="firebase")?"inline-block":"none"; rb.textContent=(DB.modo==="firebase"?"Salir":"Cambiar rol"); }
  if(ROL==="sim")      return vistaSimulacion();
  if(ROL==="admin"){
    if(PREVIEW==="operador"){ OPVIEW="preparacion"; vistaPreparacion(); return bannerPreview("Operador"); }
    if(PREVIEW==="cadete"){ if(!CADETE_ACTIVO){ vistaElegirCadete(); } else { vistaCadete(); } return bannerPreview("Reparto"); }
    return vistaOperador();
  }
  if(ROL==="operador"){ if(OPVIEW==="despachar") return vistaDespachar(); OPVIEW="prepararhoy"; return vistaPrepararHoy(); }
  if(ROL==="cadete")   return CADETE_ACTIVO?vistaCadete():vistaElegirCadete();
}
function verComo(r){ PREVIEW=r; CADETE_ACTIVO=null; render(); }
function salirPreview(){ PREVIEW=null; CADETE_ACTIVO=null; OPVIEW="panel"; render(); }
function bannerPreview(label){ const a=app();
  a.innerHTML=`<div style="background:#1d1d1f;color:#fff;border-radius:12px;padding:11px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:10px">
    <span style="font-weight:600">Vista previa · ${esc(label)} <span style="opacity:.6;font-weight:400">(así lo ve esa persona)</span></span>
    <button class="btn sm" style="background:#fff;color:#000;flex:0 0 auto" onclick="salirPreview()">Volver a Admin</button>
  </div>`+a.innerHTML;
}
function copiarLinkApp(){ const u=location.origin+location.pathname;
  try{ navigator.clipboard.writeText(u); }catch(e){ logErr("auto",e); }
  toast("Link de la app copiado"); }
function vistaCargando(){ $("#roleBtn").style.display="none";
  app().innerHTML=`<div class="center" style="margin-top:120px">
    <div class="spin"></div>
    <div class="subtitle" style="margin-top:16px">Cargando…</div>
  </div>`; }
function vistaLogin(){
  $("#roleBtn").style.display="none";
  app().innerHTML=`
    <div class="center" style="margin-top:40px">
      <div class="title">Fullminet</div>
      <div class="subtitle">Ingresá con tu usuario</div>
    </div>
    <div class="card" style="max-width:380px;margin:18px auto 0">
      <div class="field"><span class="label">Email</span><input id="lg_mail" type="email" autocomplete="username" placeholder="tu@email.com"></div>
      <div class="field"><span class="label">Contraseña</span><input id="lg_pass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div id="lg_err" class="hint" style="color:var(--red);min-height:18px;margin:4px 2px"></div>
      <button class="btn block" onclick="entrar()">Entrar</button>
    </div>`;
  const go=e=>{ if(e.key==="Enter") entrar(); };
  const m=$("#lg_mail"), pw=$("#lg_pass"); if(m){m.onkeydown=go;} if(pw){pw.onkeydown=go;}
}
async function entrar(){
  const mail=($("#lg_mail").value||"").trim(), pass=$("#lg_pass").value||"";
  if(!mail||!pass){ $("#lg_err").textContent="Completá email y contraseña."; return; }
  $("#lg_err").textContent="Entrando…";
  try{ await firebase.auth().signInWithEmailAndPassword(mail,pass); }
  catch(e){ $("#lg_err").textContent="Email o contraseña incorrectos."; }
}
function vistaSinAcceso(){
  $("#roleBtn").style.display="inline-block";
  app().innerHTML=`<div class="center" style="margin-top:70px">
    <div class="title">Sin acceso</div>
    <p class="muted" style="margin-top:10px">Tu cuenta (${esc(USER&&USER.email||"")}) todavía no tiene un rol asignado.<br>Pedile al administrador que te habilite.</p>
    <button class="btn ghost" style="margin-top:18px" onclick="salir()">Salir</button></div>`;
}
async function salir(){ try{ await firebase.auth().signOut(); }catch(e){ logErr("auto",e); } }

function vistaInicio(){
  $("#roleBtn").style.display="none";
  app().innerHTML=`
    <div class="center" style="margin-top:30px">
      <div class="title">Sistema de despacho</div>
      <div class="subtitle">Río Tercero + depósito Bs As · Cadete y correo</div>
    </div>
    <div class="roles">
      <button class="role-card" onclick="setRol('admin')">
        <span class="rc-ico">${icon('panel')}</span>
        <span><h3>Admin</h3><p>Ves y controlás todo: pedidos, stock, ruta, facturación.</p></span>
        <span class="rc-go">${icon('arrow')}</span></button>
      <button class="role-card" onclick="setRol('operador')">
        <span class="rc-ico">${icon('box')}</span>
        <span><h3>Operador</h3><p>Solo prepara: ve qué pickear y arma los pedidos. Sin precios ni stock.</p></span>
        <span class="rc-go">${icon('arrow')}</span></button>
      <button class="role-card" onclick="setRol('cadete')">
        <span class="rc-ico">${icon('truck')}</span>
        <span><h3>Reparto</h3><p>Ve sus entregas del día y confirma con el escaneo.</p></span>
        <span class="rc-go">${icon('arrow')}</span></button>
      <button class="role-card" onclick="notify('La vista del cliente se abre desde el link de seguimiento de cada pedido.')">
        <span class="rc-ico">${icon('pin')}</span>
        <span><h3>Cliente</h3><p>Recibe un link, ve el estado en vivo y confirma la recepción.</p></span>
        <span class="rc-go">${icon('arrow')}</span></button>
    </div>
    <div class="center" style="margin-top:20px">
      <button class="btn ghost" onclick="abrirSim()">${icon('play')} Ver simulación del ciclo completo</button>
    </div>
    <p class="center muted" style="margin-top:22px;font-size:13px">
      Modo de datos: <b>${DB.modo==="demo"?"Demo (este navegador)":"Firebase (en vivo)"}</b></p>`;
}
function setRol(r){ stopPlay(); ROL=r; CADETE_ACTIVO=null; render(); }
function goHome(){ stopPlay();
  if(DB.modo==="firebase"){ return salir(); }   // con login, "Cambiar rol" = Salir
  ROL=null; CADETE_ACTIVO=null; history.replaceState({},"",location.pathname); render(); }

/* ---------- OPERADOR ---------- */
