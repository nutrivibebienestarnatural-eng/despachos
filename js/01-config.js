/* ============================================================
   01-config — Configuración: Firebase, empresas, productos, zonas, precios, packs y códigos de barras
   Parte de la app de despacho. Los archivos se cargan en orden
   desde index.html; todas las funciones comparten el mismo ámbito.
   ============================================================ */
/* =========================================================================
   1) CONFIGURACIÓN
   Pegá tu config de Firebase para sincronizar entre dispositivos en vivo.
   Vacío = MODO DEMO (guarda en este navegador). Instrucciones al final.
   ========================================================================= */
/* Selectores de fecha: mientras se tipea el año (0002, 0020, 0202…) el valor ya es una fecha válida y
   el onchange redibujaba la pantalla, dejando el año trabado en 0006. Se ignora todo cambio con año < 2000. */
document.addEventListener("change", e=>{
  const t=e.target;
  if(t && t.tagName==="INPUT" && t.type==="date" && t.value && parseInt(t.value.slice(0,t.value.indexOf("-")),10)<2000) e.stopImmediatePropagation();
}, true);
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD7Bzg7yP8yP_ZsvpShh6Fi7mYsc-_bUik",
  authDomain: "fullminenet.firebaseapp.com",
  projectId: "fullminenet",
  storageBucket: "fullminenet.firebasestorage.app",
  messagingSenderId: "146516942073",
  appId: "1:146516942073:web:2b54e15eb6fe4a6575d628",
  measurementId: "G-C4MEPBGVW6"
};

const CADETES = ["Cardinal","Claudia"];   // quienes reparten CABA + Buenos Aires (no correo)
const CADETES_SIN_COSTO = ["Claudia"];    // reparten pero NO se les paga (no cobran)
function cadeteCobra(quien){ return !CADETES_SIN_COSTO.some(c=>c.toLowerCase()===String(quien||"").toLowerCase()); }
let CADETERIA_TEL = "";                 // WhatsApp de Cardinal (mensajería) para mandarles el reparto
const CORREOS = ["Andreani","OCA","Correo Argentino","Vía Cargo","Cruz del Sur"];
/* Catálogo de productos. El campo `barcode` es lo que lee el lector:
   poné el código de barras real (EAN) impreso en cada paquete. Acá uso el SKU como referencia.
   Completá con tu catálogo completo de Labs Nutrition. */
