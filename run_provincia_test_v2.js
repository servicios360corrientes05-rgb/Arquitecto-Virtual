const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FOLDER = path.resolve('./public/informes');
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function escrapearProvincia(adrema) {
    console.log(`🌍 Iniciando trámite provincial (DGC) para: ${adrema}`);

    const downloadPath = path.resolve(OUTPUT_FOLDER);
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

    // MODO VISIBLE
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });

    let mensuraFilename = null;

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("   > Logueando con selectores validados...");
        try {
            await page.waitForSelector('#Login', { visible: true, timeout: 10000 });
            await page.type('#Login', 'arneaz90');
            await page.click('#Password'); // Focus secure
            await page.type('#Password', 'dani1204');
            await page.click('#loginbtn');
        } catch (e) {
            await reportarError('Login', e, page);
            throw e; // Login es crítico
        }

        // --- CAJA DE REPARACIÓN DINÁMICA (POP-UPS) ---
        console.log('   > [REPAIR BOX] Monitoreando pop-up de contraseña (20s)...');
        // No usamos delay fijo, sino polling inteligente
        let popupDetectado = false;
        let popupResuelto = false;

        for (let i = 0; i < 10; i++) { // 10 intentos x 2s = 20s
            await delay(2000); // Polling interval
            const estadoPopup = await page.evaluate(() => {
                const txt = document.body.innerText;
                const visible = txt.includes('Cambia tu contraseña') || txt.includes('Guardar la contraseña');
                return visible;
            });

            if (estadoPopup) {
                console.log(`   > ⚠️ Pop-up detectado en ciclo ${i + 1}. Iniciando Protocolo de Rescate...`);
                popupDetectado = true;

                // ESTRATEGIA A: TEXTO EXACTO
                console.log('     [A] Intentando clic por texto "Aceptar"...');
                const clickText = await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, div, a')).find(el => el.innerText.trim() === 'Aceptar' || el.innerText.trim() === 'Guardar');
                    if (btn) { btn.click(); return true; }
                    return false;
                });

                if (clickText) {
                    console.log('     ✅ Estrategia A funcionó.');
                    popupResuelto = true;
                    break;
                }

                // ESTRATEGIA B: COORDENADAS
                console.log('     [B] Intentando clic coordenadas (778, 304)...');
                try { await page.mouse.click(778, 304); } catch (e) { }
                await delay(1000);

                // Verificar si se fue
                const sigueAhi = await page.evaluate(() => document.body.innerText.includes('Cambia tu contraseña'));
                if (!sigueAhi) {
                    console.log('     ✅ Estrategia B funcionó.');
                    popupResuelto = true;
                    break;
                }

                // ESTRATEGIA C: ENTER
                console.log('     [C] Intentando tecla ENTER...');
                await page.keyboard.press('Enter');
                await delay(1000);

                popupResuelto = true; // Asumimos intento final
                break;
            } else {
                // Si no hay popup, verificamos si ya estamos dentro (ej. viendo "Bienvenido" o Search)
                const loggedIn = await page.evaluate(() => document.querySelector('.close, [data-dismiss="modal"]') || document.querySelector('input[placeholder*="Adrema"]'));
                if (loggedIn) {
                    console.log('   > ✅ Login detectado sin obstrucción de contraseña.');
                    break;
                }
            }
            if (i === 9) console.log("   > ⚠️ Tiempo agotado esperando popup. Continuando...");
        }

        // 5. Popup "Bienvenido" -> Cerrar con 'X'
        try {
            await delay(1000);
            const closeBtn = await page.$('.close, [data-dismiss="modal"], .modal-close');
            if (closeBtn) {
                await closeBtn.click();
                console.log("   > Modal Bienvenida cerrado.");
            }
        } catch (e) {
            // No es critico
        }

        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        try {
            const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 15000 });
            await inputAdrema.click({ clickCount: 3 });
            await inputAdrema.type(adrema);
            await page.keyboard.press('Enter');
        } catch (e) {
            await reportarError('BusquedaAdrema', e, page);
            throw e;
        }

        console.log("   > Esperando resultados...");
        await delay(5000);

        // 7. Extracción de Datos
        const data = await page.evaluate(() => {
            const filas = Array.from(document.querySelectorAll('.lista-resultados > div, .resultados-item'));
            console.log('Filas encontradas:', filas.length);

            let titulares = "No detectado";
            let superficie = "0";

            if (filas.length >= 7) {
                titulares = filas[4]?.innerText.replace('Titulares:', '').trim();
                superficie = filas[6]?.innerText.match(/Superficie:\s*([\d.,]+)/)?.[1] || "0";
            } else {
                const allDivs = Array.from(document.querySelectorAll('div'));
                const tDiv = allDivs.find(d => d.innerText.includes('Titulares:'));
                const sDiv = allDivs.find(d => d.innerText.includes('Superficie:'));
                if (tDiv) titulares = tDiv.innerText.split('Titulares:')[1].split('/')[0].trim();
                if (sDiv) superficie = sDiv.innerText.match(/Superficie:\s*([\d.,]+)/)?.[1];
            }

            return { titulares, superficieDGC: superficie };
        });
        console.log("   > Datos Provincia Extraídos:", data);

        // 8. Mensura
        console.log("   > Intentando descargar mensura...");
        try {
            const mensuraClickSuccess = await page.evaluate(async () => {
                const allElements = Array.from(document.querySelectorAll('div, span, p, label'));
                const mensuraEl = allElements.find(el => /\b\d{1,6}-[A-Z]\b/.test(el.innerText) && el.innerText.length < 15);
                if (mensuraEl) { mensuraEl.click(); return true; }
                const docIcon = document.querySelector('.fa-file-text-o, .fa-file');
                if (docIcon) { docIcon.click(); return true; }
                return false;
            });

            if (mensuraClickSuccess) {
                console.log("   > Click en Mensura realizado. Esperando modal...");
                await delay(3000);
                const btnDownload = await page.evaluateHandle(() => {
                    return Array.from(document.querySelectorAll('i, button, span, a')).find(el =>
                        el.classList.contains('fa-download') || el.innerText.toLowerCase().includes('descargar')
                    );
                });
                if (btnDownload && btnDownload.asElement()) {
                    console.log("   > Click en Descargar PDF...");
                    await btnDownload.asElement().click();
                    await delay(8000);
                    mensuraFilename = true;
                }
            }
        } catch (e) {
            console.log("   ⚠️ Fallo no crítico en descarga de mensura (" + e.message + ")");
        }

        return { ...data, mensuraDownloaded: !!mensuraFilename };

    } catch (err) {
        console.error("❌ Error Provincia CRÍTICO:", err.message);
        await reportarError('GeneralCritical', err, page);
        console.log("⚠️ MANTENIENDO NAVEGADOR ABIERTO PARA REVISIÓN (No se cerrará por error).");
        // await browser.close(); // COMENTADO POR SOLICITUD
        return { titulares: "Error", superficieDGC: "0" };
    } finally {
        console.log("⚠️ FIN PROVINCIA. Navegador permanece abierto.");
        // await browser.close(); // COMENTADO POR SOLICITUD
    }
}

escrapearProvincia('A10169791');
