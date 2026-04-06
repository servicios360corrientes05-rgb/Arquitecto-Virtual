'use strict';
/**
 * scraperProvincial.js
 * Motor de scraping para el portal DGC (Dirección General de Catastro) de Corrientes.
 * Extraído de watcher.js para eliminar duplicación y facilitar mantenimiento.
 *
 * Requiere puppeteer (no playwright) porque usa sesión CDP para forzar descargas de PDFs.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Realiza el scraping del portal DGC provincial para una adrema dada.
 * Descarga las mensuras disponibles al directorio outputPath.
 * @param {string} adrema - Código de partida, ej: "A10169791"
 * @param {string} outputPath - Carpeta de destino para los PDFs descargados
 * @returns {Promise<object>} { titular, ubicacion, superficieDGC, hayMensuras, mensuraDownloaded }
 */
async function scrapeProvincial(adrema, outputPath) {
    console.log(`🌍 Iniciando trámite provincial (DGC) para: ${adrema}`);

    const downloadPath = path.resolve(outputPath);
    const debugFolder = path.resolve('./assets/debug');
    if (!fs.existsSync(debugFolder)) fs.mkdirSync(debugFolder, { recursive: true });

    async function reportarError(contexto, error, page) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const screenPath = path.join(debugFolder, `error_${timestamp}.png`);
            await page.screenshot({ path: screenPath });

            const logPath = path.join(debugFolder, 'reporte_errores.json');
            const errorData = {
                timestamp,
                contexto,
                error: error.message || error,
                url: page.url(),
                screenshot: screenPath
            };

            let logs = [];
            if (fs.existsSync(logPath)) {
                try { logs = JSON.parse(fs.readFileSync(logPath)); } catch (e) { }
            }
            logs.push(errorData);
            fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
            console.log(`❌ [RESCUE] Error capturado en ${logPath}`);
        } catch (repErr) { console.error("Error reportando error:", repErr); }
    }

    // Detectar Chrome del sistema (preferido para sesiones persistentes)
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    let executablePath = null;
    for (const p of chromePaths) {
        try { if (fs.existsSync(p)) executablePath = p; } catch (e) { }
    }

    const launchOptions = {
        headless: false, // Visible para validación manual del DGC
        defaultViewport: null,
        args: ['--start-maximized']
    };

    if (executablePath) {
        console.log(`   > 🖥️ Usando Chrome Sistema: ${executablePath}`);
        launchOptions.executablePath = executablePath;
        launchOptions.userDataDir = path.resolve('./data/chrome_profile_provincia');
    } else {
        console.log("   > ⚠️ Chrome de sistema no detectado. Usando Chromium embebido.");
    }

    // Limpieza preventiva de SingletonLock antes de lanzar
    const singletonLockPathProv = path.resolve('./data/chrome_profile_provincia/SingletonLock');
    try {
        if (fs.existsSync(singletonLockPathProv)) {
            fs.unlinkSync(singletonLockPathProv);
            console.log("   > 🧹 SingletonLock eliminado preventivamente (pre-launch).");
        }
    } catch (lockErr) {
        console.log("   > ⚠️ No se pudo eliminar SingletonLock pre-launch: " + lockErr.message);
    }

    const browser = await puppeteer.launch(launchOptions);
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    // Sesión CDP persistente para forzar descargas
    let cdpClient = null;
    try {
        cdpClient = await page.target().createCDPSession();
        await cdpClient.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });
        console.log("   > 🛡️ CDP Session iniciada. Download path: " + downloadPath);
    } catch (e) { console.log("   > CDP Session Warning:", e.message); }

    let mensuraFilename = null;

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("   > Verificando estado de sesión DGC...");
        try {
            const loginVisible = await page.waitForSelector('#Login', { visible: true, timeout: 8000 })
                .then(() => true)
                .catch(() => false);

            if (loginVisible) {
                console.log("   > Sesión no activa. Realizando login...");
                const dgcUser = process.env.DGC_CATASTRO_USER;
                const dgcPass = process.env.DGC_CATASTRO_PASS;
                if (!dgcUser || !dgcPass) throw new Error('Credenciales DGC no configuradas. Definir DGC_CATASTRO_USER y DGC_CATASTRO_PASS en .env');
                await page.type('#Login', dgcUser);
                await page.click('#Password');
                await page.type('#Password', dgcPass);
                await page.click('#loginbtn');
                console.log("   > Login enviado. Esperando navegación...");
                await delay(5000);
            } else {
                console.log("   > ✅ Sesión activa detectada (perfil Chrome). Saltando login.");
            }
        } catch (e) { await reportarError('Login', e, page); throw e; }

        // Cierre de modal "Cambiar Contraseña" si aparece
        console.log("   > 🔐 Verificando modal de 'Cambio de Contraseña'...");
        try {
            await delay(2000);
            const passwordModal = await page.evaluateHandle(() => {
                const modals = Array.from(document.querySelectorAll('.modal, .popup, div[role="dialog"]'));
                return modals.find(m => {
                    const text = m.innerText.toLowerCase();
                    return (text.includes('contraseña') || text.includes('clave') || text.includes('password')) &&
                        m.style.display !== 'none' && m.style.visibility !== 'hidden';
                });
            });

            if (passwordModal && passwordModal.asElement()) {
                console.log("   > ⚠️ Detectado modal de Contraseña. Intentando cerrar...");
                const closed = await page.evaluate(el => {
                    const closeBtns = Array.from(el.querySelectorAll('button.close, [data-dismiss="modal"], .fa-close, .fa-times'));
                    const cancelBtns = Array.from(el.querySelectorAll('button, a')).filter(b =>
                        b.innerText.match(/cancelar|omitir|cerrar|luego/i)
                    );
                    const target = closeBtns[0] || cancelBtns[0];
                    if (target) { target.click(); return true; }
                    return false;
                }, passwordModal);

                if (closed) {
                    console.log("   > ✅ Modal de contraseña cerrado exitosamente.");
                    await delay(1000);
                } else {
                    console.log("   > ❌ No se encontró botón para cerrar el modal. Intentando ESC.");
                    await page.keyboard.press('Escape');
                }
            }
        } catch (e) {
            console.log("   > (Info) No se detectó modal de contraseña: " + e.message);
        }

        // Cierre de modal de bienvenida
        console.log("   > 🛑 Verificando modales bloqueantes (Bienvenido)...");
        try {
            await delay(3000);
            const welcomeModal = await page.$('#modalInfoProvisoria');
            if (welcomeModal) {
                const isVisible = await welcomeModal.isVisible();
                if (isVisible) {
                    console.log("   > Modal 'Bienvenido' detectado. Intentando cerrar...");
                    const closeBtn = await page.$('#modalInfoProvisoria .fa-close, #modalInfoProvisoria [data-dismiss="modal"]');
                    if (closeBtn) {
                        await closeBtn.click();
                        console.log("   > Click en 'X' del modal realizado.");
                        await delay(2000);
                    } else {
                        console.log("   > No se encontró botón X, intentando ESC...");
                        await page.keyboard.press('Escape');
                    }
                }
            }
        } catch (e) {
            console.log("   > (Info) No se detectó modal o error al cerrar: " + e.message);
        }

        // Búsqueda de adrema por Enter (GeoSIT)
        console.log(`   > 🔍 Disparando búsqueda de adrema: ${adrema}...`);
        const searchInputSelector = '#search-pattern';
        await page.waitForSelector(searchInputSelector, { visible: true, timeout: 20000 });
        await page.type(searchInputSelector, adrema, { delay: 100 });
        await delay(500);
        await page.keyboard.press('Enter');
        console.log("   > ⏳ Enter enviado. Esperando 3s para que GeoSIT pueble los paneles...");
        await delay(3000);

        await page.screenshot({ path: path.resolve('./assets/debug/debug_01_post_enter.png') });
        await page.screenshot({ path: path.resolve('./assets/debug/debug_02_pre_extraction.png') });

        // Cerrar modales bloqueantes que puedan haber aparecido durante la carga
        try {
            const btnAceptar = await page.$('::-p-text(Aceptar)');
            if (btnAceptar && await btnAceptar.isVisible()) {
                await btnAceptar.click();
                await delay(2000);
                console.log("   > 🔵 Botón 'Aceptar' cerrado.");
            }
        } catch (e) { /* No apareció */ }

        try {
            const closeBtn = await page.$('button.close, [data-dismiss="modal"]');
            if (closeBtn && await closeBtn.isVisible()) {
                await closeBtn.click();
                await delay(2000);
                console.log("   > 🎯 Modal cerrado.");
            }
        } catch (e) { /* No apareció */ }

        // ── FORZAR VISIBILIDAD DE TODOS LOS PANELES ────────────────────────────
        // Los paneles del GeoSIT (UT, Parcelas, Mensuras) se cargan colapsados
        // (height:0px, class="collapse"). innerText ignora contenido invisible.
        // Estrategia: usar textContent directamente sobre cada panel por su ID,
        // lo cual devuelve texto sin importar el estado CSS del elemento.
        console.log("   > 📂 Leyendo paneles GeoSIT por ID (textContent — bypass de collapse)...");
        // ───────────────────────────────────────────────────────────────────────

        console.log("   > ✨ Procediendo a extracción...");

        // Extracción de datos con reintento persistente
        const MAX_INTENTOS = 5;
        const ESPERA_ENTRE_INTENTOS = 2000;
        let data = null;
        let intentoActual = 0;

        while (intentoActual < MAX_INTENTOS) {
            intentoActual++;
            console.log(`   > 🔄 Intento de extracción ${intentoActual}/${MAX_INTENTOS}...`);

            if (intentoActual > 1) {
                console.log(`   > ⏳ Esperando ${ESPERA_ENTRE_INTENTOS / 1000}s antes de reintentar...`);
                await delay(ESPERA_ENTRE_INTENTOS);
            }

            data = await page.evaluate(() => {
                const clean = (text) => text ? text.replace(/\s+/g, ' ').trim() : "";
                const bodyText = document.body.innerText;

                // ESTRATEGIA: leer textContent de paneles por ID para obtener
                // datos aunque estén colapsados (height:0px no afecta textContent)
                const utPanel = document.querySelector('#collapseunidadestributarias');
                const parcelasPanel = document.querySelector('#collapseparcelas');
                const mensurasPanel = document.querySelector('#collapsemensuras');

                const textoUT = utPanel ? utPanel.textContent.replace(/\s+/g, ' ') : "";
                const textoParcelas = parcelasPanel ? parcelasPanel.textContent.replace(/\s+/g, ' ') : "";
                const textoMensuras = mensurasPanel ? mensurasPanel.textContent : "";

                let titular = "No detectado";
                let ubicacion = "No detectado";
                let superficie = "0";
                let hayMensuras = false;

                // 1. Titular — Panel "Unidades Tributarias" via textContent (bypass de collapse)
                // textContent comprime whitespace a espacios simples (no \n), el regex es acordemente
                if (textoUT) {
                    const titularMatch = textoUT.match(/Titulares?\s*:?\s*([A-ZÁÉÍÓÚÑA-Za-záéíóúñ\s,\.]+?)(?:\s+Dominios|\s+Nomenclatura|\s+Código|\s*$)/i);
                    if (titularMatch) {
                        let candidato = titularMatch[1].trim();
                        if (candidato.includes('Dominios')) candidato = candidato.split('Dominios')[0].trim();
                        if (candidato.length > 3 && !candidato.includes('Mensura')) titular = candidato;
                    }
                }
                if (titular === "No detectado") {
                    const match = bodyText.match(/Titula(?:r|res)\s*:\s*([^\n]+)/i);
                    if (match) {
                        let candidato = match[1].trim();
                        if (candidato.includes('Dominios')) candidato = candidato.split('Dominios')[0].trim();
                        if (candidato.length > 3 && !candidato.includes('Mensura') && !candidato.includes('División')) titular = candidato;
                    }
                }
                if (titular === "No detectado") {
                    const nombreMatch = bodyText.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+,\s*[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s\.]+)/);
                    if (nombreMatch && !nombreMatch[1].includes('Mensura') && !nombreMatch[1].includes('División')) titular = nombreMatch[1].trim();
                }
                if (titular === "No detectado") {
                    const contextMatch = bodyText.match(/Titular[^]*?([A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,})?)/i);
                    if (contextMatch && contextMatch[1] && !contextMatch[1].includes('Mensura')) titular = contextMatch[1].trim();
                }

                // 2. Ubicación — Capa "Parcelas"
                if (textoParcelas) {
                    const matchDesig = textoParcelas.match(/Designaci[oó]n\s*:\s*([^\n]+)/i);
                    if (matchDesig) {
                        const desigRaw = clean(matchDesig[1]);
                        const dCalle = desigRaw.match(/Calle\s*:\s*([^\n-]+?)(?:\s*-\s*Nro|$)/i);
                        const dNro = desigRaw.match(/Nro\s*:\s*([^\s-]+)/i);
                        const dMza = desigRaw.match(/Manzana\s*:\s*([^\s-]+)/i);
                        const dLote = desigRaw.match(/Lote\s*:\s*([^\s-]+)/i);

                        if (dCalle || dNro || dMza || dLote) {
                            const calleStr = dCalle ? clean(dCalle[1]) : '';
                            const nroStr = dNro ? clean(dNro[1]) : '';
                            const mzStr = dMza ? `Mz: ${clean(dMza[1])}` : '';
                            const loteStr = dLote ? `Lote: ${clean(dLote[1])}` : '';
                            const partsFmt = [`${calleStr} ${nroStr}`.trim(), mzStr, loteStr].filter(p => p);
                            ubicacion = partsFmt.join(' - ');
                        } else {
                            ubicacion = desigRaw;
                        }
                    } else {
                        const parts = [];
                        const matchCalle = textoParcelas.match(/Calle\s*:\s*([^\n-]+)/i);
                        const matchNro = textoParcelas.match(/Nro\s*:\s*([^\s-]+)/i);
                        const matchMza = textoParcelas.match(/Manzana\s*:\s*([^\s-]+)/i);
                        const matchLote = textoParcelas.match(/Lote\s*:\s*([^\s-]+)/i);
                        if (matchCalle || matchNro) parts.push(`${matchCalle ? clean(matchCalle[1]) : ''} ${matchNro ? clean(matchNro[1]) : ''}`.trim());
                        if (matchMza) parts.push(`Mz: ${clean(matchMza[1])}`);
                        if (matchLote) parts.push(`Lote: ${clean(matchLote[1])}`);
                        if (parts.length > 0) ubicacion = parts.join(' - ');
                    }

                    const matchSup = textoParcelas.match(/Superficie\s*:\s*([\d.,]+)/i);
                    if (matchSup) superficie = matchSup[1];
                }

                // Fallback ubicación: buscar Designación en textContent del panel parcelas (ya normalizado)
                if (ubicacion === "No detectado" && textoParcelas) {
                    const matchDesigFull = textoParcelas.match(/Designaci[oó]n\s*([^]+?)(?:Superficie|Frente|Fondo|$)/i);
                    if (matchDesigFull) {
                        const seg = matchDesigFull[1];
                        const dCalle = seg.match(/Calle\s*:\s*([^\s-][^-]+?)(?:\s*-\s*Nro|\s*$)/i);
                        const dNro = seg.match(/Nro\s*:\s*([^\s-]+)/i);
                        const dMza = seg.match(/Manzana\s*:\s*([^\s-]+)/i);
                        const dLote = seg.match(/Lote\s*:\s*([^\s-]+)/i);
                        const parts = [];
                        if (dCalle || dNro) parts.push(`${dCalle ? clean(dCalle[1]) : ''} ${dNro ? clean(dNro[1]) : ''}`.trim());
                        if (dMza) parts.push(`Mz: ${clean(dMza[1])}`);
                        if (dLote) parts.push(`Lote: ${clean(dLote[1])}`);
                        if (parts.length > 0) ubicacion = parts.join(' - ');
                    }
                }
                // Último recurso: buscar en bodyText visible
                if (ubicacion === "No detectado") {
                    const parts = [];
                    const matchCalle = bodyText.match(/Calle\s*:?\s*([^\n,]+)/i);
                    const matchNro = bodyText.match(/(?:Nro|Número|N°)\s*:?\s*(\d+)/i);
                    const matchMza = bodyText.match(/Manzana\s*:?\s*([^\n,]+)/i);
                    const matchLote = bodyText.match(/Lote\s*:?\s*([^\n,]+)/i);
                    if (matchCalle) parts.push(`Calle: ${clean(matchCalle[1])}`);
                    if (matchNro) parts.push(`Nro: ${matchNro[1]}`);
                    if (matchMza) parts.push(`Manzana: ${clean(matchMza[1])}`);
                    if (matchLote) parts.push(`Lote: ${clean(matchLote[1])}`);
                    if (parts.length > 0) ubicacion = parts.join(' - ');
                }

                // Fallback superficie
                if (superficie === "0") {
                    const matchSup = textoParcelas.match(/Superficie\s*:\s*([\d.,]+)/i) || bodyText.match(/Superficie\s*:\s*([\d.,]+)/i);
                    if (matchSup) superficie = matchSup[1];
                }

                // Detectar sección Mensuras — usar textContent del panel para no depender de visibilidad
                hayMensuras = /\d{1,6}-[A-Z]/i.test(textoMensuras) || (bodyText.includes('Mensuras') && /\d{1,6}-[A-Z]/i.test(bodyText));

                const matchFrente = bodyText.match(/Frente\s*:?\s*([\d.,]+)/i);
                const matchFondo = bodyText.match(/Fondo\s*:?\s*([\d.,]+)/i);

                return {
                    titular: clean(titular),
                    ubicacion: clean(ubicacion),
                    superficieDGC: clean(superficie),
                    hayMensuras,
                    validacionGeometrica: (parseFloat(matchFrente?.[1] || 0) * parseFloat(matchFondo?.[1] || 0)).toFixed(2)
                };
            });

            // Validar titular
            if (data.titular && data.titular !== "No detectado" && data.titular.length > 3 && !data.titular.toLowerCase().includes("mensura")) {
                console.log(`   > ✅ Titular extraído exitosamente en intento ${intentoActual}: ${data.titular}`);
                break;
            } else {
                console.log(`   > ⚠️ Titular dudoso ("${data.titular}") en intento ${intentoActual}. Reintentando...`);
                if (data.titular) {
                    const limpio = data.titular.replace(/Mensura.*/i, '').replace(/Divisi[oó]n.*/i, '').trim();
                    if (limpio.length > 3) { data.titular = limpio; break; }
                }
                await page.screenshot({ path: path.resolve(`./assets/debug/debug_retry_intento_${intentoActual}.png`) });
            }
        }

        // Si falló tras todos los intentos, guardar dump
        if (!data || data.titular === "No detectado" || data.titular.length < 3) {
            console.log("   > ❌ Fallo después de todos los intentos. Guardando dump...");
            const debugData = await page.evaluate(() => ({
                debugHTML: document.documentElement.outerHTML,
                debugText: document.body.innerText
            }));
            data = { ...data, ...debugData };
        }

        if (data.debugHTML) {
            fs.writeFileSync(path.resolve('./assets/debug/dump_provincia.html'), data.debugHTML);
            fs.writeFileSync(path.resolve('./assets/debug/dump_provincia.txt'), data.debugText);
            console.log("💾 Dump de depuración guardado en ./assets/debug/");
        }

        console.log("   > Datos Provincia Extraídos:", { titular: data.titular, ubicacion: data.ubicacion });

        // Guardado inmediato (blindaje operativo) antes de cerrar navegador
        const metadataPathInmediato = path.resolve('./data/mensura_extracted_data.json');
        // Solo guardar si el titular es válido — no sobreescribir con datos de error
        const titularValido = data.titular && data.titular !== 'No detectado' && data.titular.length > 3
            && !data.titular.toLowerCase().includes('mensura') && !data.titular.toLowerCase().includes('consultar');
        if (titularValido) {
            const datosProvinciales = {
                titular: data.titular,
                ubicacion: data.ubicacion,
                superficieDGC: data.superficieDGC,
                hayMensuras: data.hayMensuras,
                timestampExtraccion: new Date().toISOString()
            };
            fs.writeFileSync(metadataPathInmediato, JSON.stringify(datosProvinciales, null, 2));
            console.log("💾 BLINDAJE: Datos provinciales guardados en mensura_extracted_data.json");
        } else {
            console.log("⚠️ BLINDAJE: Titular inválido, NO se sobreescribe mensura_extracted_data.json");
        }

        // ========================================================
        // PROTOCOLO DE REVELACIÓN DE MENSURAS (7 PASOS)
        // Flujo: span.fa-external-link → modal visor → i.fa-download → CDP → rename → span.fa-close
        // ========================================================
        console.log("   > 📄 Iniciando Protocolo de Revelación de Mensuras...");
        const mensurasDescargadas = [];

        if (data.hayMensuras) {
            console.log("   > ✅ ESCENARIO A: Existen Mensuras. Aplicando hover-reveal...");

            try {
                if (cdpClient) {
                    await cdpClient.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(outputPath) });
                } else {
                    cdpClient = await page.target().createCDPSession();
                    await cdpClient.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(outputPath) });
                }
            } catch (cdpErr) { console.log("   > ⚠️ CDP Warning: " + cdpErr.message); }

            try {
                const mensuraCodigos = await page.evaluate(() => {
                    const regex = /\d{1,6}-[A-Z]/gi;
                    const matches = document.body.innerText.match(regex) || [];
                    return [...new Set(matches)];
                });

                console.log(`   > 📚 Mensuras encontradas: ${mensuraCodigos.length} - ${mensuraCodigos.join(', ')}`);

                for (let idx = 0; idx < mensuraCodigos.length; idx++) {
                    const codigo = mensuraCodigos[idx];
                    const nuevoNombre = `Mensura_${adrema}_${codigo}.pdf`;
                    const destPath = path.join(outputPath, nuevoNombre);
                    console.log(`   > 🖱️ [${idx + 1}/${mensuraCodigos.length}] Procesando mensura: ${codigo}...`);

                    try {
                        const codigoElement = await page.evaluateHandle((cod) => {
                            const elements = Array.from(document.querySelectorAll('div, span, p, label, td'));
                            return elements.find(el => el.innerText.includes(cod) && el.innerText.length < 50);
                        }, codigo);

                        if (!codigoElement || !codigoElement.asElement()) {
                            console.log(`   > ⚠️ No se encontró elemento para ${codigo}. Saltando...`);
                            continue;
                        }

                        await page.evaluate((el) => {
                            if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
                            else el.scrollIntoView({ block: 'center', behavior: 'instant' });
                        }, codigoElement.asElement());
                        await delay(500);

                        // PASO 1: Click en span.fa-external-link
                        const btnExternal = await page.evaluateHandle((cod) => {
                            const elements = Array.from(document.querySelectorAll('div, span, p, label, td'));
                            const codEl = elements.find(el => el.innerText.includes(cod) && el.innerText.length < 50);
                            if (!codEl) return null;
                            const parent = codEl.closest('.srow') || codEl.closest('tr') || codEl.parentElement?.parentElement;
                            if (parent) {
                                const btn = parent.querySelector('.opcion.fa-external-link') || parent.querySelector('.fa-external-link');
                                if (btn) return btn;
                            }
                            const allBtns = Array.from(document.querySelectorAll('.opcion.fa-external-link'));
                            if (allBtns.length === 0) return null;
                            const codRect = codEl.getBoundingClientRect();
                            let closest = allBtns[0], minDist = Infinity;
                            allBtns.forEach(btn => {
                                const btnRect = btn.getBoundingClientRect();
                                const dist = Math.abs(btnRect.top - codRect.top);
                                if (dist < minDist) { minDist = dist; closest = btn; }
                            });
                            return closest;
                        }, codigo);

                        if (!btnExternal || !btnExternal.asElement()) {
                            console.log(`   > ⚠️ No se encontró span.fa-external-link para ${codigo}. Saltando...`);
                            continue;
                        }

                        console.log(`   > [PASO 1] Click en span.fa-external-link para ${codigo}...`);
                        await page.evaluate((el) => el.click(), btnExternal.asElement());

                        // PASO 2: Esperar que desaparezca el backdrop de carga
                        console.log(`   > [PASO 2] Esperando loading-status-ui-backdrop...`);
                        try {
                            await page.waitForSelector('div.loading-status-ui-backdrop', { visible: true, timeout: 5000 }).catch(() => {});
                            await page.waitForSelector('div.loading-status-ui-backdrop', { hidden: true, timeout: 30000 });
                            console.log(`   > [PASO 2] ✅ Backdrop desapareció. Modal listo.`);
                        } catch (e) {
                            console.log(`   > [PASO 2] ⚠️ Timeout esperando backdrop: ${e.message}. Continuando...`);
                        }
                        await delay(1500);

                        // PASO 3: Click en i.fa-download
                        console.log(`   > [PASO 3] Buscando botón i.fa-download...`);
                        const archivosAntes = fs.readdirSync(outputPath);
                        try {
                            await page.waitForSelector('i.fa-download', { visible: true, timeout: 15000 });
                            await page.evaluate(() => {
                                const btn = document.querySelector('i.fa-download');
                                if (btn) btn.click();
                            });
                            console.log(`   > [PASO 3] ✅ Click en i.fa-download ejecutado.`);
                        } catch (dlErr) {
                            console.log(`   > [PASO 3] ⚠️ No se encontró i.fa-download: ${dlErr.message}`);
                            try {
                                await page.evaluate(() => {
                                    const btn = document.querySelector('button.btn-default');
                                    if (btn) btn.click();
                                });
                            } catch (e) { }
                        }

                        // PASO 4: Esperar nuevo PDF en carpeta
                        console.log(`   > [PASO 4] Esperando archivo nuevo en carpeta...`);
                        let archivoDescargado = null;
                        for (let espera = 0; espera < 20; espera++) {
                            await delay(1500);
                            const archivosAhora = fs.readdirSync(outputPath);
                            const nuevos = archivosAhora.filter(f =>
                                !archivosAntes.includes(f) && f.endsWith('.pdf') && !f.endsWith('.crdownload')
                            );
                            if (nuevos.length > 0) {
                                archivoDescargado = nuevos[0];
                                console.log(`   > [PASO 4] ✅ Archivo detectado: ${archivoDescargado}`);
                                break;
                            }
                            const enProgreso = archivosAhora.filter(f => !archivosAntes.includes(f) && f.endsWith('.crdownload'));
                            if (enProgreso.length > 0 && espera < 18) {
                                console.log(`   > [PASO 4] ⏳ Descarga en progreso: ${enProgreso[0]}...`);
                            }
                        }

                        // PASO 5: Renombrar a Mensura_${adrema}_XXXXX-U.pdf
                        if (archivoDescargado) {
                            const oldPath = path.join(outputPath, archivoDescargado);
                            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                            fs.renameSync(oldPath, destPath);
                            const sizeKB = (fs.statSync(destPath).size / 1024).toFixed(1);
                            console.log(`   > [PASO 5] ✅ RENOMBRADO: ${archivoDescargado} → ${nuevoNombre} (${sizeKB} KB)`);

                            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
                                mensurasDescargadas.push({ codigo, archivo: nuevoNombre, orden: idx + 1, timestamp: new Date().toISOString() });
                                mensuraFilename = true;
                            } else {
                                console.log(`   > [PASO 5] ❌ VERIFICACIÓN FALLIDA: archivo vacío o inexistente.`);
                            }
                        } else {
                            console.log(`   > [PASO 4] ❌ No se detectó archivo nuevo tras 30 segundos.`);
                        }

                        // PASO 6: Cerrar modal
                        console.log(`   > [PASO 6] Cerrando modal...`);
                        try {
                            await page.waitForSelector('span.fa-close', { visible: true, timeout: 5000 });
                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('span.fa-close');
                                if (closeBtn) closeBtn.click();
                            });
                            console.log(`   > [PASO 6] ✅ Modal cerrado.`);
                        } catch (closeErr) {
                            console.log(`   > [PASO 6] ⚠️ No se encontró span.fa-close. Intentando Escape...`);
                            await page.keyboard.press('Escape');
                        }

                        // PASO 7: Enfriamiento
                        if (idx < mensuraCodigos.length - 1) {
                            console.log(`   > [PASO 7] ⏳ Enfriamiento 2 segundos...`);
                            await delay(2000);
                        }

                    } catch (iterErr) {
                        console.log(`   > ⚠️ Error procesando mensura ${codigo}: ${iterErr.message}. Continuando...`);
                        try { await page.evaluate(() => { const c = document.querySelector('span.fa-close'); if (c) c.click(); }); } catch (e) { }
                        await delay(2000);
                    }
                }

                console.log(`   > 📦 MULTI-MENSURA: Total descargadas: ${mensurasDescargadas.length} de ${mensuraCodigos.length}`);

            } catch (e) {
                console.log("   > ⚠️ Error en hover-reveal: " + e.message);
            }
        } else {
            console.log("   > 📋 ESCENARIO B: Sin Mensuras. Saltando descarga de documentos.");
        }

        // Fallback: método alternativo si no se descargó ninguna mensura
        if (!mensuraFilename) {
            console.log("   > 🔄 Intentando método alternativo de descarga...");
            try {
                const archivosAntes = fs.readdirSync(outputPath);
                const mensuraClickSuccess = await page.evaluate(async () => {
                    const allElements = Array.from(document.querySelectorAll('div, span, p, label'));
                    const mensuraEl = allElements.find(el => /\b\d{1,6}-[A-Z]\b/.test(el.innerText) && el.innerText.length < 15);
                    if (mensuraEl) { mensuraEl.click(); return true; }
                    const docIcon = document.querySelector('.fa-file-text-o, .fa-file');
                    if (docIcon) { docIcon.click(); return true; }
                    return false;
                });

                if (mensuraClickSuccess) {
                    console.log("   > Click en Mensura realizado. ⏳ Esperando modal...");
                    let btnDownload = null;
                    try {
                        await page.waitForSelector('i.fa-download, button.btn-default, [title="Descargar"]', { visible: true, timeout: 15000 });
                        btnDownload = await page.evaluateHandle(() => {
                            const btns = Array.from(document.querySelectorAll('i, button, span, a'));
                            return btns.find(el => el.classList.contains('fa-download') || el.innerText.toLowerCase().includes('descargar'));
                        });
                    } catch (e) {
                        console.log("   > ⚠️ Modal no apareció. Reintentando búsqueda...");
                    }

                    if (btnDownload && btnDownload.asElement()) {
                        await btnDownload.asElement().click();
                        const startDl = Date.now();
                        while (Date.now() - startDl < 30000) {
                            await delay(2000);
                            const archivos = fs.readdirSync(outputPath);
                            if (archivos.some(f => !archivosAntes.includes(f) && f.endsWith('.pdf'))) {
                                console.log("   > ✅ Archivo descargado exitosamente (Fallback).");
                                mensuraFilename = true;
                                break;
                            }
                        }
                    } else {
                        console.log("   > ❌ No se encontró botón de descarga en Fallback.");
                    }
                }
            } catch (e) {
                console.log("   ⚠️ Fallo no crítico en descarga de mensura (" + e.message + ")");
            }
        }

        return { ...data, mensuraDownloaded: !!mensuraFilename };

    } catch (err) {
        console.error("❌ Error Provincia CRÍTICO:", err.message);
        await reportarError('GeneralCritical', err, page);
        console.log("⚠️ MANTENIENDO NAVEGADOR ABIERTO PARA REVISIÓN.");
        return { titular: "Ver Mensura adjunta", ubicacion: "Consultar documentación", superficieDGC: "0" };
    } finally {
        console.log("⚠️ FIN PROVINCIA. Cerrando navegador.");
        if (browser) await browser.close();
    }
}

module.exports = { scrapeProvincial };