const PRODUCTOS = [
  {barcode:"0714604143901", nombre:"Aceite Esencial De Cúrcuma Labs Nutrition (30ml)"},
  {barcode:"0714604143871", nombre:"Aceite Esencial De Orégano Labs Nutrition (30ml)"},
  {barcode:"0714604143888", nombre:"Aceite Esencial De Romero Labs Nutrition (30ml) - Capilar"},
  {barcode:"0714604213192", nombre:"Aceite Esencial De Tomillo Labs Nutrition (30ml) Tonificante"},
  {barcode:"0714604143895", nombre:"Aceite Esencial De Urucum Labs Nutrition (30ml)"},
  {barcode:"0714604143789", nombre:"Acido Alfa Lipoico 500mg - Antioxidante (60 capsulas)"},
  {barcode:"0714604142911", nombre:"Acido Fólico (60 capsulas)"},
  {barcode:"0714604142928", nombre:"Acido Hialurónico (60 capsulas)"},
  {barcode:"0714604142935", nombre:"Adrelax - Cortisol Support (60 capsulas) EX ADRENO CORTISOL - MISMA FORMULA"},
  {barcode:"0714604213345", nombre:"Adrelax - Cortisol Support (60 comprimidos) EX ADRENO CORTISOL - MISMA FORMULA"},
  {barcode:"0714604142942", nombre:"AKG - Acido Alfa Ketoglutarico - Longevidad (60 capsulas)"},
  {barcode:"0714604213215", nombre:"Ashwagandha 100% Pura - Estrés, Insomnio, Fatiga (60 Capsulas)"},
  {barcode:"0714604143734", nombre:"Astaxantina 10 mg - Antioxidante, Piel, Ojos, Articulaciones (30 capsulas)"},
  {barcode:"0714604143864", nombre:"Astaxantina 4 Mg - Antioxidante, Piel, Ojos, Articulaciones"},
  {barcode:"0714604142966", nombre:"BCAA Aminoácidos Esenciales 600mg - Masa Muscular, recuperador (90 Capsulas)"},
  {barcode:"0714604213772", nombre:"Beta Alanina - Fatiga y recuperacion muscular (120 capsulas)"},
  {barcode:"0714604142973", nombre:"Betacaroteno (60 capsulas)"},
  {barcode:"0714604142980", nombre:"Bio F - Hongo Candida (60 Capsulas) EX BIO FLORATIN - MISMA FORMULA"},
  {barcode:"0714604213390", nombre:"Bisglicinato de magnesio (60 comprimidos)"},
  {barcode:"0714604142997", nombre:"Bisglicinato de Magnesio 500 mg (60 capsulas)"},
  {barcode:"0714604143109", nombre:"Blend Fusion (60 capsulas) EX COLAGENOL (60 CAPSULAS)"},
  {barcode:"0714604143017", nombre:"C Stop - Candida Balance (60 capsulas) EX CANDIDA STOP - MISMA FORMULA"},
  {barcode:"0714604213338", nombre:"Cafeína + Guaraná - Concentración, Energía (60 Capsulas)"},
  {barcode:"0714604213765", nombre:"Calcio Plus - Calcio + Vitamina D3, Salud Ósea (60 Capsulas)"},
  {barcode:"0714604213574", nombre:"Centella Asiática - Cicatrizante, Celulitis (30 Capsulas)"},
  {barcode:"0714604213789", nombre:"Cistina Action - Capilar (60 capsulas)"},
  {barcode:"0714604143062", nombre:"Citrato de Magnesio 400 mg (60 capsulas)"},
  {barcode:"0714604213420", nombre:"Citrato de Magnesio 400 mg (60 comprimidos)"},
  {barcode:"0714604143093", nombre:"Citrato de Potasio 400 mg (60 capsulas)"},
  {barcode:"0714604143215", nombre:"Clean F - Hongo Candida (60 Capsulas) EX FUNGI CLEAN - MISMA FORMULA"},
  {barcode:"0714604143857", nombre:"Coenzima Q10 300 mg - Antioxidante, Energia (60 capsulas)"},
  {barcode:"0714604213239", nombre:"Complex B - Complejo vitamínico B (30 capsulas)"},
  {barcode:"0714604143321", nombre:"Creatina (90 capsulas)"},
  {barcode:"0714604213444", nombre:"Creatina Pura 100% Labs Nutrition (300 gr)"},
  {barcode:"0714604143161", nombre:"Cúrcuma Activada con Jengibre (60 capsulas)"},
  {barcode:"0714604143178", nombre:"Curcuma organica"},
  {barcode:"0714604213871", nombre:"Cynara Plus, Digestión Y Metabolización De Grasas (60 Caps)"},
  {barcode:"0714604143192", nombre:"Elixir Bio-Regenerador (60 capsulas)"},
  {barcode:"0714604213628", nombre:"Fucus Plus (60 capsulas)"},
  {barcode:"0714604213819", nombre:"Full Men - Estimulante Natural (60 capsulas)"},
  {barcode:"0714604213321", nombre:"Garcinia Cambigia - Quemador de grasas, saciedad (60 capsulas)"},
  {barcode:"0714604213611", nombre:"Ginkgo Biloba - Memoria, Concentración (60 Capsulas)"},
  {barcode:"0714604213406", nombre:"Glicinato de magnesio (60 Comprimidos)"},
  {barcode:"0714604143222", nombre:"Glicinato de Magnesio 500 mg (60 caps)"},
  {barcode:"0714604213222", nombre:"Gluconato De Zinc - Sistema Inmunológico (60 Capsulas)"},
  {barcode:"0714604213468", nombre:"Glutamina Micronizada 300 gr"},
  {barcode:"0714604143239", nombre:"Glutatión Labs Nutrition - Antioxidante (60 Capsulas)"},
  {barcode:"0714604213550", nombre:"Glutatión Labs Nutrition - Antioxidante (60 Comprimidos)"},
  {barcode:"0714604213307", nombre:"Hiper T - Tiroides control (60 capsulas) EX HIPERTIROIDAL"},
  {barcode:"0714604213291", nombre:"Hipo T - Tiroides control (60 capsulas) EX HIPOTIROIDAL"},
  {barcode:"0714604143253", nombre:"Hongos Adaptogenos - Anti estrés (60 capsulas)"},
  {barcode:"0714604143260", nombre:"INOSITOL - Vitamina B8 (30 capsulas)"},
  {barcode:"0714604213581", nombre:"Inulina - Prebiotico Natural (60 capsulas) EX PREBIOTICO+"},
  {barcode:"0714604143284", nombre:"Kardio 3 (60 capsulas)"},
  {barcode:"NO CORRESPONDE", nombre:"Kit Active Vital - Oxido Nitrico + Nad con Resveratrol + BCAA (3 unidades)"},
  {barcode:"NO CORRESPONDE", nombre:"Kit Daily Energy - Curcuma con Jengibre + Nad con Resveratrol + Malato de Magnesio (3 unidades)"},
  {barcode:"NO CORRESPONDE", nombre:"Kit Hongo Candida (180 capsulas)"},
  {barcode:"NO CORRESPONDE", nombre:"Kit Skin Balance - Omega 3 + Coenzima Q10 + Centella Asiatica (3 unidades)"},
  {barcode:"0714604143307", nombre:"Lady Balance (60 capsulas)"},
  {barcode:"0714604143345", nombre:"Levadura de Selenio (60 capsulas)"},
  {barcode:"0714604213475", nombre:"L-glicina - Formacion De Proteinas Y Colageno (60 Capsulas)"},
  {barcode:"0714604143352", nombre:"L-Glutamina (90 capsulas)"},
  {barcode:"0714604143369", nombre:"L-Lisina 500 mg (60 capsulas)"},
  {barcode:"0714604213642", nombre:"L-teanina Labs Nutrition - Estrés, Insomnio (60 Capsulas)"},
  {barcode:"0714604213253", nombre:"Maca Peruana Pura 500 mg - Estimulante, Energizante (60 capsulas)"},
  {barcode:"0714604143383", nombre:"Magnesio Quelatado 400 mg (60 capsulas)"},
  {barcode:"0714604213604", nombre:"Maitake Hongo Labs Nutrition, Estrés, Inmunológico (60 Caps)"},
  {barcode:"0714604213383", nombre:"Malato de magnesio (60 comprimidos)"},
  {barcode:"0714604213277", nombre:"Malato de Magnesio 500mg - Energia, recuperador muscular (60 capsulas)"},
  {barcode:"0714604143390", nombre:"Mega D - Hongo Candida (60 Capsulas) EX MEGA DETOX - MISMA FORMULA"},
  {barcode:"0714604213260", nombre:"Melena de Leon pura 500 mg - Neuronal, digestivo (60 capsulas)"},
  {barcode:"0714604213536", nombre:"Moringa Labs Nutrition - Calcio, Antioxidante (60 Capsulas)"},
  {barcode:"0714604143413", nombre:"MSM - Metil Sulfonil Metano 500 mg (60 capsulas)"},
  {barcode:"0714604143420", nombre:"Mucline - Intestino Permeable, Optimizador Mucosas (60 Caps) EX MUCOSUL - MISMA FORMULA"},
  {barcode:"0714604143758", nombre:"Multi Magnesio 500 mg - 5 Magnesio en 1 (60 capsulas)"},
  {barcode:"0714604213451", nombre:"Multi Magnesio 500 mg - 5 Magnesio en 1 (60 comprimidos)"},
  {barcode:"0714604143437", nombre:"NAC 500 mg (N-Acetilcisteína) - Optimizador respiratorio (60 cápsulas)"},
  {barcode:"0714604143444", nombre:"NAD - Nicotinamida Adenina Dinucleótido (60 capsulas)"},
  {barcode:"0714604213499", nombre:"NAD - Nicotinamida Adenina Dinucleótido (60 comprimidos)"},
  {barcode:"NO CORRESPONDE", nombre:"Nad + Resveratrol - Kit Anti age (120 capsulas)"},
  {barcode:"0714604213314", nombre:"Nad con Resveratrol 2 en 1 - Regenerador Celular (60 capsulas)"},
  {barcode:"0714604143833", nombre:"Nmn - Nicotinamida Mononucleótido (60 Capsulas)"},
  {barcode:"0714604213505", nombre:"Nmn - Nicotinamida Mononucleótido (60 Comprimidos)"},
  {barcode:"0714604213826", nombre:"NMN con Resveratrol (60 capsulas)"},
  {barcode:"0714604143468", nombre:"Omega 3 (60 capsulas)"},
  {barcode:"0714604143482", nombre:"ORMUX - Suplemento Regenerador Celular (60 caps)"},
  {barcode:"0714604143512", nombre:"Oxido Nitrico - Vaso dilatador (60 capsulas)"},
  {barcode:"0714604143826", nombre:"Picolinato de Cromo 250 mcg - Control Peso, Glucemico"},
  {barcode:"0714604213246", nombre:"Potasio + Magnesio 500 mg - (60 capsulas)"},
  {barcode:"0714604213598", nombre:"Reishi Hongo Labs Nutrition - Estrés, Fatiga (60 Capsulas)"},
  {barcode:"0714604143536", nombre:"Resveratrol - Rejuvenecedor celular antioxidante (60 capsulas)"},
  {barcode:"0714604213369", nombre:"Resveratrol Labs Nutrition, Antioxidante (60 Comprimidos)"},
  {barcode:"0714604143741", nombre:"Sinefrina - Quemador de Grasas Natural (60 capsulas)"},
  {barcode:"0714604213352", nombre:"Sinefrina - Quemador de Grasas Natural (60 comprimidos)"},
  {barcode:"0714604213284", nombre:"Spirulina Pura 500 mg - Perdida de peso, Antioxidante (60 capsulas)"},
  {barcode:"0714604143550", nombre:"Taurato de Magnesio 500 mg (60 capsulas)"},
  {barcode:"0714604213543", nombre:"Taurato De Magnesio Labs Nutrition (60 Comprimidos)"},
  {barcode:"0714604213741", nombre:"Testo Up - Precursor De Testosterona, Estimulante (60 Comp)"},
  {barcode:"0714604143567", nombre:"Testo Up (60 capsulas)"},
  {barcode:"0714604213635", nombre:"Tirosina + Yodo (60 capsulas)"},
  {barcode:"0714604213376", nombre:"Treonato de Magnesio (60 comprimidos)"},
  {barcode:"0714604143581", nombre:"Treonato de Magnesio 500 mg (60 capsulas)"},
  {barcode:"0714604213437", nombre:"Triptofano - Insomnio, calma y relajacion (60 capsulas)"},
  {barcode:"0714604143819", nombre:"Vitamina A - Retinol 1000mcg (30 capsulas)"},
  {barcode:"0714604143604", nombre:"Vitamina B12 - Equilibrio Sanguíneo Y Neuronal (60 capsulas)"},
  {barcode:"0714604143611", nombre:"Vitamina C - Acido Ascórbico 500 mg (60 caps)"},
  {barcode:"0714604213758", nombre:"Vitamina C - Acido Ascórbico 500 Mg (60 Comprimidos)"},
  {barcode:"0714604143659", nombre:"Vitamina D3 + K2 - Regenerador Oseo (60 Capsulas)"},
  {barcode:"0714604213512", nombre:"Vitamina D3 + K2 - Regenerador Oseo (60 Comprimidos)"},
  {barcode:"0714604143642", nombre:"Vitamina D3 20mcg - Huesos, Músculos, Nervios (30 Capsulas)"},
  {barcode:"0714604213666", nombre:"Whey protein + Creatina Americana (1 kg)"},
  {barcode:"0714604143680", nombre:"Whey protein + Creatina Chocolate (1 kg)"},
  {barcode:"0714604213659", nombre:"Whey protein + Creatina Frambuesa (1 kg)"},
  {barcode:"0714604213680", nombre:"Whey protein + Gutamina y Bcaa (1 kg) Americana"},
  {barcode:"0714604143697", nombre:"Whey protein + Gutamina y Bcaa (1 kg) Chocolate"},
  {barcode:"0714604213673", nombre:"Whey protein + Gutamina y Bcaa (1 kg) Frambuesa"},
  {barcode:"0714604213703", nombre:"Whey protein + Testo (1 kg) Americana"},
  {barcode:"0714604213529", nombre:"Whey protein + Testo (1 kg) Chocolate"},
  {barcode:"0714604213697", nombre:"Whey protein + Testo (1 kg) Frambuesa"},
  {barcode:"0714604213734", nombre:"Whey Protein 80% Americana (1 kg)"},
  {barcode:"0714604213710", nombre:"Whey Protein 80% Chocolate (1 kg)"},
  {barcode:"0714604213727", nombre:"Whey Protein 80% Frambuesa (1 kg)"},
  {barcode:"0714604143727", nombre:"ZMA Zinc-Magnesio-Vitamina B6 (60 capsulas)"},
];
/* Impresora de etiquetas: ajustá al tamaño del rollo (en mm) que uses */
const LABEL_MM = { w:100, h:150 };  // 10x15 cm (estándar e-commerce). Ej. más chico: {w:100,h:100}
const LOGISTICA = "Fullminet";      // Tu empresa de logística (va como marca de la etiqueta)
const LABEL_QR = true;              // QR de seguimiento (necesita internet al imprimir; el código de barras NO)
/* El link de reseñas de Google ahora se configura por empresa (ver EMPRESAS más abajo).
   Solo se le pide reseña al cliente si la empresa de ese pedido tiene 'review' cargado. */
