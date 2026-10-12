/* ============================================================
   15-arranque — Simulación del ciclo y arranque de la app
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
function simOrden(){
  return SIM_METODO==="correo" ? {
    id:"DEMO-CO",empresa:"labs",canal:"tiendanube",ref:"#1188",cliente:"Diego Ramírez",tel:"2615559988",
    dir:"Las Heras 220",ciudad:"Mendoza",provincia:"Mendoza",items:"1x Creatina · 1x NAD+",
    origen:"bsas",metodo:"correo",correo:"Andreani",tracking:"3500099887766",estado:"pendiente"
  } : {
    id:"DEMO-CA",empresa:"nutrivibe",canal:"ml_flex",ref:"#2000345",cliente:"Jorge Pérez",tel:"1156781234",
    dir:"Thames 800, PB",ciudad:"Palermo",provincia:"CABA",items:"1x Vitamina D3 K2 · 1x Complex B",
    origen:"bsas",metodo:"cadete",cadete:"Cadete CABA 1",estado:"pendiente"
  };
}
function simPasos(){
  return SIM_METODO==="correo" ? [
    {rol:"Canal",   actor:"Tienda Nube / ML Flex", estado:"pendiente", t:"Entra el pedido",        d:"Cae una venta a Mendoza. La app sugiere correo desde Bs As."},
    {rol:"Bs As",   actor:"Operador",              estado:"preparado", t:"Prepara y empaqueta",     d:"Arma el paquete en el depósito."},
    {rol:"Bs As",   actor:"Operador",              estado:"preparado", t:"Imprime la etiqueta",     d:"La pega en el paquete. Lleva los datos y el QR de seguimiento.", etiqueta:true},
    {rol:"Bs As",   actor:"Operador",              estado:"despachado",t:"Despacha al correo",      d:"Lo entrega a Andreani y carga el número de seguimiento."},
    {rol:"Andreani",actor:"Correo",                estado:"en_camino", t:"En camino",               d:"El paquete viaja hacia Mendoza."},
    {rol:"Andreani",actor:"Correo",                estado:"entregado", t:"Entregado",               d:"Llega al domicilio del cliente."},
    {rol:"Mendoza", actor:"Cliente",               estado:"confirmado",t:"Confirma la recepción",   d:"Desde su link confirma que lo recibió.", cliente:true},
  ] : [
    {rol:"Canal", actor:"Tienda Nube / ML Flex", estado:"pendiente", t:"Entra el pedido",      d:"Cae una venta en CABA. La app sugiere cadete desde Bs As (mismo día)."},
    {rol:"Bs As", actor:"Operador",              estado:"preparado", t:"Prepara y empaqueta",   d:"Arma el paquete en el depósito."},
    {rol:"Bs As", actor:"Operador",              estado:"preparado", t:"Imprime la etiqueta",   d:"La pega en el paquete. Lleva los datos y el QR de seguimiento.", etiqueta:true},
    {rol:"Bs As", actor:"Operador",              estado:"asignado",  t:"Asigna a un cadete",    d:"Le pasa el pedido al cadete de la zona."},
    {rol:"CABA",  actor:"Cadete",                estado:"en_reparto",t:"Sale a repartir",       d:"El cadete arranca el reparto y lo ve en su celular."},
    {rol:"CABA",  actor:"Cadete",                estado:"entregado", t:"Entrega y saca foto",   d:"Deja el paquete y registra la foto de comprobante.", foto:true},
    {rol:"CABA",  actor:"Cliente",               estado:"confirmado",t:"Confirma la recepción", d:"Desde su link confirma que lo recibió.", cliente:true},
  ];
}
function abrirSim(){ ROL="sim"; SIM_METODO="cadete"; simReset(); }
function setSimMetodo(m){ SIM_METODO=m; simReset(); }
function simReset(){ SIM=simOrden(); SIM_STEP=0; SIM.estado=simPasos()[0].estado; stopPlay(); vistaSimulacion(); }
function stopPlay(){ if(SIM_TIMER){ clearInterval(SIM_TIMER); SIM_TIMER=null; } }
function simNext(){ const ps=simPasos();
  if(SIM_STEP<ps.length-1){ SIM_STEP++; SIM.estado=ps[SIM_STEP].estado; } else stopPlay();
  vistaSimulacion(); }
function simPrev(){ if(SIM_STEP>0){ SIM_STEP--; SIM.estado=simPasos()[SIM_STEP].estado; } vistaSimulacion(); }
function simPlay(){ if(SIM_TIMER){ stopPlay(); vistaSimulacion(); return; }
  SIM_TIMER=setInterval(()=>{ if(SIM_STEP>=simPasos().length-1){ stopPlay(); vistaSimulacion(); } else simNext(); },1700);
  vistaSimulacion(); }
function vistaSimulacion(){
  if(ROL!=="sim") return;
  if(!SIM) SIM=simOrden();
  const ps=simPasos(), step=ps[SIM_STEP], fl=flujo(SIM), actual=idxEst(SIM);
  const tl=fl.map((eid,i)=>{ const e=estObj(eid); const cls=i<actual?"done":i===actual?"current":"pending";
    return `<div class="step ${cls}"><div class="pt"></div><div class="s-t">${e.label}</div></div>`; }).join("");
  app().innerHTML=`
    <div class="title">Simulación del ciclo</div>
    <div class="subtitle">Mirá cómo viaja un pedido de punta a punta</div>
    <div class="seg" style="margin-bottom:16px">
      <button class="${SIM_METODO==='cadete'?'on':''}" onclick="setSimMetodo('cadete')">Cadete (AMBA)</button>
      <button class="${SIM_METODO==='correo'?'on':''}" onclick="setSimMetodo('correo')">Correo (interior)</button>
    </div>
    <div class="card">
      <div class="row" style="gap:8px">
        <span class="chip">${esc(step.rol)}</span>
        <span class="badge"><span class="dot" style="background:${estObj(step.estado).color}"></span>${estObj(step.estado).label}</span>
      </div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-.01em;margin-top:12px">${esc(step.t)}</div>
      <div class="muted" style="margin-top:4px">${esc(step.actor)} · ${esc(step.d)}</div>
      ${step.etiqueta?`<div style="margin-top:16px"><style>${ETQ_CSS}</style>
        <div style="height:calc(${LABEL_MM.h}mm * .72);overflow:hidden"><div style="transform:scale(.72);transform-origin:top left;width:${LABEL_MM.w}mm">${etiquetaBody(SIM)}</div></div>
        <button class="btn sm" style="margin-top:12px" onclick="imprimirEtiqueta('${SIM.id}')">${icon('printer')}Imprimir etiqueta</button></div>`:""}
      ${step.foto?`<div class="proof" style="margin-top:16px"><span class="label">Foto de comprobante</span>
        <div style="height:140px;border-radius:12px;border:.5px dashed var(--border-2);display:flex;align-items:center;justify-content:center;color:var(--text-3)">Acá el cadete saca la foto</div></div>`:""}
      ${step.cliente?`<div style="margin-top:16px"><button class="btn green block" onclick="simNext()">Sí, lo recibí ✓ <span class="muted" style="font-size:13px">(lo toca el cliente)</span></button></div>`:""}
    </div>
    <div class="row" style="margin:16px 0;justify-content:center">
      <button class="btn ghost sm" onclick="simPrev()">← Anterior</button>
      <button class="btn" onclick="simPlay()">${SIM_TIMER?"Pausar":"Reproducir todo"}</button>
      <button class="btn ghost sm" onclick="simNext()">Siguiente →</button>
      <button class="btn ghost sm" onclick="simReset()">Reiniciar</button>
    </div>
    <div class="card"><span class="label">Recorrido</span><div class="tl">${tl}</div></div>
    <p class="center muted" style="margin-top:14px;font-size:13px">Paso ${SIM_STEP+1} de ${ps.length}</p>`;
}

/* =========================================================================
   10) ARRANQUE
   ========================================================================= */
