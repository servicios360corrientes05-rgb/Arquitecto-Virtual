const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FOLDER = path.resolve('./public/informes');
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function escrapearProvincia(adrema) {
    console.log(`🌍 Iniciando trámite provincial (DGC) para: ${adrema} (MODO SILENT LOGIN)`);

    const downloadPath = path.resolve(OUTPUT_FOLDER);

    // MODO VISIBLE + ARGUMENTOS ANTI-POPUP CHROME
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            // --- BLOQUEO DE ALERTAS DE CONTRASEÑA/SEGURIDAD ---
            '--disable-features=PasswordLeakDetection',
            '--disable-save-password-bubble',
            '--no-default-browser-check'
        ]
    });

    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("   > Logueando...");
        await page.waitForSelector('#Login', { visible: true, timeout: 10000 });
        await page.type('#Login', 'arneaz90');
        await page.click('#Password');
        await page.type('#Password', 'dani1204');
        await page.click('#loginbtn');

        console.log("   > Esperando reacción post-login (5s)...");
        await delay(5000);

        // 5. Popup "Bienvenido" -> Cerrar con SELECTOR APRENDIDO
        try {
            await delay(2000); // Espera prudente
            const selectorClose = 'span.fa.fa-close';
            const closeBtn = await page.$(selectorClose);
            if (closeBtn) {
                console.log("   > 🎯 Clic en cerrar Modal Bienvenida (Aprendido)");
                await closeBtn.click();
            } else {
                console.log("   > Modal Bienvenida no detectado (o ya cerrado).");
            }
        } catch (e) { console.log("   > Skip modal bienvenida."); }

        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        try {
            // Esperamos explícitamente el ID capturado
            const inputAdrema = await page.waitForSelector('#search-pattern', { visible: true, timeout: 15000 });
            console.log("   ✅ ¡LOGIN LIMPIO! Adrema input encontrado.");
            await inputAdrema.click({ clickCount: 3 });
            await inputAdrema.type(adrema);
            await page.keyboard.press('Enter');
        } catch (e) {
            console.error("❌ Fallo buscando #search-pattern. Reintentando genérico...");
            try {
                const inputGen = await page.waitForSelector('input[type="text"]', { visible: true });
                await inputGen.type(adrema);
                await page.keyboard.press('Enter');
            } catch (ex) { throw e; }
        }

        console.log("   > Resultados Adrema solicitados. (Prueba finalizada)");
        await delay(5000);

        // 7. Extracción de Datos (Solo para confirmar)
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
                }
            }
        } catch (e) {
            console.log("   ⚠️ Fallo no crítico en descarga de mensura (" + e.message + ")");
        }


    } catch (err) {
        console.error("❌ Error General:", err.message);
    } finally {
        console.log("⚠️ FIN TEST VIVO. Revisar pantalla.");
    }
}

escrapearProvincia('A10169791');