/* Costo fijo de envío por canal (editá estos valores cuando cambien) */
/* EMPRESAS que despachás (editá nombres y tarifas). canal: 'ml_flex' o 'tiendanube' */
/* EMPRESAS dueñas de los pedidos (cada una puede vender por cualquier canal) */
const EMPRESAS = [
  // review: link de reseñas de Google. Solo se le pide reseña al cliente si la empresa lo tiene cargado.
  { id:"labs",      nombre:"Labs Nutrition", canalDefault:"tiendanube",
    review:"https://search.google.com/local/writereview?placeid=ChIJ7busWp5vzZURXziOZFmcOhI" },
  { id:"nutrivibe", nombre:"Nutrivibe",      canalDefault:"ml_flex", review:"" },
  { id:"sc",        nombre:"SC.CANDLE",      canalDefault:"tiendanube", review:"", fragil:true },   // velas: siempre FRÁGIL
  { id:"suplemundo", nombre:"Suplemundo",     canalDefault:"ml_flex", review:"" },
];
/* CANALES de venta (independientes de la empresa). costo = tarifa fija de envío */
const CANALES = [
  { id:"tiendanube", nombre:"Nube", costo:9000 },
  { id:"ml_flex",    nombre:"Flex", costo:7500 },
];
/* Detección automática de marca en etiquetas de Mercado Libre Flex:
   cada marca vende desde su propia cuenta de ML, y esa cuenta se identifica arriba de
   todo en la etiqueta con un "#" seguido del ID de vendedor (ej "NutriVibe NutriVibe #3177810946").
   Solo hace falta cargar acá las marcas que efectivamente venden por Flex.
   Si aparece un ID que no está en esta lista, el sistema no adivina: te deja elegir vos como hasta ahora. */
