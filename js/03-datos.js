/* ============================================================
   03-datos — Capa de datos: Firebase o modo demo (una sola interfaz)
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
let DB;
/* Cuántos días de historia bajamos al abrir la app. Lo más viejo se consulta cuando hace falta. */
const DIAS_VENTANA=75;
function initDB(){
  const ok = FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && typeof firebase!=="undefined";
  if(ok) setTimeout(()=>{ try{ suscribirMovs(); }catch(e){ logErr("initDB movs", e); } }, 300);
  if(ok){
    firebase.initializeApp(FIREBASE_CONFIG);
    const fs=firebase.firestore();
    // Un dato vacio (undefined) en cualquier campo hacia fallar TODO el guardado ("Unsupported field value: undefined").
    // Con esto Firebase simplemente omite ese campo y guarda el pedido.
    try{ fs.settings({ignoreUndefinedProperties:true, merge:true}); }catch(e){ console.warn(e); }
    const col=fs.collection("pedidos");
    DB={ modo:"firebase",
      /* No bajamos TODA la historia: solo lo de los últimos DIAS_VENTANA días, lo que sigue
         abierto (aunque sea viejo) y los documentos de configuración (stock, packs, caja…).
         Son tres consultas chicas en vez de una gigante; se juntan acá y se avisa una sola vez. */
      subscribe(cb){
        const corte=Date.now()-DIAS_VENTANA*86400000;
        const abiertos=["pendiente","preparado","asignado","en_reparto","despachado","en_camino","entregado"];
        const config=["stock","packs","caja","cierres","barcodes","prodsExtra","ignorados","marcasProd","checkouts","cupones"];
        const partes={recientes:[], abiertos:[], config:[]};
        let listo=false;
        const emitir=()=>{
          const map=new Map();
          [...partes.config, ...partes.abiertos, ...partes.recientes].forEach(p=>map.set(p.id,p));
          const a=[...map.values()].sort((x,y)=>(y.creado||0)-(x.creado||0));
          cb(a);
        };
        const avisar=e=>{
          console.error("pedidos:", e);
          logErr("leer pedidos", e);
          if(listo) return; listo=true;
          const permiso=e&&e.code==="permission-denied";
          const msg=permiso?"⚠️ No tengo permiso para leer los pedidos. Avisale al admin: hay que habilitar este acceso en las reglas de Firebase."
                           :"⚠️ No pude cargar los pedidos ("+((e&&e.code)||"error")+"). Revisá la conexión y recargá.";
          const b=document.createElement("div");
          b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:9999;background:#b00020;color:#fff;padding:12px 16px;font-weight:600;text-align:center";
          b.textContent=msg; document.body.appendChild(b);
        };
        col.where("creado",">=",corte).onSnapshot(s=>{ partes.recientes=s.docs.map(x=>({id:x.id,...x.data()})); emitir(); }, avisar);
        col.where("estado","in",abiertos).onSnapshot(s=>{ partes.abiertos=s.docs.map(x=>({id:x.id,...x.data()})); emitir(); }, avisar);
        col.where("tipo","in",config).onSnapshot(s=>{ partes.config=s.docs.map(x=>({id:x.id,...x.data()})); emitir(); }, avisar);
      },
      async create(o){ if(o.creado==null) o.creado=Date.now();
        try{ return (await col.add(o)).id; }catch(e){ logErr("guardar en la base", e, true); throw e; } },
      async update(id,patch){
        try{ await col.doc(id).update(patch); }
        catch(e){ logErr("guardar cambios ("+id+")", e, true); throw e; } },
      async delete(id){
        try{ await col.doc(id).delete(); }catch(e){ logErr("borrar de la base", e, true); throw e; } },
      async get(id){ const d=await col.doc(id).get(); return d.exists?{id:d.id,...d.data()}:null; } };
  } else {
    const KEY="despacho_v6";
    const read=()=>{ try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]} };
    const write=a=>localStorage.setItem(KEY,JSON.stringify(a));
    let L=[], seq=0; const emit=()=>{ const a=read().sort((x,y)=>y.creado-x.creado); L.forEach(f=>f(a)); };
    window.addEventListener("storage",e=>{ if(e.key===KEY) emit(); });
    DB={ modo:"demo",
      subscribe(cb){ L.push(cb); emit(); },
      async create(o){ const a=read(); const id=(o.tipo==="reabastecimiento"?"R":"P")+Date.now().toString(36).toUpperCase()+(seq++).toString(36).toUpperCase();
        a.push({id,...o}); write(a); emit(); return id; },
      async update(id,patch){ const a=read(); const i=a.findIndex(p=>p.id===id);
        if(i>=0){ a[i]={...a[i],...patch}; write(a); emit(); } },
      async delete(id){ const a=read(); const i=a.findIndex(p=>p.id===id); if(i>=0){ a.splice(i,1); write(a); emit(); } },
      async get(id){ return read().find(p=>p.id===id)||null; },
      reset(blank){ localStorage.removeItem(KEY); if(blank){localStorage.setItem("despacho_blank","1");} else {localStorage.removeItem("despacho_blank"); sembrarDemo(write,read);} emit(); } };
    if(read().length===0 && !localStorage.getItem("despacho_blank")) sembrarDemo(write,read);
  }
}
function sembrarDemo(write,read){
  // Demanda concentrada por barrio (los que más compran primero). Total = 35 envíos.
  const barrios=[
    ["Palermo","Thames",7],["Belgrano","Av. Cabildo",5],["Caballito","Av. Rivadavia",4],
    ["San Nicolás","Av. Corrientes",4],["Recoleta","Av. Santa Fe",3],["Núñez","Crisólogo Larralde",2],
    ["Villa Crespo","Av. Corrientes",2],["Almagro","Av. Medrano",2],["Flores","Av. Nazca",2],
    ["Villa Urquiza","Av. Triunvirato",2],["Colegiales","Conde",1],["Barracas","Av. Montes de Oca",1]
  ];
  const nombres=["María González","Jorge Pérez","Sofía Castro","Diego Ramírez","Lucía Fernández","Martín Suárez","Camila Ríos","Pablo Gómez","Valentina Díaz","Nicolás Torres","Florencia Romano","Agustín Molina","Carla Benítez","Federico Luna","Brenda Acosta","Tomás Vega","Julieta Sosa","Ramiro Cabrera","Daniela Ponce","Ezequiel Ferreyra","Micaela Ortiz","Lautaro Méndez","Antonella Ruiz","Gonzalo Silva","Rocío Herrera","Matías Paz","Belén Cardozo","Iván Figueroa","Sol Medina","Joaquín Ramos","Abril Vera","Bruno Aguirre","Paula Navarro","Franco Ledesma","Milagros Coria"];
  const items=["2x Magnesio · 1x Omega 3","1x Vit D3 K2 · 1x Complex B","1x Colágeno · 1x Biotina","1x Creatina · 1x NAD+","2x Omega 3","1x Ashwagandha · 1x Zinc","1x Multivitamínico","3x Magnesio","1x Proteína · 1x Creatina","1x Elixir · 2x Colágeno"];
  const empresas=["labs","nutrivibe"];
  const estados=["pendiente","pendiente","preparado","preparado","asignado","en_reparto","entregado","confirmado"];
  const cadetes=["Cadete CABA 1","Cadete CABA 2"];
  const arr=[]; let i=0;
  barrios.forEach(b=>{ for(let n=0;n<b[2];n++){
    const emp=empresas[i%2], canal=emp==="labs"?"tiendanube":"ml_flex";
    const estado=estados[(i*3)%estados.length];
    const cadete=["asignado","en_reparto","entregado","confirmado"].includes(estado)?cadetes[i%2]:"";
    const ref=emp==="labs"?("#"+(1100+i)):("#"+(2000000+i*131));
    arr.push({tipo:"pedido",empresa:emp,canal,ref,cliente:nombres[i%nombres.length],
      tel:"11"+(40000000+i*111111).toString().slice(0,8),
      dir:b[1]+" "+(100+(i*47)%4800),ciudad:b[0],provincia:"CABA",
      items:items[i%items.length],origen:"bsas",metodo:"cadete",cadete,estado});
    i++;
  }});
  arr.push({tipo:"reabastecimiento",detalle:"24x Magnesio · 12x Omega 3 · 18x Vit D3 K2 · 10x Colágeno",estado:"en_transito"});
  arr.forEach((p,k)=>{ const id=(p.tipo==="reabastecimiento"?"R":"P")+(Date.now()+k).toString(36).toUpperCase();
    const t=Date.now()-k*1200000;
    const a=read(); a.push({id,...p,creado:t,eventos:[{estado:p.estado,ts:t,nota:"Ejemplo"}]}); write(a); });
}

/* =========================================================================
   5) ESTADO EN MEMORIA + UTILIDADES
   ========================================================================= */
