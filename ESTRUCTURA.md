# Cómo está armado el sistema

App de despacho de Fullminet. Es una web común (HTML + JavaScript), sin frameworks ni compilación:
se sube a GitHub y Vercel la publica sola en https://despachos-lilac.vercel.app

## Los archivos

```
index.html          La pantalla: estilos, textos fijos y la lista de archivos JS que carga
js/                 El programa, partido por tema (se cargan EN ORDEN, de arriba a abajo)
api/                Lo que corre en el servidor de Vercel (claves secretas, nunca en el navegador)
```

### js/ — qué hay en cada archivo

| Archivo | Qué contiene |
|---|---|
| `01-config.js` | Config de Firebase, empresas, catálogo de productos, zonas, precios, packs, códigos de barras |
| `02-estados.js` | Los estados por los que pasa un pedido, la sugerencia de ruta y el registro de errores |
| `03-datos.js` | La única puerta a la base: `DB.create / update / delete / get / subscribe` |
| `04-utiles.js` | Variables en memoria (`PEDIDOS`, `ROL`, …) y ayudas generales |
| `05-fotos.js` | Fotos de pedidos, lectura del QR de la etiqueta y la carpeta Ventas vigilada |
| `06-despacho.js` | Tablero **Control**, avisos a Telegram y la solapa **Despacho** |
| `07-stock.js` | Stock: niveles, movimientos, mínimos y cuánto sacó cada empresa |
| `08-caja.js` | Cuenta corriente, caja, cobros y cierres de período |
| `09-operacion.js` | Pantallas del día: zonas, cuenta, salidas, cobro, checkout, entregas |
| `10-ui.js` | Piezas de interfaz, el `render()` principal y a qué pantalla va cada rol |
| `11-vistas.js` | Vistas del admin: Hoy, Pedidos, Listados, exportaciones, kanban |
| `12-importar.js` | Importar pedidos: Tienda Nube, Mercado Libre, CSV y PDF |
| `13-catalogo.js` | Catálogo, cupones, mínimos y lectura de etiquetas de ML |
| `14-etiquetas.js` | Carga de stock e impresión de etiquetas (incluida la térmica 10×15) |
| `15-arranque.js` | La simulación de demostración y el arranque de la app |

Todos los archivos comparten el mismo ámbito: una función de `11-vistas.js` puede llamar a una de
`07-stock.js` sin importar nada. Por eso **el orden de carga en `index.html` importa**: si movés un
archivo de lugar, puede romperse.

### api/ — lo que corre en Vercel

| Archivo | Para qué |
|---|---|
| `tiendanube.js` | Trae pedidos de Tienda Nube y le avisa cuando se despachan |
| `tn-auth.js` | Conexión (OAuth) con Tienda Nube |
| `mercadolibre.js`, `ml-auth.js`, `ml-connect.js`, `ml-webhook.js` | Lo mismo para Mercado Libre |
| `telegram.js` | Manda fotos, textos y PDF al bot de Telegram |
| `telegram-webhook.js`, `telegram-sync.js`, `telegram-fotos.js`, `telegram-correcciones.js` | Respuestas y sincronización con el bot |

Las claves (tokens) **no van en el código**: se cargan en Vercel → Settings → Environment Variables.

## Dónde se guardan los datos (Firebase)

| Colección | Qué guarda |
|---|---|
| `pedidos` | Los pedidos y, además, documentos especiales marcados con `tipo`: `stock`, `packs`, `caja`, `cierres`, `barcodes`, `prodsExtra`, `ignorados` |
| `movs` | Los movimientos de stock, uno por documento (antes iban todos adentro de `stock` y eso lo hacía crecer sin límite) |
| `fotos` | Las fotos grandes de los pedidos (en el pedido queda solo una miniatura) |
| `usuarios` | Qué rol tiene cada cuenta que inicia sesión |

**Reglas que tienen que estar en Firestore** (si falta alguna, esa parte deja de guardar):

```
match /pedidos/{doc}  { allow read, write: if request.auth != null; }
match /movs/{doc}     { allow read, write: if request.auth != null; }
match /fotos/{doc}    { allow read, write: if request.auth != null; }
match /usuarios/{doc} { allow read:        if request.auth != null; }
```

La empleada entra por link (`?rol=despacho`) sin usuario propio: la app la hace entrar como
**anónima**, así que en Firebase → Authentication tiene que estar habilitado el acceso anónimo.

## Los roles

| Rol | Cómo entra | Qué ve |
|---|---|---|
| Admin | usuario y contraseña | todo |
| Operador / despacho | link `?rol=operador` o `?rol=despacho` | solo preparar y despachar |
| Cadete | link `?rol=cadete` | sus entregas del día |
| Cliente | link de seguimiento `?p=...` | el estado de su pedido |

## Para hacer un cambio

1. Buscá el archivo por el tema en la tabla de arriba.
2. Editá y guardá.
3. `git add -A && git commit -m "qué cambiaste" && git push`
4. Vercel publica solo en uno o dos minutos. En la app, recargar con Ctrl+F5.

Si algo falla, la app ahora **registra el error** y los graves los manda al bot de Telegram.