const VENDEDOR_ML = {
  "3660784748": "suplemundo",
  "3177810946": "nutrivibe",
};
function empresaPorVendedorML(texto){
  const hs=[...String(texto||"").matchAll(/#\s?(\d{6,})/g)];
  if(!hs.length) return null;
  return VENDEDOR_ML[hs[hs.length-1][1]] || null;   // el último "#..." dentro del texto/tramo, el más cercano a este pedido
}
const empresaObj = id => EMPRESAS.find(e=>e.id===id) || EMPRESAS[0];
/* Nombre para mostrar: si la marca está vacía o no se reconoce, NO asume Labs */
const nombreEmp = id => { const e=EMPRESAS.find(x=>x.id===id); return e?e.nombre:"Sin marca"; };
const canalObj   = id => CANALES.find(c=>c.id===id) || CANALES[0];
const canalDe    = p => (p&&p.canal) || empresaObj(p&&p.empresa).canalDefault;
/* Formato de la etiqueta/pedido, para mostrar en el checklist además de Cadete/Correo */
/* Pedido pendiente SIN etiqueta (de ML, o por correo sin el PDF del correo): queda aparte ("pasa para mañana"), fuera de las listas de cadete/correo y de preparar.
   Se lo vuelve a incluir si se lo saca de "mañana" a mano (pasaManana===false) o apenas aparece la etiqueta. */
const esParaManana = p => !!p && p.pasaManana!==false && p.estado==="pendiente" && (canalDe(p)==="ml_flex" || p.metodo==="correo") && !p.etiquetaPdf;
const formatoEnvio = p => (p&&p.pickit) ? "Pickit" : (canalDe(p)==="ml_flex" ? "Flex" : "Nube");
/* Marcas que SIEMPRE salen de Bs As y por lo tanto SIEMPRE descuentan stock
   (no se eligen pedido por pedido, como sí pasa con Labs del interior). */
function saleSiempreBsAs(empresa){ return empresa==="nutrivibe" || empresa==="suplemundo"; }
/* Descuento de 500 en lo que se le paga al cadete (Cardinal) desde el lunes 28/9/2026. NO se descuenta del precio que se cobra a la marca. */
const DESC_CADETE = 500, DESC_CADETE_DESDE = new Date(2026,8,28).getTime();
const descCad = p => ((p&&p.creado)||0)>=DESC_CADETE_DESDE ? DESC_CADETE : 0;
const esCatCadete = c => ["caba","1","2","3"].includes(c);
const costoCard = (p,c,zc) => { const b=(zc||zonaCosto())[c]||0; return b?Math.max(0,b-descCad(p)):0; };   // lo que se le paga al cadete por ese pedido
const costoEnvio = p => Math.max(0, precioCat(catPedido(p)));   // lo que se le cobra a la marca: precio por zona completo (el descuento de 500 es solo del costo del cadete, no del precio)
const STOCK_DUENO = "labs";   // Labs pone el stock compartido; las demás empresas le pagan lo que sacan
/* Zonas de reparto reales (precio editable). Buenos Aires → cadete por zona; otra provincia → correo */
let ZONAS = {
  1:{precio:6000, locs:["avellaneda","lanus","lanús","lomas de zamora","la matanza norte","moron","morón","hurlingham","ituzaingo","ituzaingó","san fernando","san isidro","san martin","san martín","tres de febrero","vicente lopez","vicente lópez"]},
  2:{precio:7500, locs:["tristan suarez","tristán suárez","berazategui","quilmes","esteban echeverria","esteban echeverría","ezeiza","benavidez","la matanza sur","jose c paz","josé c paz","josé c. paz","merlo","florencio varela","moreno","san miguel","tigre","malvinas argentinas","pacheco","grand bourg","tortuguitas","don torcuato","bella vista","laferrere"]},
  3:{precio:8500, locs:["nordelta","del viso","garin","garín","derqui","villa rosa","pilar","lujan","luján","escobar","maschwitz","rodriguez","rodríguez","campana","guernica","la plata","ensenada","berisso","san vicente","canuelas","cañuelas","marcos paz"]},
};
/* CP → zona (código postal de 4 dígitos). Es lo más confiable: Tienda Nube a veces escribe mal la localidad, pero el CP no miente.
   CABA = rango 1000–1499 (se resuelve aparte). Si un CP no está acá, cae al nombre como respaldo. */
let CP_ZONA = {
  // ZONA 1
  "1602":1,"1603":1,"1605":1,"1607":1,"1609":1,"1636":1,"1637":1,"1638":1,"1640":1,"1641":1,"1642":1,"1643":1,"1644":1,"1646":1,"1647":1,"1650":1,"1651":1,"1653":1,"1655":1,"1657":1,"1674":1,"1676":1,"1678":1,"1682":1,"1684":1,"1686":1,"1688":1,"1702":1,"1704":1,"1706":1,"1708":1,"1712":1,"1714":1,"1752":1,"1753":1,"1754":1,"1766":1,"1770":1,"1773":1,"1822":1,"1824":1,"1825":1,"1826":1,"1827":1,"1828":1,"1829":1,"1831":1,"1832":1,"1833":1,"1834":1,"1836":1,"1868":1,"1869":1,"1870":1,"1871":1,"1872":1,"1873":1,"1874":1,"1875":1,
  // ZONA 2
  "1611":2,"1612":2,"1613":2,"1615":2,"1617":2,"1621":2,"1661":2,"1663":2,"1665":2,"1667":2,"1716":2,"1718":2,"1722":2,"1723":2,"1742":2,"1744":2,"1746":2,"1755":2,"1757":2,"1759":2,"1761":2,"1763":2,"1765":2,"1778":2,"1804":2,"1806":2,"1838":2,"1842":2,"1876":2,"1878":2,"1879":2,"1881":2,"1882":2,"1884":2,"1885":2,"1886":2,"1888":2,"1889":2,
  // ZONA 3
  "1619":3,"1623":3,"1625":3,"1627":3,"1629":3,"1631":3,"1635":3,"1669":3,"1670":3,"1727":3,"1748":3,"1814":3,"1816":3,"1862":3,"1865":3,"1894":3,"1896":3,"1897":3,"1900":3,"1901":3,"1903":3,"1923":3,"1925":3,"2800":3,"2804":3,"6700":3,"6708":3
};
function zonaCosto(){ const st=stockState(); const d={caba:4000,1:ZONAS[1].precio,2:ZONAS[2].precio,3:ZONAS[3].precio};
  return Object.assign(d,(st&&st.zonas)||{}); }   // lo que te cobra Flex (el cadete) por CABA/Zona
function margenReparto(){ const st=stockState(); return (st&&st.margen!=null)?st.margen:5000; }   // tu ganancia por envío de cadete
function correoGestion(){ const st=stockState(); return (st&&st.correoGestion!=null)?st.correoGestion:2500; }  // solo gestión (etiqueta ya paga)
function pickitPrecio(){ const st=stockState(); return (st&&st.pickitPrecio!=null)?st.pickitPrecio:2500; }  // Pickit: precio fijo por envío
function precioCat(cat){ const c=zonaCosto();     // lo que le cobrás a la marca
  if(cat==="pickit") return pickitPrecio();
  if(cat==="correo") return correoGestion();
  if(["caba","1","2","3"].includes(cat)) return (c[cat]||0)+margenReparto();
  return 0; }
function llegaCadete(p){ const an=anilloDe(p); return [0,1,2,3].includes(an.n); }   // CABA o Zona 1/2/3 (null/9 => correo)
function anilloDe(p){
  if(p && p.zonaFija!=null && p.zonaFija!==""){ const n=+p.zonaFija;
    const lbl=n===0?"CABA":n===9?"BA sin cadete → correo":n===null?"Correo":"Zona "+n;
    return {n, label:lbl, fija:true}; }
  const prov=(p.provincia||"").toLowerCase();
  const txt=((p.ciudad||"")+" "+(p.dir||"")).toLowerCase();
  const cp=String(p.cp||"").replace(/\D/g,"").slice(0,4);   // código postal, 4 dígitos
  // 1) CABA: por nombre de provincia o por CP (rango 1000–1499)
  if(/\bcaba\b|capital|c\.a\.b\.a|autónoma|autonoma/.test(prov)) return {n:0,label:"CABA"};
  if(cp && +cp>=1000 && +cp<=1499) return {n:0,label:"CABA"};
  // 2) Zona por CP (lo más confiable: no depende de cómo escribieron la localidad)
  if(cp && CP_ZONA[cp]!=null){ const z=CP_ZONA[cp]; return {n:z,label:"Zona "+z}; }
  // 3) Otra provincia (sin CP de zona) => correo
  if(!/buenos aires/.test(prov)) return {n:null,label:"Correo"};
  // 4) Respaldo: por nombre de localidad
  for(const z of [1,2,3]){ if(ZONAS[z].locs.some(nn=>txt.includes(nn))) return {n:z,label:"Zona "+z}; }
  return {n:9,label:"BA sin cadete → correo"};    // Buenos Aires donde no llega el cadete => correo
}
function anilloColor(n){ return n===0?"#8a44ad":n===1?"#1d9e75":n===2?"#0a84ff":n===3?"#e6a100":n===9?"#e5484d":"#8a8a8e"; }
/* Kits: "Nmn + Resveratrol Pack X2" → escanear 2 productos (Nmn y Resveratrol) */
/* ---- DICCIONARIO DE PACKS: un SKU o nombre de ML → qué productos y cuántos descuenta ----
   Ejemplo: SKU "0714604143512" (Pack X 3 Óxido Nítrico) → [{prod:"Oxido Nitrico...", cant:3}]
   Se aprende una vez al importar y queda guardado en la nube. */
function packsRecord(){ return PEDIDOS.find(p=>p.tipo==="packs"); }
function packsMap(){ const r=packsRecord(); return (r&&r.map)||{}; }
function packKey(sku,nombre){ return (sku && String(sku).trim()) ? ("sku:"+String(sku).trim().toUpperCase()) : ("nom:"+String(nombre||"").trim().toLowerCase()); }
function packDef(sku,nombre){
  const m=packsMap();
  if(sku && m["sku:"+String(sku).trim().toUpperCase()]) return m["sku:"+String(sku).trim().toUpperCase()];
  if(nombre && m["nom:"+String(nombre).trim().toLowerCase()]) return m["nom:"+String(nombre).trim().toLowerCase()];
  return null;
}
async function aprenderPack(sku,nombre,comps){
  // comps = [{prod:"nombre catálogo", cant:3}, ...]
  if(!comps || !comps.length) return;
  const r=packsRecord(); const map=Object.assign({},(r&&r.map)||{});
  map[packKey(sku,nombre)]={sku:sku||"", nombre:nombre||"", comps};
  if(r) await DB.update(r.id,{map}); else await DB.create({tipo:"packs",map});
}
async function olvidarPack(key){
  const r=packsRecord(); if(!r) return; const map=Object.assign({},r.map||{}); delete map[key];
  await DB.update(r.id,{map});
}
/* ¿este item (nombre + sku opcional) es un pack conocido? devuelve sus componentes o null */
function packComponentes(nombre,sku){
  const def=packDef(sku,nombre);
  return def ? def.comps.map(c=>({nombre:c.prod, cant:c.cant})) : null;
}
/* heurística: ¿parece un pack aunque no lo conozcamos? (para preguntarte) */
function pareceePack(nombre){ return /\bpack\b|\bcombo\b|\bkit\b|\bx\s?\d\b|\b\d\s?unidades?\b|\+/i.test(nombre||""); }

/* KITS ESPECIALES: composición manual (cuando el nombre no alcanza). Agregá acá los kits nuevos. */
const KITS_DEF=[
  {match:/soporte\s+integral|kit\s+integral/i, comps:[{n:"Multi Magnesio 500 mg - 5 Magnesio en 1 (60 capsulas)", c:3}]},   // Soporte Integral | Multimagnesio x 3 = 3 Multi Magnesio
  {match:/kit\s+hongo\s+candida|candida.*180/i, comps:[
    {n:"Mega D - Hongo Candida (60 Capsulas) EX MEGA DETOX - MISMA FORMULA", c:1},
    {n:"Bio F - Hongo Candida (60 Capsulas) EX BIO FLORATIN - MISMA FORMULA", c:1},
    {n:"Clean F - Hongo Candida (60 Capsulas) EX FUNGI CLEAN - MISMA FORMULA", c:1}]},   // Kit Candida = Mega D + Bio F + Clean F
];
function kitEspecial(nombre){ return KITS_DEF.find(k=>k.match.test(nombre||"")); }
function esKit(nombre){ return !!kitEspecial(nombre) || /\bpack\b|\bcombo\b|\bkit\b|\bx\d\b|\+/i.test(nombre||""); }
function componentesKit(nombre){
  let base=(nombre||"").replace(/\(.*?\)/g," ").replace(/pack.*$/i," ").replace(/\bx\d+\b/ig," ").trim();
  return base.split("+").map(s=>s.trim()).filter(s=>s.length>2);
}
/* ¿este nombre es un kit del catálogo? (los kits van cargados con barcode "NO CORRESPONDE") */
function esKitCatalogo(nombre){
  const pr=PRODUCTOS.find(p=>p.nombre===nombre);
  return !!(pr && String(pr.barcode||"").toUpperCase().includes("NO CORRESPONDE"));
}
/* ¿este ítem es un kit que TODAVÍA no aprendí qué descuenta? (para pedir que me lo enseñen al preparar) */
function kitPorAprender(nombre,sku){
  if(!nombre) return false;
  if(packComponentes(nombre,sku)) return false;     // ya lo aprendiste una vez
  if(kitEspecial(nombre)) return false;             // ya está definido a mano (KITS_DEF)
  if(esKitCatalogo(nombre)) return true;            // kit del catálogo sin aprender
  return pareceePack(nombre) && !PRODUCTOS.some(p=>p.nombre===nombre);   // parece pack y no es un producto real del catálogo
}
/* lista de kits sin aprender de UN pedido (revisa tanto los productos elegidos como el texto de la etiqueta) */
function kitsSinAprender(p){
  const out=[], seen={};
  const add=(nombre,sku)=>{ if(nombre && kitPorAprender(nombre,sku) && !seen[nombre]){ seen[nombre]=1; out.push({nombre, sku:sku||""}); } };
  if(p && p.prods && p.prods.length){ p.prods.filter(x=>x&&x.nombre&&x.cant>0).forEach(x=>add(x.nombre, x.sku)); }
  else if(p){ parseItems(p.items||"").forEach(it=>add(it.nombre,"")); }
  return out;
}
const MIN_DEFAULT=5;   // cuánto pedir cuando un producto que manejás baja del mínimo
function minDe(n,st){ st=st||stockState(); return (st&&st.min&&st.min[n]!=null)?st.min[n]:MIN_DEFAULT; }
function tieneMov(n,st){ st=st||stockState(); return (st.movs||[]).some(m=>m.prod===n); }
function pedirDe(n,st){ if(!tieneMov(n,st)) return 0; const mn=minDe(n,st),stk=nivel(n,st); return (mn>0 && stk<mn)?(mn-stk):0; }   // lo que falta para llegar al mínimo
const fmtAr = n => "$"+Number(n||0).toLocaleString("es-AR");
/* Geo para la hoja de ruta: salida desde Puerto Madero + centro de cada barrio CABA */
const ORIGEN_CABA={nombre:"Puerto Madero, CABA",lat:-34.6118,lon:-58.3625};
const BARRIO_COORDS={
  "palermo":[-34.5780,-58.4250],"belgrano":[-34.5620,-58.4560],"caballito":[-34.6190,-58.4400],
  "san nicolás":[-34.6045,-58.3790],"centro":[-34.6045,-58.3790],"recoleta":[-34.5880,-58.3960],
  "núñez":[-34.5460,-58.4620],"nunez":[-34.5460,-58.4620],"villa crespo":[-34.5990,-58.4380],
  "almagro":[-34.6100,-58.4200],"flores":[-34.6280,-58.4640],"villa urquiza":[-34.5730,-58.4900],
  "colegiales":[-34.5740,-58.4500],"barracas":[-34.6470,-58.3820]
};
function coordsDe(p){ const k=(p.ciudad||"").toLowerCase().trim();
  for(const b in BARRIO_COORDS){ if(k.includes(b)) return BARRIO_COORDS[b]; }
  return [-34.6037,-58.3816]; }
function distKm(a,b){ const R=6371,p=Math.PI/180;
  const x=Math.sin((b[0]-a[0])*p/2)**2+Math.cos(a[0]*p)*Math.cos(b[0]*p)*Math.sin((b[1]-a[1])*p/2)**2;
  return 2*R*Math.asin(Math.sqrt(x))*1.3; }                 // x1.3 ≈ distancia por calle
function rutaOptima(stops){                                 // vecino más cercano desde Puerto Madero
  const out=[]; let cur=[ORIGEN_CABA.lat,ORIGEN_CABA.lon]; const rest=stops.slice();
  while(rest.length){ let bi=0,bd=1e9;
    rest.forEach((s,i)=>{ const d=distKm(cur,coordsDe(s)); if(d<bd){bd=d;bi=i;} });
    const s=rest.splice(bi,1)[0]; s._km=Math.round(bd*10)/10; out.push(s); cur=coordsDe(s); }
  return out; }
/* --- Preparación / picking --- */
let PICK={};   // progreso de escaneo de la sesión: {nombreProducto: cantidadEscaneada}
/* "Pack X 3 - Malato De Magnesio" / "Pack x2 Omega 3" / "Combo 3 unidades" → {n:3, nombre:"Malato De Magnesio"} */
function packDeNombre(nombre){
  const s=String(nombre||"");
  const m=s.match(/\bpack\s*(?:x|por|de)?\s*(\d{1,2})\b\s*(?:unidades|u\.?|frascos)?\s*[-–:]?\s*/i)
       || s.match(/\b(\d{1,2})\s*(?:unidades|frascos)\b\s*[-–:]?\s*/i);
  const n=m?parseInt(m[1],10):1;
  if(!m || !(n>1 && n<=24)) return {n:1, nombre:s};
  return {n, nombre:(s.slice(0,m.index)+" "+s.slice(m.index+m[0].length)).replace(/\s+/g," ").trim()};
}
function parseItems(t){ return (t||"").split(/·|,|\n|;/).map(s=>s.trim()).filter(Boolean).map(s=>{
  const m=s.match(/^(\d+)\s*[xX]\s*(.+)$/); return m?{cant:+m[1],nombre:m[2].replace(/^[\s.\-:·]+/,"").trim()}:{cant:1,nombre:s}; }).filter(x=>x.nombre); }
/* Del texto de referencia ("2x . Testo UP - Precursor…") arma la lista de productos del catálogo para descontar.
   ok: los que reconoció · dudosos: los que no encontró en el catálogo */
function prodsDesdeTexto(t){
  const ok=[], dudosos=[];
  const base=s=>baseProducto(s).replace(/\b(pura?|natural|suplemento|dietario|labs|nutrition)\b/g," ").replace(/\s+/g," ").trim();
  const compacto=s=>base(s).replace(/ /g,"");
  const buscar=nombre=>{
    const ci=compacto(nombre); if(ci.length<4) return null;
    const pal=base(nombre).split(" ").filter(w=>w.length>=4);
    // 1) el nombre compacto del producto arranca igual (ej "multimag nesio" → "multimagnesio…")
    const pref=ci.slice(0,Math.min(10,ci.length));
    let cand=PRODUCTOS.filter(p=>compacto(p.nombre).startsWith(pref) || compacto(p.nombre).startsWith(ci.slice(0,6)));
    if(cand.length===1) return cand[0];
    // 2) el mejor por puntaje, pero solo si comparte una palabra real (no "capsulas", "60", etc.)
    const m=mejorProducto(nombre);
    if(m && pal.some(w=>compacto(m.nombre).includes(w))) return m;
    if(cand.length>1) return cand.sort((a,b)=>compacto(a.nombre).length-compacto(b.nombre).length)[0];
    return null;
  };
  parseItems(t).forEach(it=>{
    const pk=packDef("", it.nombre);
    if(pk && pk.comps && pk.comps.length){ ok.push({nombre:it.nombre, cant:it.cant}); return; }   // pack ya enseñado: itemsPedido lo abre
    const pn=packDeNombre(it.nombre);
    const prod=buscar(pn.nombre);
    if(prod){ const ya=ok.find(x=>x.nombre===prod.nombre); if(ya) ya.cant+=it.cant*pn.n; else ok.push({nombre:prod.nombre, cant:it.cant*pn.n}); }
    else dudosos.push(it.cant+"x "+it.nombre);
  });
  return {ok, dudosos};
}
function pickingConsolidado(){
  const map={};
  PEDIDOS.filter(p=>(!p.tipo||p.tipo==="pedido")&&p.estado==="pendiente").forEach(p=>{
    try{ itemsPedido(p).forEach(it=>{ const nombre=it.prodNombre||it.nombre; const k=nombre.toLowerCase();
      if(!map[k]) map[k]={nombre, cant:0}; map[k].cant+=(it.cant||0); }); }catch(e){ logErr("auto",e); }   // itemsPedido abre los kits
  });
  return Object.values(map).sort((a,b)=>b.cant-a.cant);
}
function prodPorBarcode(code){
  let c=String(code||"").replace(/\D/g,"");      // solo dígitos (saca espacios, enters, prefijos de lector)
  if(!c) return null;
  // 1) códigos de frasco que aprendimos (el código físico real, distinto al SKU de ML)
  const bm=barcodeMap()[c] || barcodeMap()[c.replace(/^0+/,"")];
  if(bm){ const pr=PRODUCTOS.find(p=>p.nombre===bm); if(pr) return pr; }
  const norm=s=>String(s||"").replace(/\D/g,"").replace(/^0+/,"");
  const nc=norm(c);
  return PRODUCTOS.find(p=>p.barcode===c)
      || PRODUCTOS.find(p=>p.barcode && norm(p.barcode)===nc)
      || PRODUCTOS.find(p=>{ const nb=norm(p.barcode); return nb.length>=11 && nc.length>=11 && (nb.endsWith(nc)||nc.endsWith(nb)); })
      || null; }
/* Códigos de frasco aprendidos: código físico real → nombre del producto (se guarda en la nube) */
function barcodeRecord(){ return PEDIDOS.find(p=>p.tipo==="barcodes"); }
function barcodeMap(){ const r=barcodeRecord(); return (r&&r.map)||{}; }
async function aprenderBarcode(code, nombreProd){
  const c=String(code||"").replace(/\D/g,""); if(!c||!nombreProd) return;
  const r=barcodeRecord(); const map=Object.assign({},(r&&r.map)||{}); map[c]=nombreProd;
  if(r) await DB.update(r.id,{map}); else await DB.create({tipo:"barcodes",map});
}
/* Nombre "base" de un producto: sin presentación (caps/comprimidos), sin tildes — para emparejar variantes */
function baseProducto(n){
  return String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\(.*?\)/g," ").replace(/\b(capsulas?|caps|comprimidos?|comp|x\s*\d+|\d+\s*(mg|mcg|gr|g|ml))\b/g," ")
    .replace(/[^a-z0-9ñ ]/g," ").replace(/\s+/g," ").trim();
}
function matchNombre(a,b){ const T=s=>(s||"").toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g," ").split(/\s+/).filter(w=>w.length>=3);
  const A=T(a),B=T(b); return A.some(w=>B.includes(w)); }
