# REGLAS DE ORO DE AUTOMATIZACIÓN — Arquitecto Virtual

> Documento de referencia obligatoria antes de cualquier tarea de scraping o automatización de navegación.
> **IDIOMA OBLIGATORIO**: Toda comunicación, documentación, comentarios y logs debe ser en **ESPAÑOL**.
> Última actualización: 2026-04-05 | Validado con A10020941, A10101921, A10180461, A10180471, A10209221, A10169301.

---

## ⛔ REGLA DE ORO — PIPELINE PRODUCTIVO BLINDADO (2026-04-05)

> ### 🔒 PROHIBIDO MODIFICAR LOS SIGUIENTES ARCHIVOS SIN AUTORIZACIÓN EXPLÍCITA DEL USUARIO:
>
> | Archivo | Función | Estado |
> |---------|---------|--------|
> | `lib/scraperMunicipal.js` | Scraping portal Municipalidad de Corrientes (Uso de Suelo) | **BLINDADO** |
> | `lib/scraperProvincial.js` | Scraping DGC Catastro Provincia (titular, manzana, lote, mensuras) | **BLINDADO** |
> | `watcher.js` | Orquestador del pipeline: cola → scraping → PDF → cosido | **BLINDADO** |
>
> ### ¿Por qué están blindados?
>
> El pipeline fue validado el **2026-04-05** y produce informes con:
> - ✅ Datos municipales: Distrito, Superficie, Frente, FOS, Altura Máxima
> - ✅ Datos provinciales: Titular/Propietario, Manzana, Número de Lote, Ubicación exacta
> - ✅ Descarga automática de mensuras (Protocolo 7 Pasos CDP)
> - ✅ Cosido (stitching) PDF de mensura al informe principal con `pdf-lib`
> - ✅ Informe final de 4+ páginas con todos los datos completos
>
> Adremas de referencia validadas en producción: **A10180471** (completo), **A10169301** (completo), **A10209221** (4 págs con mensura).
>
> ### Si algo parece roto, ANTES de modificar:
> 1. Leer el dump en `assets/debug/dump_provincia.txt` y `data/ultimo_scrapeo.json`
> 2. Verificar que el selector CSS del portal sigue siendo el mismo (los portales cambian)
> 3. Correr un test manual con `node -e "require('./lib/scraperProvincial').scrapeProvincial('ADREMA', './public/informes')"`
> 4. Solo modificar si se confirma un cambio en el portal externo, nunca por "refactoring"
>
> **CUALQUIER CAMBIO NO AUTORIZADO A ESTOS ARCHIVOS ES UNA VIOLACIÓN DE ESTA REGLA.**

---

## 0. Artefactos de Solo Lectura (Legado)

> **ORDEN DE RESTRICCIÓN TÉCNICA (BLINDAJE)**: 
> 1. **Municipalidad**: El módulo `scraperMunicipal.js` está **BLINDADO**. Prohibido modificar selectores o lógica.
> 2. **Catastro (Provincia)**: El módulo `scraperProvincial.js` (Protocolo Bunker) está **BLINDADO**. Prohibido modificarlo.
> 
> **MOTIVO**: Funciona "de 10". Cualquier cambio pone en riesgo la estabilidad lograda. Si se requiere una mejora, debe ser en archivos externos o wrappers, NUNCA tocando el núcleo de estos archivos.

---

## 1. Protocolo de 7 Pasos para Portales con Visores Internos (Modales)

Los portales gubernamentales como el de Catastro de Corrientes (DGC) **no abren pestañas nuevas**. Usan un visor modal interno. La única ruta válida de descarga es:

| Paso | Nombre | Acción | Selector / Detalle |
|------|--------|--------|--------------------|
| 1 | **APERTURA** | Click en el ícono de enlace externo más cercano al código de mensura | `span.opcion.fa-external-link` |
| 2 | **SINCRONIZACIÓN** | Esperar que el backdrop de carga aparezca y desaparezca | `div.loading-status-ui-backdrop` (visible → hidden) |
| 3 | **DISPARO** | Click en el botón de descarga dentro del modal del visor | `i.fa-download` |
| 4 | **CAPTURA** | Polling de la carpeta de salida hasta detectar un `.pdf` nuevo (ignorar `.crdownload`) | Timeout máximo: 30 segundos |
| 5 | **NORMALIZACIÓN** | Renombrar inmediatamente al formato con prefijo de identidad | `Mensura_${adrema}_${codigo}.pdf` |
| 6 | **CIERRE** | Destruir el modal para resetear el estado del DOM y la sesión del servidor | `span.fa-close` (fallback: tecla Escape) |
| 7 | **ENFRIAMIENTO** | Pausa obligatoria antes de la siguiente iteración | Mínimo 2 segundos |

### Reglas auxiliares del protocolo:

- **CDP obligatorio**: Antes del bucle de mensuras, forzar `Page.setDownloadBehavior` con la ruta de descarga absoluta.
- **Verificación post-descarga**: Confirmar que el archivo existe y pesa más de 1 KB antes de registrarlo como éxito.
- **Tolerancia a fallos**: Si una mensura falla, cerrar el modal (si quedó abierto), loguear el error, y continuar con la siguiente. Nunca abortar el bucle completo.

---

## 1.1 Extracción de Carátula Provincial (GeoSIT - DGC)

El portal GeoSIT de Catastro Corrientes estructura los datos en **3 capas independientes**. La información se sirve por **disparo de evento**: al ingresar la Adrema en el buscador y presionar `Enter`, el sistema despliega automáticamente los paneles. **NO buscar menús laterales ni expandir acordeones manualmente.** Solo esperar que el servidor pueble los datos.

### Capas del GeoSIT y campos objetivo:

| Capa | Campo del Informe | Método de Extracción | Ejemplo Real |
|------|-------------------|---------------------|--------------|
| **Unidades Tributarias** | PROPIETARIO | Texto después de `Titulares:` (cortar antes de `Dominios` si aparece) | `GRONDA, JOSE CAMILO` |
| **Parcelas** | UBICACIÓN | Línea completa de `Designación:` o mapeo individual: Calle + Nro + Manzana + Lote | `SAN LUIS 1170 - Mz: 0239 - Lote: 03` |
| **Parcelas** | SUPERFICIE | Valor numérico después de `Superficie:` en el card de Parcelas | `431.15 m2` |
| **Mensuras** | ESCENARIO A/B | Presencia de códigos `XXXXX-U` determina si hay planos para descargar | `18505-U, 26753-U` |

### Mapeo detallado de Titulares (Capa Unidades Tributarias):

1. Segmentar `bodyText` usando encabezado "Unidades Tributarias" como delimitador.
2. Dentro del segmento, buscar regex: `Titulares?\s*:\s*([^\n]+)`.
3. Si el resultado contiene "Dominios", cortar antes de esa palabra.
4. Filtro anti-distracción: rechazar si contiene "Mensura", "División" o "Estado".

### Regla de Captura (Reintento):

Si el texto extraído es "No detectado" o está vacío, esperar 2 segundos y reintentar (hasta 5 veces). El servidor de GeoSIT puede tardar en poblar el panel tras el evento de búsqueda.

### Prioridad de Identidad:

La información extraída de GeoSIT (Titular, Ubicación) tiene **prioridad absoluta** sobre cualquier placeholder. Es la que debe mandar en la carátula del informe (Página 1).

### Mapeo detallado de Parcelas (Capa Parcelas):

1. Segmentar `bodyText` usando encabezado "Parcelas" como delimitador.
2. Buscar primero `Designación:` completa (contiene todos los campos en una línea).
3. Post-procesar: extraer solo **Calle + Nro + Mz + Lote** (sin Departamento, Localidad ni Sección).
4. Formato de salida: `SAN LUIS 1170 - Mz: 0239 - Lote: 03` (usar `Mz:` en vez de `Manzana:`).
5. Si no existe Designación, mapear individualmente con el mismo formato reducido.
6. Los datos de Parcelas tienen prioridad absoluta sobre placeholders genéricos.

### Reglas de prioridad:

1. **Capa específica primero**: Siempre buscar el dato en su capa nativa antes de recurrir a búsqueda global.
2. **Filtro anti-distracción**: Nunca extraer datos de la capa Mensuras para campos de Titular o Ubicación.
3. **Segmentación por texto**: Dividir `bodyText` usando los encabezados "Unidades Tributarias", "Parcelas" y "Mensuras" como delimitadores de sección.
4. **Datos estructurados > placeholders**: Si se encuentran datos reales en las capas, tienen prioridad absoluta sobre cualquier valor genérico o placeholder.

---

## 2. Escenarios de Mensura

| Escenario | Condición | Acción |
|-----------|-----------|--------|
| **A (Multi-mensura)** | `data.hayMensuras === true` | Ejecutar el Protocolo de 7 Pasos para CADA código encontrado (regex: `\d{1,6}-[A-Z]`) |
| **B (Sin mensura)** | `data.hayMensuras === false` | Saltar la sección de descarga. El informe se genera solo con datos municipales |

---

## 3. Cosido Final (Stitching)

- Buscar todos los `Mensura_${adrema}_*.pdf` en la carpeta de salida.
- Ordenar alfabéticamente.
- Usar `pdf-lib` para copiar **todas las páginas** de cada mensura (no solo la primera).
- Anexar al final del PDF municipal.
- Nombre del archivo final: `Informe_Final_Adrema_${adrema}_FECHA.pdf`.

---

## 4. Gestión de Sesión y Tiempos de Espera

- **Perfil de Chrome aislado**: Usar `chrome_profile_provincia` para evitar conflictos de lock entre navegadores concurrentes.
- **Limpieza preventiva del SingletonLock**: Antes de lanzar `escrapearProvincia`, eliminar físicamente el archivo `data/chrome_profile_provincia/SingletonLock` con `fs.unlinkSync()`. Esto previene el error "browser is already running" causado por cierres abruptos o procesos zombie.
- **Login y modales bloqueantes**: Siempre verificar y cerrar el modal "Bienvenido" antes de operar.
- **Limpieza de capas (Cascada)**: Ejecutar la secuencia P1 (Aceptar) → P2 (Modal Bienvenido) antes de buscar datos.
- **Esperas post-navegación**: Mínimo 10 segundos después de click en resultado, 15 segundos para carga de grilla.
- **Liberación de recursos**: Esperar 5 segundos entre el cierre del navegador municipal y la apertura del provincial, seguido de limpieza del lock + 3 segundos adicionales de seguridad.
- **Doble limpieza del SingletonLock**: Se limpia tanto en el flujo principal (antes de llamar a `escrapearProvincia`) como dentro de la función misma (justo antes de `puppeteer.launch`), como segunda capa de defensa.

---

## 5. Mandato de Consulta

> **REGLA INVIOLABLE**: Antes de escribir, modificar o ejecutar cualquier función de scraping o automatización de navegación en este proyecto (o en cualquier proyecto futuro de Antigravity), se debe leer este archivo y aplicar las lecciones aquí documentadas.

Esto aplica a:
- Nuevos portales gubernamentales.
- Cambios en selectores CSS del portal existente.
- Implementación de nuevas funciones de descarga.
- Cualquier interacción con modales, visores o iframes embebidos.

---

## 6. Casos de Referencia

```
Adrema:     A10020941
Titular:    MARIA E. GRONDA DE CORVALAN
Ubicación:  SAN LUIS, Manzana 0239, Capital, Corrientes
Superficie: 200.84 m² | Frente: 7.4 m | Distrito: CN
Mensuras:   18505-U (439.6 KB), 26753-U (273.4 KB), 29864-U (653.0 KB)
Resultado:  Informe Final de 6 páginas (3 muni + 3 mensuras)
Estado:     ÉXITO TOTAL
```

```
Adrema:     A10101921
Titular:    GRONDA, JOSE CAMILO
Ubicación:  SAN LUIS 1170 - Mz: 0239 - Lote: 03
Superficie: 431.15 m² | Frente: 7.42 m | Distrito: CN
Mensuras:   2 planos
Estado:     VALIDADO (v4.1 - extracción con sub-items + formato reducido)
```
