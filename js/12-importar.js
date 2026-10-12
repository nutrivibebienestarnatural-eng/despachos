/* ============================================================
   12-importar — Importar pedidos: Tienda Nube, Mercado Libre, CSV y PDF
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
let IMP_EMPRESA=(typeof localStorage!=="undefined"&&localStorage.getItem("imp_empresa"))||EMPRESAS[0].id;
if(!EMPRESAS.some(e=>e.id===IMP_EMPRESA)) IMP_EMPRESA=EMPRESAS[0].id;
let IMP_CANAL=(typeof localStorage!=="undefined"&&localStorage.getItem("imp_canal"))||empresaObj(IMP_EMPRESA).canalDefault;
if(!CANALES.some(c=>c.id===IMP_CANAL)) IMP_CANAL=CANALES[0].id;
let IMP_DESDE=(typeof localStorage!=="undefined"&&localStorage.getItem("imp_desde"))||"";
function setImpDesde(v){ IMP_DESDE=v||""; try{ localStorage.setItem("imp_desde",IMP_DESDE); }catch(e){ logErr("auto",e); } }
function pickEmpresa(b){ IMP_EMPRESA=b.dataset.e;
  try{ localStorage.setItem("imp_empresa",IMP_EMPRESA); }catch(e){ logErr("auto",e); }
  formImportar(); }
function pickCanal(b){ IMP_CANAL=b.dataset.c;
  try{ localStorage.setItem("imp_canal",IMP_CANAL); }catch(e){ logErr("auto",e); }
  formImportar(); }
/* Trae los pedidos directo de Tienda Nube vía la función /api/tiendanube */
async function traerTiendaNube(){
  toast("Buscando pedidos en Tienda Nube…");
  let data;
  try{
    const q="/api/tiendanube?empresa="+encodeURIComponent(IMP_EMPRESA)+(IMP_DESDE?("&desde="+encodeURIComponent(IMP_DESDE)):"");
    const r=await fetch(q);
    data=await r.json().catch(()=>({}));
    if(!r.ok){ toast(data.error||("Error "+r.status)); return; }
  }catch(e){ toast("No me pude conectar. ¿Ya configuraste la API? (ver instrucciones)"); return; }

  const existentes=new Set(soloPedidos().map(p=>p.ref).filter(Boolean));
  const ignorados=ignoradosSet();
  const crudos=(data.pedidos||[]).filter(f=>f&&(!f.ref||(!existentes.has(f.ref)&&!ignorados.has(f.ref))));
  const filas=[]; let fallidos=0;
  for(const f of crudos){                                   // uno por uno: si uno viene roto, se saltea y sigue
    try{
      f.empresa=IMP_EMPRESA; f.canal=IMP_CANAL||"tiendanube";
      f.cliente=f.cliente||""; f.dir=f.dir||""; f.ciudad=f.ciudad||""; f.provincia=f.provincia||""; f.items=f.items||"";
      // productos: los vinculo al catálogo por SKU/código de barras (o lo aprendido), y si no por nombre
      if(Array.isArray(f.prodsTN) && f.prodsTN.length){
        const nb=s=>String(s||"").replace(/\D/g,"").replace(/^0+/,"");
        const prods=[]; let todos=true;
        f.prodsTN.forEach(x=>{
          const pk=packDef(x.sku, x.nombre);
          let prod=null, conflicto=false;
          if(pk && pk.comps && pk.comps.length){
            // mismo cuidado que en etiquetas ML: si es un vínculo simple, que no contradiga el nombre de esta venta
            // NI la cantidad — el mismo SKU puede venderse suelto (x1) o en pack (x3): si el nombre de ESTE
            // pedido dice "Pack x3" pero el SKU quedó vinculado como 1x1, no hay que confiar en lo viejo.
            const esAliasSimple = pk.comps.length===1 && (pk.comps[0].cant||1)===1;
            if(esAliasSimple){
              const pn = packDeNombre(x.nombre);
              const sugerido = x.nombre ? mejorProducto(pn.nombre) : null;
              conflicto = !!(pn.n>1 || (sugerido && sugerido.nombre!==pk.comps[0].prod));
            } else {
              // acá pk es un pack real que multiplica cantidad (aprendido con otra venta). Si el nombre
              // de ESTE pedido no tiene ninguna pinta de pack, el mismo SKU se vendió suelto esta vez —
              // no hay que aplicarle el multiplicador de memoria: se marca para que lo confirme una persona.
              conflicto = !pareceePack(x.nombre);
            }
            if(!conflicto){ prods.push({nombre:x.nombre, cant:x.cant, sku:x.sku, reconocido:true}); return; }   // itemsPedido lo expande
          }
          for(const c of [x.barcode,x.sku]){ if(!prod && nb(c).length>=8) prod=prodPorBarcode(c); }
          // el código de barras puede estar mal cargado en el catálogo (repetido entre dos productos
          // distintos) — antes de confiar ciego, cruzo contra lo que dice el NOMBRE de esta venta. Si
          // no tienen ninguna palabra fuerte en común, el código está mal vinculado: mejor que lo
          // confirme una persona en vez de descontar el producto equivocado (pasó con "Melena de León").
          if(prod){
            const sugeridoPorNombre = x.nombre ? mejorProducto(packDeNombre(x.nombre).nombre) : null;
            if(sugeridoPorNombre && sugeridoPorNombre.nombre!==prod.nombre) prod=null;
          }
          const pn=packDeNombre(x.nombre); if(!conflicto) x.cant=x.cant*pn.n;   // "Pack x3 ..." → multiplica (salvo que ya esté en duda)
          if(!prod && !conflicto) prod=mejorProducto(pn.nombre);   // en conflicto no adivino de nuevo: que lo confirme una persona
          // si hubo conflicto con el pack aprendido (el nombre no tenía pinta de pack pero el SKU sí
          // tiene un multiplicador guardado), NO guardo ese sku en el pedido: si no, en cualquier otra
          // pantalla (Preparación, descuento de stock) se vuelve a buscar por sku, encuentra el mismo
          // pack viejo y multiplica de nuevo — aunque acá ya hayamos guardado bien la cantidad real.
          if(prod) prods.push({nombre:prod.nombre, cant:x.cant, sku:conflicto?"":x.sku, reconocido:true, ...(conflicto?{noPack:true}:{})});
          else { todos=false; prods.push({nombre:x.nombre, nomML:x.nombre, cant:x.cant, sku:conflicto?"":x.sku, reconocido:false, ...(conflicto?{noPack:true}:{})}); }
        });
        f.prods=prods; f.items=prods.map(p=>p.cant+"x "+p.nombre).join(" · ");
        if(!todos) f.prodsDudosos=true;
      }
      delete f.prodsTN;
      const rr=sugerirRuta(f.provincia,f.ciudad); f.origen=(rr&&rr.origen)||"bsas";
      if(f.retiro){ f.metodo="correo"; f.correo="Punto de retiro"; }         // retira en sucursal
      else if(llegaCadete(f)){ f.metodo="cadete"; f.correo=""; }             // CABA / Zona 1-3 (por CP) => Cardinal
      else { f.metodo="correo"; f.correo="Correo Argentino"; }               // resto => correo (lo hacés vos)
      filas.push(f);
    }catch(err){ fallidos++; console.warn("Pedido salteado:", f&&f.ref, err); }
  }
  IMP_FILAS=filas;
  if(!IMP_FILAS.length){ toast("No hay pedidos nuevos para importar"); return; }
  try{ mostrarPreviewImport(); }
  catch(err){ console.error("Error al mostrar el preview:", err); toast("Traje "+IMP_FILAS.length+" pedidos pero falló mostrarlos (mirá la consola)"); return; }
  toast("Trajo "+IMP_FILAS.length+" pedidos"+(fallidos?(" · "+fallidos+" salteados"):""));
}
/* Trae los pedidos directo de Mercado Libre (cuenta propia de cada marca) vía /api/mercadolibre */
async function traerMercadoLibre(){
  toast("Buscando pedidos en Mercado Libre…");
  let data;
  try{
    const q="/api/mercadolibre?action=pedidos&empresa="+encodeURIComponent(IMP_EMPRESA)+(IMP_DESDE?("&desde="+encodeURIComponent(IMP_DESDE)):"");
    const r=await fetch(q);
    data=await r.json().catch(()=>({}));
    if(!r.ok){ toast(data.error||("Error "+r.status)); return; }
  }catch(e){ toast("No me pude conectar. ¿Ya conectaste esta marca con Mercado Libre?"); return; }

  const existentes=new Set(soloPedidos().map(p=>p.ref).filter(Boolean));
  // ids de ventas individuales ya conocidas (de pedidos ya guardados, incluso de antes de agrupar por
  // pack) — si una sola de las ventas de un pack nuevo ya está acá, todo el pack se considera ya traído.
  const idsConocidos=new Set();
  soloPedidos().forEach(p=>{ const d=String(p.ref||"").replace(/\D/g,""); if(d) idsConocidos.add(d);
    (p.mlOrderIds||[]).forEach(idv=>idsConocidos.add(String(idv))); });
  const ignorados=ignoradosSet();
  const crudos=(data.pedidos||[]).filter(f=>{
    if(!f) return false;
    if(f.ref && (existentes.has(f.ref)||ignorados.has(f.ref))) return false;
    if(Array.isArray(f.mlOrderIds) && f.mlOrderIds.some(idv=>idsConocidos.has(String(idv)))) return false;
    return true;
  });
  const filas=[]; let fallidos=0;
  for(const f of crudos){                                   // uno por uno: si uno viene roto, se saltea y sigue
    try{
      f.empresa=IMP_EMPRESA; f.canal="ml_flex";
      f.cliente=f.cliente||""; f.dir=f.dir||""; f.ciudad=f.ciudad||""; f.provincia=f.provincia||""; f.items=f.items||"";
      // productos: los vinculo al catálogo por SKU (o lo aprendido), y si no por nombre — mismo criterio que Tienda Nube
      if(Array.isArray(f.prodsTN) && f.prodsTN.length){
        const nb=s=>String(s||"").replace(/\D/g,"").replace(/^0+/,"");
        const prods=[]; let todos=true;
        f.prodsTN.forEach(x=>{
          const pk=packDef(x.sku, x.nombre);
          let prod=null, conflicto=false;
          if(pk && pk.comps && pk.comps.length){
            // mismo SKU puede vender x1 o en pack x3: si ya está vinculado como 1x1 pero el nombre de
            // ESTE pedido dice "Pack x3", no hay que confiar en lo viejo — se marca para revisar.
            const esAliasSimple = pk.comps.length===1 && (pk.comps[0].cant||1)===1;
            if(esAliasSimple){
              const pn0 = packDeNombre(x.nombre);
              const sugerido = x.nombre ? mejorProducto(pn0.nombre) : null;
              conflicto = !!(pn0.n>1 || (sugerido && sugerido.nombre!==pk.comps[0].prod));
            } else {
              // pk es un pack real (multiplica cantidad), aprendido con otra venta. Si el nombre de ESTE
              // pedido no tiene pinta de pack, el mismo SKU se vendió suelto esta vez — no se le aplica
              // el multiplicador de memoria: se marca para que lo confirme una persona.
              conflicto = !pareceePack(x.nombre);
            }
            if(!conflicto){ prods.push({nombre:x.nombre, cant:x.cant, sku:x.sku, reconocido:true}); return; }
          }
          if(!prod && nb(x.sku).length>=8) prod=prodPorBarcode(x.sku);
          // el código de barras puede estar mal cargado en el catálogo (repetido entre dos productos
          // distintos) — antes de confiar ciego, cruzo contra lo que dice el NOMBRE de esta venta. Si
          // no tienen ninguna palabra fuerte en común, el código está mal vinculado: mejor que lo
          // confirme una persona en vez de descontar el producto equivocado (pasó con "Melena de León").
          if(prod){
            const sugeridoPorNombre = x.nombre ? mejorProducto(packDeNombre(x.nombre).nombre) : null;
            if(sugeridoPorNombre && sugeridoPorNombre.nombre!==prod.nombre) prod=null;
          }
          const pn=packDeNombre(x.nombre); if(!conflicto) x.cant=x.cant*pn.n;   // "Pack x3 ..." → multiplica (salvo que ya esté en duda)
          if(!prod && !conflicto) prod=mejorProducto(pn.nombre);
          // si hubo conflicto con el pack aprendido (el nombre no tenía pinta de pack pero el SKU sí
          // tiene un multiplicador guardado), NO guardo ese sku en el pedido: si no, en cualquier otra
          // pantalla (Preparación, descuento de stock) se vuelve a buscar por sku, encuentra el mismo
          // pack viejo y multiplica de nuevo — aunque acá ya hayamos guardado bien la cantidad real.
          if(prod) prods.push({nombre:prod.nombre, cant:x.cant, sku:conflicto?"":x.sku, reconocido:true, ...(conflicto?{noPack:true}:{})});
          else { todos=false; prods.push({nombre:x.nombre, nomML:x.nombre, cant:x.cant, sku:conflicto?"":x.sku, reconocido:false, ...(conflicto?{noPack:true}:{})}); }
        });
        f.prods=prods; f.items=prods.map(p=>p.cant+"x "+p.nombre).join(" · ");
        if(!todos) f.prodsDudosos=true;
      }
      delete f.prodsTN;
      const rr=sugerirRuta(f.provincia,f.ciudad); f.origen=(rr&&rr.origen)||"bsas";
      if(llegaCadete(f)){ f.metodo="cadete"; f.correo=""; }                // CABA / Zona 1-3 (por CP) => Cardinal
      else { f.metodo="correo"; f.correo="Correo Argentino"; }             // resto => correo
      filas.push(f);
    }catch(err){ fallidos++; console.warn("Pedido salteado:", f&&f.ref, err); }
  }
  IMP_FILAS=filas;
  if(!IMP_FILAS.length){ toast("No hay pedidos nuevos para importar"); return; }
  try{ mostrarPreviewImport(); }
  catch(err){ console.error("Error al mostrar el preview:", err); toast("Trajo "+IMP_FILAS.length+" pedidos pero falló mostrarlos (mirá la consola)"); return; }
  toast("Trajo "+IMP_FILAS.length+" pedidos"+(fallidos?(" · "+fallidos+" salteados"):""));
}
/* Le avisa a Tienda Nube que el pedido salió (marca enviado + manda el tracking si lo hay) */
async function marcarReenvio(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  if(p.esReenvio){
    if(!await askConfirm("¿Quitar la marca de reenvío de este pedido?")) return;
    await DB.update(id,{esReenvio:false, motivoReenvio:""});
    toast("Marca de reenvío quitada");
  } else {
    const motivo=prompt("¿Por qué es un reenvío? (opcional)\nEj: se perdió, error de preparación, dirección mal...","");
    if(motivo===null) return;
    await DB.update(id,{esReenvio:true, motivoReenvio:(motivo||"").trim(), reenvioTs:Date.now()});
    toast("🔁 Marcado como reenvío");
  }
  render();
}
async function marcarEnviadoTN(id){
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(!p || !p.tnId){ toast("Este pedido no vino de Tienda Nube"); return; }
  toast("Avisando a Tienda Nube…");
  try{
    const r=await fetch("/api/tiendanube",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"tracking",tnId:p.tnId,code:p.tracking||"",url:""})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.ok){ toast(data.error||("Error "+r.status)); return; }
    await DB.update(id,{tnAvisado:true});
    toast("✅ Tienda Nube avisada");
    render();
  }catch(e){ toast("No me pude conectar con Tienda Nube"); }
}
/* Detecta solo el tipo de archivo y lo manda al lector correcto */
function importarAuto(file){
  if(!file){ return; }
  const esPdf=/\.pdf$/i.test(file.name||"")||file.type==="application/pdf";
  toast("Leyendo "+(esPdf?"PDF":"archivo")+"…");
  if(esPdf) leerPDF(file); else leerCSV(file);
}
function leerCSV(file){
  const rd=new FileReader();
  rd.onload=()=>{ const t=rd.result; const ta=$("#impTxt"); if(ta) ta.value=t;
    IMP_FILAS=parseTabla(t);
    if(!IMP_FILAS.length){ toast("No detecté pedidos. ¿Es el CSV de ventas de Tienda Nube?"); return; }
    mostrarPreviewImport(); };
  rd.onerror=()=>toast("No pude leer el archivo");
  rd.readAsText(file,"ISO-8859-1");   // Tienda Nube exporta en latin-1
}