/* Elige el producto del catálogo que MEJOR coincide con el nombre de un item (para descontar del correcto).
   Prioriza coincidencia exacta y castiga los productos con palabras de más (kits/variantes). */
function mejorProducto(nombreItem){
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]/g," ").replace(/\s+/g," ").trim();
  const words=s=>norm(s).split(" ").filter(w=>w.length>=3);
  const ni=norm(nombreItem), wi=words(nombreItem);
  if(!ni) return null;
  let best=null, bestScore=-1e9;
  for(const p of PRODUCTOS){
    const np=norm(p.nombre);
    if(np===ni) return p;                                   // coincidencia exacta
    const wp=words(p.nombre); let shared=0;
    wp.forEach(w=>{ if(wi.includes(w)) shared++; });
    if(!shared) continue;
    const cov=shared/Math.max(1,wi.length);                 // qué parte del nombre buscado está en el producto
    let score=cov*10 + shared*2 - (wp.length-shared)*0.3;   // premia cobertura y coincidencia; castiga suave las de más
    if(wp[0] && wp[0]===wi[0]) score+=5;                     // el producto empieza con la misma palabra
    if(/\bcon\b|\+|pack|combo|\bkit\b/.test(np)) score-=4;   // castiga combos cuando buscás un producto simple
    if(score>bestScore){ bestScore=score; best=p; }
  }
  return (best && bestScore>=3) ? best : null;               // umbral para no matchear cualquier cosa
}
const PROVINCIAS = ["CABA","Buenos Aires","Catamarca","Chaco","Chubut","Córdoba","Corrientes",
  "Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro",
  "Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"];

/* =========================================================================
   2) ESTADOS
   Hay DOS recorridos según el método de entrega:
   · Cadete (AMBA / ML Flex):  pendiente → preparado → asignado → en_reparto → entregado → confirmado
   · Correo (interior):        pendiente → preparado → despachado → en_camino → entregado → confirmado
   El "tránsito largo" Río Tercero→Bs As se maneja aparte, como Reabastecimiento.
   ========================================================================= */