(function start(){
  initDB();
  setTimeout(reconectarCarpetaGuardada,1500);   // si ya conectaste la carpeta Ventas, retoma la vigilancia
  const q=new URLSearchParams(location.search);
  const esCliente=!!q.get("p");
  const qInit=new URLSearchParams(location.search);
  const rolInit=qInit.get("rol");
  if(esCliente){
    if(DB.modo!=="firebase") DB.subscribe(d=>{ PEDIDOS=d; cargarProdsExtra(); render(); });
    render();                                  // vistaCliente lee su pedido con DB.get
  } else if((rolInit==="operador"||rolInit==="empleado"||rolInit==="despacho") && DB.modo==="firebase"){
    // empleada por link: sin login propio. Firestore igual pide sesión, así que entro como anónimo.
    AUTH_READY=true;
    const arrancar=()=>{ if(!SUBSCRITO){ SUBSCRITO=true; iniciarPollingTelegram(); DB.subscribe(d=>{ PEDIDOS=d; cargarProdsExtra(); sincronizarPedidosTelegram(); revisarFotosTelegram(); revisarCorreccionesTelegram(); render(); }); } render(); };
    firebase.auth().signInAnonymously()
      .then(arrancar)
      .catch(e=>{ console.warn("anonimo:", e);
        arrancar();
        setTimeout(()=>toast("No pude entrar con este link. Avisale al admin: falta activar el acceso anónimo en Firebase."),1200); });
  } else if(DB.modo==="firebase"){
    firebase.auth().onAuthStateChanged(async (user)=>{
      USER=user; USERROL=null; CADETE_ACTIVO=null;
      if(user){
        try{ const d=await firebase.firestore().collection("usuarios").doc(user.email).get();
          if(d.exists){ USERROL=d.data().rol||null;
            if(USERROL==="cadete") CADETE_ACTIVO=d.data().cadete||d.data().nombre||null; }
        }catch(e){ USERROL=null; }
        if(USERROL && !SUBSCRITO){ SUBSCRITO=true; iniciarPollingTelegram(); DB.subscribe(d=>{ PEDIDOS=d; cargarProdsExtra(); sincronizarPedidosTelegram(); revisarFotosTelegram(); revisarCorreccionesTelegram(); render(); }); }
      }
      AUTH_READY=true; render();
    });
  } else {
    DB.subscribe(d=>{ PEDIDOS=d; cargarProdsExtra(); render(); });
    render();
  }
})();