function parseTabla(texto){
  const lineas=texto.split(/\r?\n/).filter(l=>l.length);
  if(lineas.length<2) return [];
  const delim = lineas[0].includes("\t")?"\t" : (lineas[0].split(";").length>lineas[0].split(",").length?";":",");
  const split = l => { const out=[]; let cur="",q=false;       // CSV con comillas
    for(let i=0;i<l.length;i++){ const c=l[i];
      if(c==='"'){ q=!q; } else if(c===delim && !q){ out.push(cur); cur=""; } else cur+=c; }
    out.push(cur); return out.map(s=>s.trim().replace(/^"|"$/g,"")); };
  const heads = split(lineas[0]).map(h=>h.toLowerCase());
  const col = re => heads.findIndex(h=>re.test(h));
  const ix = {
    orden:  col(/n[uú]mero de orden|^orden|venta|pedido|^#/),
    cliente:col(/comprador|^cliente|destinatario|nombre para el env|^nombre$/),
    tel:    col(/tel[eé]fono/),
    dir:    col(/direcci/), num: col(/^n[uú]mero$/), piso: col(/piso/),
    loc:    col(/localidad/), ciudad: col(/ciudad/), prov: col(/provincia/),
    prod:   col(/nombre del producto|^producto|art[ií]culo|detalle|descripci/),
    cant:   col(/cantidad del producto|^cantidad/), sku: col(/sku/), envio: col(/medio de env[ií]o/),
    track:  col(/tracking|seguimiento/),
  };
  const g=(c,k)=> ix[k]>=0 ? (c[ix[k]]||"") : "";
  const groups=new Map(); let lastKey=null, seq=0;
  for(let i=1;i<lineas.length;i++){
    const c=split(lineas[i]); if(c.every(x=>!x)) continue;
    let key = ix.orden>=0 ? g(c,"orden") : "";
    if(key) lastKey=key; else key = lastKey || ("fila"+(++seq));   // ffill por orden
    if(!groups.has(key)) groups.set(key,{ref:key,cliente:"",tel:"",dir:"",loc:"",prov:"",envio:"",track:"",items:[]});
    const o=groups.get(key);
    const set=(k,v)=>{ if(v && !o[k]) o[k]=v; };
    set("cliente",g(c,"cliente")); set("tel",g(c,"tel")); set("prov",g(c,"prov"));
    set("envio",g(c,"envio")); set("track",g(c,"track"));
    set("loc", g(c,"loc")||g(c,"ciudad"));
    const calle=g(c,"dir"); if(calle && !o.dir) o.dir=(calle+" "+g(c,"num")+(g(c,"piso")?(" "+g(c,"piso")):"")).trim();
    const pn=g(c,"prod"); if(pn) o.items.push((g(c,"cant")||"1")+"x "+pn);
  }
  const out=[];
  for(const o of groups.values()){
    if(!o.cliente && !o.items.length) continue;
    const envL=o.envio.toLowerCase();
    const esCorreo=/correo|andreani|oca|cruz del sur|v[ií]a cargo|cl[aá]sico|expreso|retiro|moto.*correo/.test(envL);
    const r=sugerirRuta(o.prov,o.loc);
    out.push({ empresa:IMP_EMPRESA, ref:o.ref?("#"+o.ref.replace(/^#/,"")):"", cliente:o.cliente, tel:o.tel,
      dir:o.dir, ciudad:o.loc, provincia:o.prov, items:o.items.join(" · "),
      metodo: esCorreo?"correo":r.metodo, origen:r.origen,
      correo: esCorreo?(/retiro/.test(envL)?"Punto de retiro":(o.envio.match(/andreani|oca|correo argentino|cruz del sur|v[ií]a cargo/i)||["Correo Argentino"])[0]):"",
      tracking:o.track });
  }
  return out;
}
let IMP_FILAS=[];
function procesarImport(){
  IMP_FILAS=parseTabla($("#impTxt").value);
  if(!IMP_FILAS.length){ toast("No detecté filas. Revisá que haya una fila de encabezados."); return; }
  mostrarPreviewImport();
}
let IMP_SEL={};
let IMP_REV={};   // pedidos con productos que ya revisaste antes de guardar (índice → true)
function toggleImp(i){ IMP_SEL[i]=!IMP_SEL[i]; mostrarPreviewImport(); }
function selImp(v){ IMP_SEL={}; IMP_FILAS.forEach((f,i)=>IMP_SEL[i]=v); mostrarPreviewImport(); }
function toggleRev(i){ IMP_REV[i]=!IMP_REV[i]; mostrarPreviewImport(); }
/* ¿falta revisar algún pedido con varios productos, de los que están tildados para guardar? */
/* Un pedido necesita que lo mires SOLO si algo no se reconocio: producto desconocido, sin productos,
   o un SKU que todavia no enseñaste. El resto se da por revisado y no hay que abrirlo. */
function necesitaRevision(f){
  const pr=f.prods||[];
  if(!pr.length) return true;
  return pr.some(x=>!x || x.reconocido===false);
}
function autoRevisarImport(){
  IMP_FILAS.forEach((f,i)=>{ if(IMP_REV[i]===undefined && !necesitaRevision(f)) IMP_REV[i]=true; });
}
function revisarTodosImport(){
  IMP_FILAS.forEach((f,i)=>{ if(IMP_SEL[i] && !necesitaRevision(f)) IMP_REV[i]=true; });
  mostrarPreviewImport();
}
function avisoRevisionHTML(){
  const pend=IMP_FILAS.filter((f,i)=>IMP_SEL[i]&&!IMP_REV[i]);
  const auto=IMP_FILAS.filter((f,i)=>IMP_SEL[i]&&IMP_REV[i]).length;
  if(!pend.length) return '<div class="hint" style="margin-bottom:8px;padding:8px 10px;background:#d9f2e5;color:#0f6b40;border-radius:8px;font-weight:600">✓ Los '+auto+' pedidos se reconocieron por código. No hace falta abrir ninguno.</div>';
  const nombres=esc(pend.slice(0,4).map(f=>f.cliente||"—").join(", "))+(pend.length>4?"…":"");
  return '<div class="hint" style="margin-bottom:8px;padding:8px 10px;background:#fff3cd;color:#7a5a00;border-radius:8px;font-weight:600">👀 Solo '+pend.length+' de '+(pend.length+auto)+' necesita'+(pend.length===1?'':'n')+' que lo mires: '+nombres+
    ' <button class="btn sm ghost" style="margin-left:6px" onclick="revisarTodosImport()">Dar por buenos los reconocidos</button></div>';
}
function faltaRevisarImport(){ return IMP_FILAS.some((f,i)=>IMP_SEL[i] && (f.prods||[]).length>=1 && !IMP_REV[i]); }
function setImpMetodo(i,val){ const f=IMP_FILAS[i]; if(!f) return;
  if(val==="cadete"){ f.metodo="cadete"; f.correo=""; f.etiquetaPdf=""; f.etiquetaPdfNombre=""; }
  else if(val==="sucursal"){ f.metodo="correo"; f.correo="Punto de retiro"; }
  else { f.metodo="correo"; f.correo=f.etiquetaML?"Punto de Despacho":"Correo Argentino"; }
  mostrarPreviewImport(); }
function impVal(f){ return f.metodo==="cadete"?"cadete":((f.correo||"")==="Punto de retiro"?"sucursal":"correo"); }
async function adjuntarEtiquetaImport(i,file){
  const dat=await archivoEtiqueta(file); if(!dat) return;
  Object.assign(IMP_FILAS[i],dat); toast("Etiqueta del correo adjuntada 📎"); mostrarPreviewImport();
}
/* Abre el editor para enseñarle al sistema qué descuenta un pack o producto no reconocido */
let ENS_CTX=null;
function enseniarPack(fi,pi){
  const f=IMP_FILAS[fi]; if(!f||!f.prods||!f.prods[pi]) return;
  const x=f.prods[pi];
  const yaComps=packComponentes(x.nombre,x.sku);
  ENS_CTX={fi,pi, sku:x.sku||"", nombre:x.nomML||x.nombre,
    comps: yaComps ? yaComps.map(c=>({nombre:c.nombre,cant:c.cant})) : [{nombre:"", cant:1}] };
  dibujarEnseniar();
}
/* Igual que enseniarPack pero llamado desde PREPARAR un pedido (no desde el import de ML) */
function enseniarKitPrep(encNombre, encSku){
  const nombre=decodeURIComponent(encNombre||"");
  const sku=decodeURIComponent(encSku||"");
  const yaComps=packComponentes(nombre, sku);
  ENS_CTX={ prep:true, sku:sku||"", nombre:nombre,
    comps: yaComps ? yaComps.map(c=>({nombre:c.nombre,cant:c.cant})) : [{nombre:"", cant:1}] };
  dibujarEnseniar();
}
function dibujarEnseniar(){
  const c=ENS_CTX; if(!c) return;
  let ov=document.getElementById("ensOverlay");
  if(!ov){ ov=document.createElement("div"); ov.id="ensOverlay"; document.body.appendChild(ov); }
  ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
  const opciones=PRODUCTOS.map(p=>`<option value="${esc(p.nombre)}"></option>`).join("");
  ov.innerHTML=`<div style="background:var(--bg-2);border-radius:16px;max-width:520px;width:100%;max-height:88vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:18px;font-weight:800;margin-bottom:4px">¿Qué descuenta esto del stock?</div>
    <div class="muted" style="font-size:13.5px;margin-bottom:6px"><b>${esc(c.nombre)}</b>${c.sku?` · SKU ${esc(c.sku)}`:''}</div>
    <div class="hint" style="margin-bottom:14px">Poné cuántos frascos trae <b>UN</b> kit. Si el cliente compra 2 kits, el sistema multiplica solo (2 × lo que pongas). Se guarda y no vuelve a preguntar.</div>
    <datalist id="ensProds">${opciones}</datalist>
    <div id="ensRows">${c.comps.map((cm,i)=>filaEns(cm,i)).join("")}</div>
    <button class="btn sm ghost" style="margin-top:6px" onclick="ensAddRow()">+ Agregar otro producto</button>
    <div class="row" style="gap:8px;margin-top:18px">
      <button class="btn block green" onclick="guardarEnseniado()">Guardar</button>
      <button class="btn block ghost" onclick="cerrarEnseniar()">Cancelar</button>
    </div>
  </div>`;
}
function filaEns(cm,i){
  const inp="padding:9px 11px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg)";
  return `<div style="margin-bottom:10px" data-row="${i}">
    <div class="row" style="gap:8px;align-items:center">
      <input list="ensProds" value="${esc(cm.nombre||'')}" placeholder="Buscá el producto…" style="${inp};flex:1" oninput="ENS_CTX.comps[${i}].nombre=this.value">
      <input type="number" inputmode="numeric" min="1" step="1" value="${cm.cant||1}" style="${inp};width:70px;text-align:center;font-weight:700" oninput="ENS_CTX.comps[${i}].cant=Math.max(1,parseInt(this.value.replace(/[^0-9]/g,''))||1);this.value=ENS_CTX.comps[${i}].cant">
      <button class="btn sm ghost" style="padding:6px 10px" onclick="ensDelRow(${i})">✕</button>
    </div>
    <div class="muted" style="font-size:11px;margin-top:3px">cuántos frascos de este producto trae UN kit</div>
  </div>`;
}
function ensAddRow(){ ENS_CTX.comps.push({nombre:"",cant:1}); dibujarEnseniar(); }
function ensDelRow(i){ ENS_CTX.comps.splice(i,1); if(!ENS_CTX.comps.length) ENS_CTX.comps.push({nombre:"",cant:1}); dibujarEnseniar(); }
function cerrarEnseniar(){ const ov=document.getElementById("ensOverlay"); if(ov) ov.remove(); ENS_CTX=null; }
async function guardarEnseniado(){
  const c=ENS_CTX; if(!c) return;
  const comps=c.comps.filter(x=>x.nombre&&x.nombre.trim()).map(x=>({prod:x.nombre.trim(), cant:parseInt(x.cant)||1}));
  if(!comps.length){ toast("Elegí al menos un producto"); return; }
  // valido que existan en el catálogo (o los agrego)
  for(const cm of comps){ if(!PRODUCTOS.some(p=>p.nombre===cm.prod)){
    if(await askConfirm('"'+cm.prod+'" no está en el catálogo. ¿Lo agrego como producto nuevo?')){
      PRODUCTOS.push({nombre:cm.prod,barcode:""}); const r=PEDIDOS.find(p=>p.tipo==="prodsExtra");
      const lista=((r&&r.map)||(r&&r.lista)||[]).concat([{nombre:cm.prod,barcode:""}]);
      if(r) await DB.update(r.id,{lista}); else await DB.create({tipo:"prodsExtra",lista});
    } else return;
  } }
  const wasPrep=c.prep, seguir=c.seguirImport;
  await aprenderPack(c.sku, c.nombre, comps);
  if(!wasPrep && IMP_FILAS[c.fi] && IMP_FILAS[c.fi].prods && IMP_FILAS[c.fi].prods[c.pi]){
    const x=IMP_FILAS[c.fi].prods[c.pi]; x.reconocido=true;
    if(comps.length===1 && comps[0].cant===1) x.nombre=comps[0].prod;   // producto simple: queda con el nombre del catálogo
    IMP_FILAS[c.fi].items=IMP_FILAS[c.fi].prods.map(p=>p.cant+"x "+p.nombre).join(" · ");
  }
  cerrarEnseniar();
  toast("Aprendido ✓ No te vuelvo a preguntar por esto");
  if(wasPrep){ if(typeof PREP_ID!=="undefined" && PREP_ID) pantallaPreparar(PREP_ID); else render(); }
  else { mostrarPreviewImport(); if(seguir) confirmarImport(); }
}
/* Corregir a mano UN producto de UNA etiqueta importada (o agregar uno que faltó): la etiqueta
   se leyó mal, es otro SKU, o el producto quedó pegado al pedido de otro cliente. pi=-1 = agregar nuevo. */
let EDITPROD_CTX=null;
/* Muestra la hoja de picking/detalle del pedido (cantidades y productos tal como los imprime ML)
   sin tener que descargar y abrir el PDF completo. Si el archivo no se dividió (pedido único), busca
   la 2da página del mismo etiquetaPdf; si se dividió (varios pedidos en un mismo PDF), usa la hoja
   de detalle que se guardó aparte al importar. */
async function verHojaDetalle(i){
  const f=IMP_FILAS[i]; if(!f) return;
  let b64=f.hojaDetalle, pagina=1;
  if(!b64 && f.etiquetaPdf){ b64=f.etiquetaPdf; pagina=2; }
  if(!b64){ toast("No tengo el PDF de este pedido para mostrar la hoja 2"); return; }
  if(typeof pdfjsLib==="undefined"){ toast("El lector de PDF no cargó, probá de nuevo"); return; }
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const bin=atob(b64); const raw=new Uint8Array(bin.length); for(let k=0;k<bin.length;k++) raw[k]=bin.charCodeAt(k);
    const doc=await pdfjsLib.getDocument({data:raw}).promise;
    if(pagina>doc.numPages){ toast("Esta etiqueta no tiene una segunda hoja"); return; }
    const page=await doc.getPage(pagina);
    const vp=page.getViewport({scale:2});
    const canvas=document.createElement("canvas"); canvas.width=vp.width; canvas.height=vp.height;
    await page.render({canvasContext:canvas.getContext("2d"), viewport:vp}).promise;
    let ov=document.getElementById("hojaOverlay");
    if(!ov){ ov=document.createElement("div"); ov.id="hojaOverlay"; document.body.appendChild(ov); }
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    canvas.style.cssText="width:100%;height:auto;display:block;border-radius:6px";
    ov.innerHTML="";
    const wrap=document.createElement("div");
    wrap.style.cssText="background:#fff;border-radius:14px;padding:10px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;gap:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)";
    const cerrar=document.createElement("button"); cerrar.className="btn block ghost"; cerrar.style.flex="0 0 auto"; cerrar.textContent="Cerrar";
    cerrar.onclick=()=>ov.remove();
    const scroller=document.createElement("div"); scroller.style.cssText="overflow:auto;min-height:0";
    scroller.appendChild(canvas);
    wrap.appendChild(cerrar); wrap.appendChild(scroller);
    ov.appendChild(wrap);
    ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
    ov.tabIndex=-1; ov.focus();
    ov.onkeydown=e=>{ if(e.key==="Escape") ov.remove(); };
  }catch(e){ console.warn("hoja detalle:",e); toast("No pude mostrar la hoja 2"); }
}
function editarProdImport(fi,pi){
  const f=IMP_FILAS[fi]; if(!f) return;
  const x=(pi>=0 && f.prods && f.prods[pi]) ? f.prods[pi] : null;
  EDITPROD_CTX={fi, pi, nombre:x?(x.nombre||x.nomML||""):"", cant:x?(x.cant||1):1, sku:x?(x.sku||""):"", nomML:x?(x.nomML||""):""};
  dibujarEditProd();
}
function dibujarEditProd(){
  const c=EDITPROD_CTX; if(!c) return;
  let ov=document.getElementById("editProdOverlay");
  if(!ov){ ov=document.createElement("div"); ov.id="editProdOverlay"; document.body.appendChild(ov); }
  ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
  const opciones=PRODUCTOS.map(p=>`<option value="${esc(p.nombre)}"></option>`).join("");
  const inp="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg);box-sizing:border-box";
  ov.innerHTML=`<div style="background:var(--bg-2);border-radius:16px;max-width:460px;width:100%;max-height:88vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:18px;font-weight:800;margin-bottom:4px">${c.pi>=0?'Corregir producto':'Agregar producto'}</div>
    <div class="hint" style="margin-bottom:14px">Si la etiqueta se leyó mal o mezcló productos de otro pedido, elegí acá el producto correcto y la cantidad real de este cliente.</div>
    <datalist id="editProdList">${opciones}</datalist>
    <div class="muted" style="font-size:12px;margin-bottom:4px">Producto</div>
    <input list="editProdList" value="${esc(c.nombre||'')}" placeholder="Buscá el producto…" style="${inp};margin-bottom:12px" oninput="EDITPROD_CTX.nombre=this.value">
    <div class="muted" style="font-size:12px;margin-bottom:4px">Cantidad</div>
    <input type="number" inputmode="numeric" min="1" step="1" value="${c.cant}" style="${inp};width:100px;font-weight:700;text-align:center;margin-bottom:16px" oninput="EDITPROD_CTX.cant=Math.max(1,parseInt(this.value.replace(/[^0-9]/g,''))||1);this.value=EDITPROD_CTX.cant">
    <div class="row" style="gap:8px">
      <button class="btn block green" onclick="guardarEditProd()">Guardar</button>
      <button class="btn block ghost" onclick="cerrarEditProd()">Cancelar</button>
    </div>
    ${c.pi>=0?`<button class="btn block ghost" style="margin-top:8px;color:#c62828" onclick="borrarProdImport()">🗑 Quitar este producto del pedido</button>`:''}
  </div>`;
}
function cerrarEditProd(){ const ov=document.getElementById("editProdOverlay"); if(ov) ov.remove(); EDITPROD_CTX=null; }
function guardarEditProd(){
  const c=EDITPROD_CTX; if(!c) return;
  const nombre=(c.nombre||"").trim();
  if(!nombre){ toast("Elegí un producto"); return; }
  const cant=Math.max(1,parseInt(c.cant)||1);
  const f=IMP_FILAS[c.fi]; if(!f) return;
  if(!f.prods) f.prods=[];
  const match=PRODUCTOS.find(p=>p.nombre===nombre) || mejorProducto(nombre);
  const nuevo={ nombre: match?match.nombre:nombre, cant, sku:c.sku||"", nomML:c.nomML||nombre, reconocido: !!match, noPack:true };
  if(c.pi>=0 && f.prods[c.pi]) f.prods[c.pi]=nuevo; else f.prods.push(nuevo);
  IMP_REV[c.fi]=true;   // ya lo corregiste a mano, cuenta como revisado
  cerrarEditProd();
  toast("Producto corregido ✓");
  mostrarPreviewImport();
}
function borrarProdImport(){
  const c=EDITPROD_CTX; if(!c||c.pi<0) return;
  const f=IMP_FILAS[c.fi]; if(!f||!f.prods) return;
  f.prods.splice(c.pi,1);
  cerrarEditProd();
  toast("Producto quitado del pedido");
  mostrarPreviewImport();
}
function stockChipImport(nombreProd){
  try{
    const st=stockState();
    const actual=nivel(nombreProd, st);
    let pedidoTotal=0;
    IMP_FILAS.forEach(f=>{ (f.prods||[]).forEach(x=>{
      const comps=x.noPack?null:packComponentes(x.nombre,x.sku);
      if(comps && comps.length>=2){ comps.forEach(c=>{ if(c.nombre===nombreProd) pedidoTotal+=c.cant*(x.cant||1); }); }
      else if(comps && comps.length===1){ if(comps[0].nombre===nombreProd) pedidoTotal+=(x.cant||1); }
      else if(x.nombre===nombreProd) pedidoTotal+=(x.cant||1);
    }); });
    const queda=actual-pedidoTotal;
    let color, txt;
    if(queda<0){ color="#e5484d"; txt="⚠ FALTAN "+Math.abs(queda); }
    else if(queda<=3){ color="#b58600"; txt="quedan "+queda; }
    else { color="#1d9e75"; txt="quedan "+queda; }
    return `<span style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:20px;background:${color}22;color:${color};margin-left:6px">stock ${actual} · ${txt}</span>`;
  }catch(e){ return ""; }
}
function mostrarPreviewImport(){
  if(!$("#impPrev")) formImportar();          // si la vista se re-dibujó durante la búsqueda, la reconstruyo
  const cont=$("#impPrev"); if(!cont){ toast("Traje "+IMP_FILAS.length+" pedidos. Entrá a Importar pedidos para verlos."); return; }
  if(Object.keys(IMP_SEL).length===0) IMP_FILAS.forEach((f,i)=>IMP_SEL[i]=true);   // por defecto todos marcados
  autoRevisarImport();                                                             // los reconocidos quedan revisados solos
  const sel=IMP_FILAS.filter((f,i)=>IMP_SEL[i]);
  const cadete=sel.filter(f=>f.metodo!=='correo').length;
  const correo=sel.length-cadete;
  const selStyle="padding:6px 8px;border:1px solid var(--border);border-radius:9px;font:inherit;background:var(--bg);font-size:13px";
  const marcasEnLote=[...new Set(IMP_FILAS.map(f=>f.empresa))];
  const tituloMarca=marcasEnLote.length<=1 ? empresaObj(marcasEnLote[0]||IMP_EMPRESA).nombre : "Varias marcas";
  cont.innerHTML=`
    <div class="card" style="margin-top:14px">
      <div class="hero" style="margin-bottom:14px;padding:18px 20px">
        <span class="label" style="margin-bottom:6px">${esc(tituloMarca)}</span>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.02em">${sel.length} de ${IMP_FILAS.length} pedidos</div>
        <div class="c" style="margin-top:6px">${cadete} por cadete · ${correo} por correo</div>
      </div>
      <div class="hint" style="margin-bottom:8px">Destildá los que NO hagas. Con el selector elegís cómo va cada uno (cadete / correo / sucursal).</div>
      ${avisoRevisionHTML()}
      <div class="row" style="gap:8px;margin-bottom:6px">
        <button class="btn sm ghost" onclick="selImp(true)">Marcar todos</button>
        <button class="btn sm ghost" onclick="selImp(false)">Ninguno</button>
      </div>
      ${IMP_FILAS.map((f,i)=>{ const an=anilloDe(f); const elegis=(an.n===9)||((f.correo||"")==="Punto de retiro"); const esCorreo=f.metodo==="correo";
        const envioChip = f.pickit ? {t:"📦 Pickit · "+fmtAr(pickitPrecio()),bg:"var(--amber-weak)",c:"var(--amber)"}
          : impVal(f)==="cadete" ? {t:"🛵 Flex / Cadete (Cardinal)",bg:"var(--green-weak)",c:"var(--green)"}
          : impVal(f)==="sucursal" ? {t:"✉️ Correo a sucursal",bg:"var(--violet-weak)",c:"var(--violet)"}
          : {t:"📮 "+(f.correo||"Correo"),bg:"var(--violet-weak)",c:"var(--violet)"};
        return `<div class="order" style="${IMP_SEL[i]?'':'opacity:.45'}">
          <div class="ord-head" style="cursor:default">
            <input type="checkbox" ${IMP_SEL[i]?'checked':''} onchange="toggleImp(${i})" style="width:22px;height:22px;flex:0 0 auto;accent-color:var(--accent)">
            <div style="min-width:0;flex:1">
              <div class="ord-name">
                <span class="ord-cli">${esc(f.cliente)}</span>
                <span class="chip" style="background:${envioChip.bg};color:${envioChip.c};font-weight:700">${envioChip.t}</span>
                ${elegis?`<span class="chip" style="background:#fff3cd;color:#7a5a00">elegís vos</span>`:''}
                ${(f.marcaDetectada&&marcasEnLote.length>1)?`<span class="chip" style="background:#e8e6ff;color:#4b3fa8">${esc(empresaObj(f.empresa).nombre)} ✓</span>`:''}
                ${f.etiquetaPdf?`<span class="chip" style="background:#d9f2e5;color:#0f6b40">📎 ${f.canal==='ml_flex'?'ETIQUETA ML':'CORREO'}</span>`:''}
              </div>
              <div class="ord-sub"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${anilloColor(an.n)};margin-right:5px;vertical-align:-1px"></span>${f.ref?('N° '+esc(f.ref.startsWith('#')?f.ref:('#'+f.ref))+' · '):''}${esc((f.ciudad||'').toUpperCase())} · ${esc(an.label)}</div>
            </div>
          </div>
          <div class="ord-body">
            <div class="addr">${esc(f.dir)} — ${esc(f.ciudad)}, ${esc(f.provincia)}${f.cp?(' · CP '+esc(f.cp)):''}${f.tel?(' · 📞 '+esc(f.tel)):''}</div>
            ${(f.hojaDetalle||(f.etiquetaPdf&&f.canal!=='ml_flex'))?`<button class="btn sm ghost" style="margin-bottom:8px" onclick="verHojaDetalle(${i})">🔍 Ver hoja 2 (cantidades, sin abrir el PDF)</button>`:''}
            ${(f.etiquetaPdf&&f.canal==='ml_flex')?`<button class="btn sm ghost" style="margin-bottom:8px" onclick='abrirEtiquetaPDF(IMP_FILAS[${i}])'>📄 Ver etiqueta de ML</button>`:''}
            <span class="tag">Items</span>
            ${(()=>{ const agregar=`<div style="margin-top:6px"><button class="btn sm ghost" onclick="editarProdImport(${i},-1)">+ Agregar producto</button></div>`;
              if(!f.prods||!f.prods.length) return `<div class="muted" style="font-size:14px;margin-top:4px">${esc(f.items||'—')}</div>${agregar}`;
              return `<div style="margin-top:4px">`+f.prods.map((x,pi)=>{
                const comps=x.noPack?null:packComponentes(x.nombre,x.sku);
                // un "pack" de UN solo componente a razón de 1x1 no es un pack de verdad — es simplemente el
                // vínculo SKU→producto que ya enseñaste alguna vez (por "Vincular a mi producto"). En ese caso
                // no tiene sentido mostrar el cartel de pack: se muestra igual que cualquier producto reconocido.
                // UN SOLO componente nunca multiplica cantidad (ver itemsPedido) — "pack real" con cartel
                // y multiplicador solo aplica a kits de VARIOS productos distintos (2+ componentes).
                const esAliasSimple = comps && comps.length===1;
                const esPackReal = comps && comps.length>=2;
                const esPackND=(!comps && pareceePack(x.nomML||x.nombre));   // parece pack pero no lo conozco
                const corregir=`<button class="btn sm ghost" style="padding:2px 8px;font-size:11px" onclick="editarProdImport(${i},${pi})">✎ corregir</button>`;
                if(esPackReal){ return `<div style="font-size:13.5px;margin-top:3px">📦 <b>${esc(x.nomML||x.nombre)}</b> <span class="muted">→ descuenta:</span> ${comps.map(c=>c.cant*(x.cant||1)+"× "+esc(c.nombre)+stockChipImport(c.nombre)).join(", ")}
                  <button class="btn sm ghost" style="padding:2px 8px;font-size:11px" onclick="enseniarPack(${i},${pi})">editar pack</button> ${corregir}</div>`; }
                if(esPackND){ return `<div style="font-size:13.5px;margin-top:3px;padding:6px 8px;background:#fff3cd;border-radius:7px">⚠ <b>${esc(x.nomML||x.nombre)}</b> parece un pack. <button class="btn sm" style="padding:3px 10px;font-size:12px" onclick="enseniarPack(${i},${pi})">Enseñar qué descuenta</button> ${corregir}</div>`; }
                if(!x.reconocido && !esAliasSimple){ return `<div style="font-size:13.5px;margin-top:3px;padding:8px 10px;background:#ffe8e8;border-radius:7px">⚠ <b>${esc(x.nomML||("SKU "+x.sku))}</b>${x.sku?` <span class="muted">(SKU ${esc(x.sku)})</span>`:''} — no lo reconozco. <button class="btn sm" style="padding:3px 10px;font-size:12px" onclick="enseniarPack(${i},${pi})">Vincular a mi producto</button> ${corregir}<div class="muted" style="font-size:11px;margin-top:3px">"Vincular" lo enseña para siempre por este SKU. "✎ corregir" cambia solo este pedido (si la etiqueta mezcló el producto de otro cliente).</div></div>`; }
                // mismo cuidado que en itemsPedido: si ya quedó guardado un nombre de catálogo válido y
                // DISTINTO al del alias por SKU, confío en ese (el mismo SKU corto puede significar otra
                // cosa en otro pedido — pasó con "CURC") en vez de pisarlo con el vínculo aprendido
                const yaResuelto = esAliasSimple && x.nombre!==comps[0].nombre && PRODUCTOS.some(pp=>pp.nombre===x.nombre);
                const nombreFinal = (esAliasSimple && !yaResuelto) ? comps[0].nombre : x.nombre;
                return `<div style="font-size:13.5px;margin-top:2px">${x.cant}× ${esc(nombreFinal)}${stockChipImport(nombreFinal)} ${corregir}</div>`;
              }).join("")+`</div>`+agregar; })()}
            ${(f.prods&&f.prods.length>=1)?`<label style="display:flex;gap:8px;align-items:center;margin-top:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${IMP_REV[i]?'#d9f2e5':'#ffe8e8'}">
              <input type="checkbox" ${IMP_REV[i]?'checked':''} onchange="toggleRev(${i})" style="width:19px;height:19px;flex:0 0 auto">
              <span style="font-size:13px;font-weight:700;color:${IMP_REV[i]?'#0f6b40':'#c62828'}">${IMP_REV[i]?('✓ Revisé '+(f.prods.length===1?'este producto':'estos '+f.prods.length+' productos')):('Revisá '+(f.prods.length===1?'este producto':'estos '+f.prods.length+' productos')+' antes de guardar')}</span>
            </label>`:''}
            <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
              <select onchange="setImpMetodo(${i},this.value)" style="${selStyle}">
                <option value="cadete" ${impVal(f)==='cadete'?'selected':''}>🚴 Cadete (Cardinal)</option>
                <option value="correo" ${impVal(f)==='correo'?'selected':''}>📮 Correo a domicilio</option>
                <option value="sucursal" ${impVal(f)==='sucursal'?'selected':''}>🏤 Correo a sucursal</option>
              </select>
              ${esCorreo?`<label class="btn sm ghost" style="cursor:pointer;flex:0 0 auto">${f.etiquetaPdf?'📎 Cambiar PDF':'📎 PDF correo'}<input type="file" accept="application/pdf" style="display:none" onchange="adjuntarEtiquetaImport(${i},this.files[0])"></label>`:''}
            </div>
          </div>
        </div>`; }).join("")}
      <button class="btn block ${faltaRevisarImport()?'ghost':'green'}" style="margin-top:14px" onclick="confirmarImport()">${faltaRevisarImport()?'⚠ Revisá los productos marcados arriba':'Guardar '+sel.length+' pedido'+(sel.length===1?'':'s')}</button>
      <button class="btn block ghost" style="margin-top:8px" onclick="IMP_FILAS=[];IMP_SEL={};IMP_REV={};formImportar()">Cancelar</button>
    </div>`;
}
async function confirmarImport(){
  const sel=IMP_FILAS.filter((f,i)=>IMP_SEL[i]);
  if(!sel.length){ toast("Marcá al menos un pedido"); return; }
  if(faltaRevisarImport()){ toast("Revisá los productos de cada pedido antes de guardar (tildá 'Revisé')"); return; }
  // Productos que no reconocí: pregunto uno por uno qué producto es antes de guardar (y queda aprendido)
  for(let fi=0; fi<IMP_FILAS.length; fi++){ if(!IMP_SEL[fi]) continue;
    const pi=(IMP_FILAS[fi].prods||[]).findIndex(x=>x && x.reconocido===false);
    if(pi>=0){ const x=IMP_FILAS[fi].prods[pi];
      notify("❓ No reconozco un producto del pedido de "+(IMP_FILAS[fi].cliente||"—")+":\n\n\""+(x.nomML||x.nombre)+"\""+(x.sku?("  (SKU "+x.sku+")"):"")+"\n\nDecime qué producto es. Queda guardado y no te vuelvo a preguntar.");
      enseniarPack(fi,pi); if(ENS_CTX) ENS_CTX.seguirImport=true; return; } }
  // Última barrera anti-duplicados, justo antes de crear: por más que ya se filtró al leer la etiqueta,
  // puede pasar que 1) la misma venta haya quedado dos veces en la selección, o 2) el pedido ya se haya
  // guardado por otro lado (otro dispositivo, u otra importación) mientras tenías esto en pantalla.
  const todos=PEDIDOS.filter(p=>p.tipo===undefined || p.cliente!==undefined);
  const vistos=new Set(); const aCrear=[], duplicados=[];
  for(const f of sel){
    // comparo por dígitos (así "#123" y "123" son lo mismo) y también por N° de envío de ML
    const dg=s=>String(s||"").replace(/\D/g,"").replace(/^0+/,"");
    const r=dg(f.ref), e=dg(f.envio);
    const dup = (r && (todos.some(p=>p.estado!=="anulado" && dg(p.ref)===r) || vistos.has("r"+r)))
             || (e.length>=8 && (todos.some(p=>p.estado!=="anulado" && dg(p.envio)===e) || vistos.has("e"+e)));
    if(dup){ duplicados.push(f); continue; }
    if(r) vistos.add("r"+r); if(e.length>=8) vistos.add("e"+e);
    aCrear.push(f);
  }
  if(duplicados.length){
    const pl=duplicados.length===1;
    const detalle=duplicados.map(f=>"• "+(f.cliente||"—")+(f.ref?(" · "+f.ref):"")).join("\n");
    if(!aCrear.length){ notify("⚠ Ya "+(pl?"está":"están")+" cargado"+(pl?"":"s")+" (mismo N° de venta), no lo"+(pl?"":"s")+" vuelvo a crear:\n\n"+detalle); return; }
    if(!await askConfirm("⚠ "+duplicados.length+" pedido"+(pl?"":"s")+" de estos ya "+(pl?"está":"están")+" cargado"+(pl?"":"s")+" (mismo N° de venta) — no lo"+(pl?"":"s")+" voy a duplicar:\n\n"+detalle+"\n\n¿Guardo los otros "+aCrear.length+" igual?")) return;
  }
  const descartados=IMP_FILAS.filter((f,i)=>!IMP_SEL[i]).map(f=>f.ref).filter(Boolean);   // los que destildaste
  let creados=0;
  try{
    for(const f of aCrear){ f.canal=f.canal||IMP_CANAL; await crearPedido(f); creados++; }
  }catch(e){ notify("⚠️ IMPORTÉ "+creados+" DE "+aCrear.length+" Y FALLÓ\n\nError: "+(e&&e.message||e)+"\nVersión: "+APP_VERSION+"\n\nSacale captura y pasásela a Claude."); }
  try{ await agregarIgnorados(descartados); }catch(e){ logErr("auto",e); }   // que no vuelvan a aparecer
  if(creados===aCrear.length) notify("✅ "+creados+" PEDIDOS IMPORTADOS Y GUARDADOS"+(duplicados.length?(" (se salteó "+duplicados.length+" duplicado"+(duplicados.length===1?"":"s")+")"):"")+"\nVersión: "+APP_VERSION);
  IMP_FILAS=[]; IMP_SEL={}; IMP_REV={}; OPVIEW="pedidos"; vistaOperador();
}
/* ---- Importar PDF de preparación de Tienda Nube (separa columnas por posición) ---- */
async function leerPDF(file){
  if(!file) return;
  if(typeof pdfjsLib==="undefined"){ toast("No se pudo cargar el lector de PDF. Probá con el CSV."); return; }
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const texto=await pdfTexto(file);
    IMP_FILAS=parsePDF(texto);
    if(!IMP_FILAS.length){ toast("No encontré órdenes en el PDF"); return; }
    mostrarPreviewImport();
  }catch(e){ toast("No pude leer el PDF"); }
}
async function pdfTexto(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const lineas=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const vp=page.getViewport({scale:1}); const mid=vp.width/2;
    const tc=await page.getTextContent();
    const items=tc.items.map(it=>({x:it.transform[4],y:it.transform[5],s:it.str})).filter(it=>it.s.trim());
    [0,1].forEach(c=>{
      const col=items.filter(it=>(it.x>=mid?1:0)===c);
      col.sort((a,b)=>(Math.round(b.y/3)-Math.round(a.y/3))||(a.x-b.x));
      let cy=null,line=[];
      col.forEach(it=>{ const yy=Math.round(it.y/3);
        if(cy===null||yy===cy){ line.push(it.s); } else { lineas.push(line.join(" ")); line=[it.s]; } cy=yy; });
      if(line.length) lineas.push(line.join(" "));
    });
  }
  return lineas.join("\n");
}
function parsePDF(text){
  // Si el primer producto tiene un nombre largo, Tiendanube parte el titulo en dos renglones:
  // "Orden - Paquete #1" arriba y "#187" abajo. Lo vuelvo a juntar para no perder esa orden.
  text=String(text||"").replace(/Orden\s*(?:-\s*Paquete\s*#\d+\s*)?\n\s*(?:-\s*Paquete\s*#\d+\s*\n\s*)?#(\d+)/g, "Orden #$1\n");
  const out=[]; const bloques=text.split(/(?=Orden #\d+)/);
  bloques.forEach(b=>{
    const mref=b.match(/Orden #(\d+)/); if(!mref) return;
    const L=b.split("\n").map(s=>s.trim());
    let i0=L.findIndex(l=>/^Producto/.test(l)); i0=i0<0?1:i0+1;
    let iend=L.findIndex(l=>/^Subtotal/.test(l)); if(iend<0) iend=L.length;
    const sec=L.slice(i0,iend);
    const qty=[],frags=[];
    sec.forEach((l,k)=>{ if(!l||/^SKU:/.test(l)) return;
      const m=l.match(/(\d+)\s*x\s*\$/);
      if(m){ qty.push({k,c:+m[1]}); const np=l.slice(0,m.index).trim(); if(np) frags.push({k,t:np}); }
      else frags.push({k,t:l}); });
    const prods=qty.map(q=>({c:q.c,n:[]}));
    if(prods.length) frags.forEach(fr=>{ let bi=0; for(let i=0;i<qty.length;i++){ if(qty[i].k<=fr.k) bi=i; } prods[bi].n.push(fr); });
    const items=prods.map(p=>p.c+"x "+p.n.sort((a,b)=>a.k-b.k).map(f=>f.t).join(" ").replace(/\s+/g," ").replace(/\s+,/g,",").trim()).join(" · ");
    let cli="",m=b.match(/Entregar a:\s*(.+)/); if(m) cli=m[1].trim();
    else { const ei=L.findIndex(l=>/^Enviar a:/.test(l)); if(ei>=0) for(let j=ei+1;j<L.length;j++){ if(L[j]){ cli=L[j]; break; } } }
    let tel=""; m=b.match(/Tel[eé]fono:\s*(.+)/); if(m) tel=m[1].trim(); if(/no informado/i.test(tel)) tel="";
    let prov="",loc="",dir="",cp="";
    for(let j=0;j<L.length;j++){ const mm=L[j].match(/^(.*),\s*([^,]+),\s*(\d{3,4})$/);
      if(mm){ loc=mm[1].split(",").pop().trim(); prov=mm[2].trim(); cp=mm[3]; if(j>0) dir=L[j-1]; break; } }
    const retiro=/Direcci[oó]n de retiro/i.test(b) || /a sucursal/i.test(b);
    const an=anilloDe({provincia:prov, ciudad:loc, dir, cp});
    const r=sugerirRuta(prov,loc);
    let metodo,correo;
    if(retiro){ metodo="correo"; correo="Punto de retiro"; }        // retira en sucursal
    else if(llegaCadete({provincia:prov,ciudad:loc,dir,cp})){ metodo="cadete"; correo=""; }   // CABA / Zona 1-3 => cadete
    else { metodo="correo"; correo="Correo Argentino"; }             // BA sin cadete u otra provincia => correo
    out.push({empresa:IMP_EMPRESA, ref:"#"+mref[1], cliente:cli, tel, dir, ciudad:loc, provincia:prov, cp,
      items, metodo, origen:r.origen, correo});
  });
  return out;
}

/* ---------- OPERADOR · Pedido manual / editar ruta ---------- */
let EDIT_PRODS=[];
function pintarProdsEdit(){
  const box=$("#f_prodsBox"); if(!box) return;
  box.innerHTML = EDIT_PRODS.length ? EDIT_PRODS.map((x,i)=>`
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:.5px solid var(--border)">
      <span style="min-width:0;font-size:14px">${esc(x.nombre)}</span>
      <span class="row" style="gap:6px;flex:0 0 auto;align-items:center">
        <input type="number" min="1" value="${x.cant}" onchange="EDIT_PRODS[${i}].cant=Math.max(1,+this.value||1)" style="width:56px;text-align:center;padding:5px;border:1px solid var(--border);border-radius:8px;font:inherit;background:var(--bg)">
        <button type="button" class="btn sm ghost" style="color:var(--red)" onclick="quitarProdEdit(${i})">Quitar</button>
      </span>
    </div>`).join("")
    : `<div class="hint" style="margin:6px 0 0">Todavía no agregaste productos. Si dejás vacío, se usa el texto de referencia de arriba.</div>`;
}
function addProdEdit(){
  const inp=$("#f_addProd"), cn=$("#f_addCant"); if(!inp) return;
  const nom=(inp.value||"").trim(); if(!nom){ toast("Elegí un producto de la lista"); return; }
  const prod=PRODUCTOS.find(x=>x.nombre===nom)||mejorProducto(nom);
  if(!prod){ toast("Ese producto no está en el catálogo"); return; }
  const cant=Math.max(1,parseInt(cn&&cn.value,10)||1);
  const ya=EDIT_PRODS.find(x=>x.nombre===prod.nombre);
  if(ya) ya.cant+=cant; else EDIT_PRODS.push({nombre:prod.nombre,cant});
  inp.value=""; if(cn) cn.value=1;
  pintarProdsEdit(); toast(prod.nombre.split(" ").slice(0,3).join(" ")+" agregado");
}
function quitarProdEdit(i){ EDIT_PRODS.splice(i,1); pintarProdsEdit(); }
function formNuevo(edit){
  const p=edit||{};
  const provOpts=PROVINCIAS.map(pr=>`<option ${p.provincia===pr?'selected':''}>${pr}</option>`).join("");
  app().innerHTML=`
    <button class="btn sm ghost" onclick="vistaOperador()">← Volver</button>
    <div class="title" style="margin-top:14px">${edit?'Editar pedido':'Nuevo pedido'}</div>
    <div class="subtitle">${edit?'Corregí los datos y guardá — la etiqueta sale con lo nuevo':'Cargá el pedido a mano'}</div>
    <div class="card">
      <div class="card" style="background:var(--surface-2);border:1px solid var(--accent);margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px">📦 Envío y facturación</div>
        <div class="two">
          <div class="field"><span class="label">Quién envía (remitente)</span>
            <select id="f_emp">${EMPRESAS.map(e=>`<option value="${e.id}" ${p.empresa===e.id?'selected':''}>${esc(e.nombre)}</option>`).join("")}</select></div>
          <div class="field"><span class="label">Zona / importe</span>
            <select id="f_zona">
              <option value="" ${(p.zonaFija==null||p.zonaFija==="")?'selected':''}>Automática (${esc(anilloDe(p).label)})</option>
              <option value="0" ${String(p.zonaFija)==="0"?'selected':''}>CABA — ${fmtAr(precioCat("caba"))}</option>
              <option value="1" ${String(p.zonaFija)==="1"?'selected':''}>Zona 1 — ${fmtAr(precioCat("1"))}</option>
              <option value="2" ${String(p.zonaFija)==="2"?'selected':''}>Zona 2 — ${fmtAr(precioCat("2"))}</option>
              <option value="3" ${String(p.zonaFija)==="3"?'selected':''}>Zona 3 — ${fmtAr(precioCat("3"))}</option>
              <option value="9" ${String(p.zonaFija)==="9"?'selected':''}>Correo / sucursal — ${fmtAr(precioCat("correo"))}</option>
            </select></div>
        </div>
        ${edit?'':`<div class="field" style="margin-top:8px"><span class="label">Canal</span>
          <select id="f_canal">${CANALES.map(c=>`<option value="${c.id}">${esc(c.nombre)} · ${fmtAr(c.costo)}</option>`).join("")}</select></div>`}
      </div>
      <div class="two">
        <div class="field"><span class="label">Cliente</span><input id="f_cli" value="${esc(p.cliente||'')}" placeholder="Nombre y apellido"></div>
        <div class="field"><span class="label">N° de orden (Tienda Nube)</span><input id="f_ref" inputmode="numeric" value="${esc((p.ref||'').replace('#',''))}" placeholder="Ej: 4554"></div>
      </div>
      <div class="two">
        <div class="field"><span class="label">Teléfono</span><input id="f_tel" inputmode="tel" value="${esc(p.tel||'')}" placeholder="11 5678 9000"></div>
      </div>
      <div class="field"><span class="label">Dirección</span><input id="f_dir" value="${esc(p.dir||'')}" placeholder="Calle, número, piso/depto"></div>
      <div class="two">
        <div class="field"><span class="label">Localidad</span><input id="f_ciu" value="${esc(p.ciudad||'')}" placeholder="Ej: Palermo"></div>
        <div class="field"><span class="label">Provincia</span><select id="f_prov">${provOpts}</select></div>
      </div>
      <div class="field"><span class="label">Items (referencia de Tienda Nube)</span><textarea id="f_items" placeholder="Ej: 2x Magnesio · 1x Omega 3">${esc(p.items||'')}</textarea>
        <div class="hint" style="margin-top:4px">Este texto es solo para leer. Lo que se descuenta es la lista de abajo.</div></div>
      <div class="field"><span class="label">Productos a descontar (del catálogo)</span>
        <div id="f_prodsBox"></div>
        <div class="row" style="gap:8px;margin-top:8px;align-items:center">
          <input id="f_addProd" list="catProds" placeholder="🔍 Buscá el producto…" style="flex:1;min-width:0">
          <input id="f_addCant" type="number" inputmode="numeric" value="1" min="1" style="width:64px;text-align:center">
          <button type="button" class="btn sm" onclick="addProdEdit()">Agregar</button>
        </div>
        <datalist id="catProds">${PRODUCTOS.map(x=>`<option value="${esc(x.nombre)}">`).join("")}</datalist>
        <div class="hint" style="margin-top:6px">Buscá el producto correcto y agregalo. El de arriba queda como referencia nomás.</div>
      </div>
      <div class="field"><span class="label">Nota para la etiqueta (sale en negrita)</span><input id="f_nota" value="${esc(p.nota||'')}" placeholder="Ej: DEJAR EN CABINA DE VIGILANCIA"></div>
      <div class="two">
        <div class="field"><span class="label">Origen del envío</span>
          <select id="f_origen">
            <option value="bsas" ${p.origen==='bsas'?'selected':''}>Depósito Bs As</option>
            <option value="riotercero" ${p.origen==='riotercero'?'selected':''}>Río Tercero</option>
          </select></div>
        <div class="field"><span class="label">Método</span>
          <select id="f_metodo" onchange="toggleCorreo()">
            <option value="cadete" ${p.metodo==='cadete'?'selected':''}>Cadete (AMBA · Cardinal)</option>
            <option value="correo" ${p.metodo==='correo'?'selected':''}>Correo (interior)</option>
          </select></div>
      </div>
      <div id="bloqueCorreo" class="two ${p.metodo==='correo'?'':'hide'}">
        <div class="field"><span class="label">Correo</span>
          <select id="f_correo">${CORREOS.map(c=>`<option ${p.correo===c?'selected':''}>${c}</option>`).join("")}</select></div>
        <div class="field"><span class="label">Nº seguimiento</span><input id="f_track" value="${esc(p.tracking||'')}" placeholder="opcional"></div>
      </div>
      ${edit&&p.id?`<div class="field" style="margin-bottom:14px"><span class="label">Foto del pedido preparado</span>${fotoPedidoHTML(p)}</div>`:''}
      <button class="btn block" onclick='${edit?`guardarEdicion(${JSON.stringify(p.id)})`:"guardarNuevo()"}'>${edit?'Guardar cambios':'Crear pedido'}</button>
    </div>`;
  EDIT_PRODS=(p.prods&&p.prods.length)?p.prods.map(x=>({nombre:x.nombre,cant:+x.cant||1})):[];
  // pedido sin productos para descontar: los armo solos desde el texto de referencia
  if(!EDIT_PRODS.length && (p.items||"").trim()){
    const r=prodsDesdeTexto(p.items); EDIT_PRODS=r.ok.map(x=>({nombre:x.nombre,cant:x.cant}));
    if(EDIT_PRODS.length) setTimeout(()=>toast("Cargué "+EDIT_PRODS.length+" producto"+(EDIT_PRODS.length===1?"":"s")+" desde la referencia · revisalos y guardá"),50);
    if(r.dudosos.length) setTimeout(()=>notify("❓ No encontré en el catálogo:\n\n"+r.dudosos.join("\n")+"\n\nAgregalo a mano con el buscador."),300);
  }
  pintarProdsEdit();
}
function toggleCorreo(){ const m=$("#f_metodo").value;
  $("#bloqueCorreo").classList.toggle("hide", m!=="correo"); }
async function guardarNuevo(){
  const cliente=$("#f_cli").value.trim();
  if(!cliente){ toast("Falta el nombre del cliente"); return; }
  const metodo=$("#f_metodo").value;
  const refN=($("#f_ref")?$("#f_ref").value:"").trim().replace(/\D/g,"");
  const refFinal=refN?("#"+refN):"";
  if(refFinal){   // anti-duplicados: si ya existe un pedido con ese mismo N°, aviso antes de crear otro
    const existente=PEDIDOS.filter(p=>p.tipo===undefined || p.cliente!==undefined).find(p=>p.ref===refFinal);
    if(existente && !await askConfirm("⚠ Ya existe un pedido con el N° "+refFinal+":\n\n"+(existente.cliente||"—")+"\n\n¿Creás este de todos modos?")) return;
  }
  try{
    await crearPedido({ empresa:$("#f_emp").value, canal:$("#f_canal").value, cliente, ref:refFinal, nota:($("#f_nota")?$("#f_nota").value:"").trim(), zonaFija:($("#f_zona")?$("#f_zona").value:""), tel:$("#f_tel").value.trim(),
      dir:$("#f_dir").value.trim(), ciudad:$("#f_ciu").value.trim(), provincia:$("#f_prov").value,
      items:$("#f_items").value.trim(), prods:EDIT_PRODS.map(x=>({...x,noPack:true})), origen:$("#f_origen").value, metodo,
      correo: metodo==="correo"?$("#f_correo").value:"", tracking: metodo==="correo"?$("#f_track").value.trim():"" });
    toast("Pedido creado ✅");
  }catch(e){ notify("⚠️ NO SE PUDO CREAR EL PEDIDO\n\nError: "+(e&&e.message||e)+"\nVersión: "+APP_VERSION+"\n\nSacale captura y pasásela a Claude."); return; }
  vistaOperador();
}
async function guardarEdicion(id){
  const cliente=$("#f_cli").value.trim();
  if(!cliente){ toast("Falta el nombre del cliente"); return; }
  const metodo=$("#f_metodo").value;
  const refV=($("#f_ref")?$("#f_ref").value:"").trim().replace(/\D/g,"");
  await DB.update(id,{ cliente, empresa:($("#f_emp")?$("#f_emp").value:undefined), ref:refV?("#"+refV):"", nota:($("#f_nota")?$("#f_nota").value:"").trim(), zonaFija:($("#f_zona")?$("#f_zona").value:""), tel:$("#f_tel").value.trim(), dir:$("#f_dir").value.trim(),
    ciudad:$("#f_ciu").value.trim(), provincia:$("#f_prov").value, items:$("#f_items").value.trim(), prods:EDIT_PRODS.map(x=>({...x,noPack:true})),
    origen:$("#f_origen").value, metodo, correo: metodo==="correo"?$("#f_correo").value:"",
    tracking: metodo==="correo"?$("#f_track").value.trim():"" });
  // Si ya se había descontado, ofrezco rehacer el descuento con las cantidades nuevas
  const p=PEDIDOS.find(x=>x.id===id)||await DB.get(id);
  if(p && p.stockBajado && descuentoActivo()){
    let det=""; try{ det=itemsPedido(p).map(i=>"· "+i.cant+"x "+i.prodNombre).join("\n"); }catch(e){ logErr("auto",e); }
    if(await askConfirm("Este pedido ya estaba descontado del stock.\n\n¿Rehago el descuento con lo que quedó ahora?\n\n"+det+"\n\n(Devuelve lo anterior y descuenta esto. Si decís que no, el stock queda como estaba.)")){
      await devolverStockPedido(id);
      await DB.update(id,{stockBajado:false});
      await descontarStockPedido(id,null,true);
      toast("Pedido corregido y stock actualizado ✓"); vistaOperador(); return;
    }
  }
  toast("Pedido corregido"); vistaOperador();
}
/* Devuelve al stock lo que se había descontado de un pedido (borra sus salidas) */
async function devolverStockPedido(id){
  const p=await DB.get(id); if(!p) return;
  const ref=p.ref||p.id;
  await borrarMovs(m=>m.tipo==="salida" && m.ref===ref);
}
/* Eliminar DEFINITIVO (solo admin): borra el pedido de la base */
async function eliminarPedido(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  if(!await askConfirm("¿ELIMINAR este pedido para siempre?\n\n"+(p.cliente||"")+" · "+numOrden(p)+"\n\nNo se puede recuperar. (Si solo querés sacarlo de la lista, usá Anular)",{yes:"Eliminar",danger:true})) return;
  if(!await askConfirm("¿Seguro? Se borra definitivamente.",{yes:"Sí, borrar",danger:true})) return;
  try{
    if(p.stockBajado) await devolverStockPedido(id);   // devuelve el stock si estaba descontado
    await DB.delete(id);
    toast("Pedido eliminado 🗑️");
  }catch(e){ notify("⚠️ No pude eliminar: "+(e&&e.message||e)); }
  vistaOperador();
}
async function anularPedido(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  if(!await askConfirm("¿Anular este pedido? Sale de la lista y no se despacha. (Después lo podés reactivar)",{yes:"Anular"})) return;
  if(p.stockBajado) await devolverStockPedido(id);   // si se había descontado, se devuelve al stock
  await DB.update(id,{ estado:"anulado", stockBajado:false,
    eventos:[...(p.eventos||[]),{estado:"anulado",ts:Date.now(),nota:"Pedido anulado"}] });
  toast("Pedido anulado"); vistaOperador();
}
async function reactivarPedido(id){
  const p=PEDIDOS.find(x=>x.id===id); if(!p) return;
  await DB.update(id,{ estado:"pendiente",
    eventos:[...(p.eventos||[]),{estado:"pendiente",ts:Date.now(),nota:"Pedido reactivado"}] });
  toast("Pedido reactivado"); vistaOperador();
}

/* ---------- OPERADOR · Depósito (reabastecimientos) ---------- */
function vistaDeposito(){
  const list=soloReabas();
  app().innerHTML=`
    ${segOp('deposito')}
    <div class="title">Depósito Bs As</div>
    <div class="subtitle">Reabastecimientos desde Río Tercero</div>
    <div class="card" style="margin-bottom:16px">
      <div class="field"><span class="label">Nuevo reabastecimiento (qué mandás)</span>
        <textarea id="r_det" placeholder="Ej: 24x Magnesio · 12x Omega 3 · 18x Vit D3 K2"></textarea></div>
      <button class="btn" onclick="nuevoReabas()">Cargar reabastecimiento</button>
    </div>
    <div>${list.map(cardReabas).join("")||empty('truck','Sin reabastecimientos cargados.')}</div>`;
}
async function nuevoReabas(){
  const d=$("#r_det").value.trim(); if(!d){ toast("Escribí qué mandás"); return; }
  await crearReabas(d); vistaDeposito();
}
function cardReabas(p){
  const e=reabasObj(p.estado), i=REABAS.findIndex(x=>x.id===p.estado), sig=REABAS[i+1];
  return `<div class="order">
    <div class="top"><span class="code">${esc(p.id)}</span>
      <span class="badge"><span class="dot" style="background:${e.color}"></span>${e.label}</span></div>
    <div style="margin:6px 0"><span class="tag">Carga</span> ${esc(p.detalle||'—')}</div>
    <div class="acts">${sig?`<button class="btn sm" onclick="avanzarReabas('${p.id}','${sig.id}')">→ ${sig.label}</button>`:'<span class="muted">Completo</span>'}</div>
  </div>`;
}

/* ---------- OPERADOR · Hoja de ruta (cadete CABA) ---------- */
function vistaRuta(){
  const stops=soloPedidos().filter(p=>p.metodo==="cadete"
    && ["preparado","asignado","en_reparto"].includes(p.estado));   // solo lo activo: entregados/anulados afuera
  const ruta=rutaOptima(stops); RUTA_ACTUAL=ruta;
  const km=ruta.reduce((s,p)=>s+(p._km||0),0);
  const min=Math.round(ruta.length*5 + km/18*60);
  app().innerHTML=`
    ${segOp('ruta')}
    <div class="title">Hoja de ruta</div>
    <div class="subtitle">Salida: Puerto Madero · ${ruta.length} paradas · ~${km.toFixed(1)} km · ~${min} min</div>
    ${ruta.length?`<div class="row" style="margin-bottom:14px">
      <button class="btn" onclick="abrirMapsRuta()">${icon('pin')} Abrir recorrido en Google Maps</button>
      <button class="btn ghost" onclick="imprimirRuta()">${icon('printer')} Imprimir hoja de ruta</button>
    </div>`:""}
    ${ruta.map((p,i)=>`<div class="order">
      <div class="top"><span class="code">${i+1}</span>
        <span class="chip ${canalDe(p)==='ml_flex'?'flex':'tn'}">${esc(empresaObj(p.empresa).nombre)}</span>
        <span class="badge"><span class="dot" style="background:${estObj(p.estado).color}"></span>${estObj(p.estado).label}</span></div>
      <div class="who">${esc(p.cliente)} · ${esc(p.id)}</div>
      <div class="addr">${esc(p.dir)} — ${esc(p.ciudad)} · <b>+${(p._km||0).toFixed(1)} km</b></div>
    </div>`).join("")||empty('truck','No hay pedidos de cadete en CABA para rutear.')}`;
}
function abrirMapsRuta(){
  if(!RUTA_ACTUAL.length){ toast("No hay paradas"); return; }
  const u="https://www.google.com/maps/dir/"+encodeURIComponent("Puerto Madero, CABA")+"/"+
    RUTA_ACTUAL.map(p=>encodeURIComponent((p.dir||"")+", "+(p.ciudad||"")+", CABA")).join("/")+"/?travelmode=driving";
  window.open(u,"_blank");
}
function imprimirRuta(){
  if(!RUTA_ACTUAL.length){ toast("No hay paradas"); return; }
  const w=window.open("","_blank","width=820,height=920");
  if(!w){ toast("Permití las ventanas emergentes"); return; }
  const filas=RUTA_ACTUAL.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.cliente)}</td><td>${esc(p.dir)}<br><small>${esc(p.ciudad)}</small></td><td>${esc(empresaObj(p.empresa).nombre)}</td><td>${esc(p.id)}</td><td>${esc(p.tel||"")}</td><td></td><td></td></tr>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Hoja de ruta</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:18px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:12px}'+
    'th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}th{background:#2c3e50;color:#fff}'+
    'tr:nth-child(even) td{background:#f2f4f7}@page{margin:12mm}</style></head><body>'+
    '<h1>Hoja de ruta — Cadete CABA</h1>'+
    '<p>Salida: Puerto Madero · '+RUTA_ACTUAL.length+' paradas · Fecha: ____/____/____ · Cadete: ________________</p>'+
    '<table><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Empresa</th><th>Pedido</th><th>Teléfono</th><th>Hora entrega</th><th>Recibió / Obs.</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}

/* Hoja de despacho A4: lista de envíos por correo para que el gestor los prepare y despache */
function hojaEnvios(){
  const arr=soloPedidos().filter(p=>p.metodo==="correo" && !["entregado","confirmado"].includes(p.estado))
    .sort((a,b)=>(a.correo||"").localeCompare(b.correo||"")||(a.provincia||"").localeCompare(b.provincia||""));
  if(!arr.length){ toast("No hay envíos por correo para despachar"); return; }
  const w=window.open("","_blank","width=860,height=920");
  if(!w){ toast("Permití las ventanas emergentes"); return; }
  const hoy=new Date().toLocaleDateString("es-AR");
  const filas=arr.map((p,i)=>`<tr>
    <td style="text-align:center">${i+1}</td>
    <td><b>${esc(p.id)}</b><br><small>${esc(empresaObj(p.empresa).nombre)}</small></td>
    <td>${esc(p.cliente)}<br><small>${esc(p.tel||"")}</small></td>
    <td>${esc(p.dir||"")}<br><small>${esc(p.ciudad||"")}, ${esc(p.provincia||"")}${p.cp?(" ("+esc(p.cp)+")"):""}</small></td>
    <td>${esc(p.correo||"Correo")}</td>
    <td><small>${esc(p.items||"—")}</small></td>
    <td style="min-width:32mm"></td></tr>`).join("");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Hoja de envíos</title>'+
    '<style>body{font-family:Arial,sans-serif;padding:22px;color:#000}h1{font-size:18px;margin:0 0 4px}'+
    'p{font-size:12px;color:#333;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:11px}'+
    'th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}th{background:#2c3e50;color:#fff}'+
    'small{color:#555}tr:nth-child(even) td{background:#f2f4f7}@page{margin:11mm}</style></head><body>'+
    '<h1>Hoja de despacho — Envíos por correo</h1>'+
    '<p>Fecha: '+hoy+' · '+arr.length+' paquetes · Preparó: ________________ · Despachó: ________________</p>'+
    '<table><thead><tr><th>#</th><th>Pedido</th><th>Cliente</th><th>Destino</th><th>Correo</th><th>Contenido</th><th>N° de seguimiento</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    '<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function etiquetasPend(){ printLabels(soloPedidos().filter(p=>p.estado==="pendiente")); }

/* ---------- OPERADOR · Stock ---------- */
let STOCK_DET=null;
function verMovsProd(nombre){ nombre=decodeURIComponent(nombre); STOCK_DET=(STOCK_DET===nombre)?null:nombre; vistaStock(); }
function movsProdHTML(prod,st){
  const movs=(st.movs||[]).filter(m=>m.prod===prod).sort((a,b)=>(b.ts||0)-(a.ts||0));
  if(!movs.length) return '<div class="hint" style="margin-top:8px">Sin movimientos.</div>';
  let saldo=movs.reduce((s,m)=>s+(m.tipo==="salida"?-m.cant:m.cant),0);
  const filas=movs.map(m=>{
    const esSal=m.tipo==="salida";
    const linea=`<div style="padding:7px 0;border-top:.5px solid var(--border);font-size:12.5px">
      <div class="row" style="justify-content:space-between;gap:8px">
        <span style="min-width:0">${esSal?"↓":"↑"} <b>${esc(m.cliente||m.motivo||(esSal?"Salida":"Entrada"))}</b></span>
        <span style="flex:0 0 auto;font-weight:700;color:${esSal?'#e5484d':'var(--green)'}">${esSal?"−":"+"}${m.cant}</span>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:1px">
        ${m.ts?new Date(m.ts).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""}
        ${m.ref?(" · N° "+esc(m.ref)):""}${m.empresa?(" · "+esc(nombreEmp(m.empresa))):""}${m.zona?(" · "+esc(m.zona)):""}
      </div></div>`;
    return linea; }).join("");
  return `<div style="margin-top:10px;padding:10px 12px;background:var(--bg-2);border-radius:10px">
    <div class="row" style="justify-content:space-between"><span class="label" style="margin:0">Historial · ${movs.length} movimientos</span>
      <b style="color:${saldo<0?'#e5484d':'inherit'}">Saldo ${saldo}</b></div>
    ${filas}
  </div>`;
}
