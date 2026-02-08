const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FOLDER = path.resolve('./public/informes');
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTestManual(adrema) {
    console.log(`🔍 INICIANDO MODO APRENDIZAJE para: ${adrema}`);
    console.log(`⚠️  INSTRUCCIONES:`);
    console.log(`   1. El navegador se abrirá en DGC.`);
    console.log(`   2. Tendrás 45 SEGUNDOS para Loguearte y cerrar Popups.`);
    console.log(`   3. Cada clic que hagas se registrará aquí en la terminal (copia los IDs/Clases).`);
    console.log(`   4. Al finalizar el tiempo, el robot intentará buscar el Adrema y descargar.`);

    const downloadPath = path.resolve(OUTPUT_FOLDER);

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

    // --- INYECCIÓN DE LOGGER DE CLICS ---
    await page.exposeFunction('logClick', (info) => {
        console.log(`🖱️  [CLICK UI]: ${info}`);
    });

    await page.evaluateOnNewDocument(() => {
        document.addEventListener('click', (e) => {
            const el = e.target;
            // Intentar capturar la mayor info posible
            const info = {
                tag: el.tagName,
                id: el.id || 'N/A',
                className: el.className || 'N/A',
                text: el.innerText ? el.innerText.substring(0, 30).replace(/\n/g, ' ') : '',
                src: el.src || 'N/A',
                parentClass: el.parentElement ? el.parentElement.className : 'N/A'
            };
            window.logClick(JSON.stringify(info));
        }, true); // Capture phase
    });

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("⏳ ESPERA DE 45 SEGUNDOS INICIADA. ¡INTERACTÚA AHORA!");

        // Loop de espera visual
        for (let i = 45; i > 0; i -= 5) {
            console.log(`   ... Quedan ${i} segundos ...`);
            await delay(5000);
        }

        console.log("⏰ TIEMPO CUMPLIDO. Retomando control automático...");

        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        // Intentamos esperar el input, asumiendo que el usuario ya se logueó
        try {
            const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 10000 });
            await inputAdrema.click({ clickCount: 3 });
            await inputAdrema.type(adrema);
            await page.keyboard.press('Enter');
        } catch (e) {
            console.error("❌ Falló la búsqueda de Adrema. ¿Lograste entrar?");
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

        // 8. y 9. Descarga de Mensura
        console.log("   > Intentando descargar mensura...");
        const mensuraClickSuccess = await page.evaluate(async () => {
            const allElements = Array.from(document.querySelectorAll('div, span, p, label'));
            // Patrón Mensura ####-U
            const mensuraEl = allElements.find(el => /\b\d{1,6}-[A-Z]\b/.test(el.innerText) && el.innerText.length < 15);

            if (mensuraEl) {
                mensuraEl.click();
                return true;
            }
            const docIcon = document.querySelector('.fa-file-text-o, .fa-file');
            if (docIcon) {
                docIcon.click();
                return true;
            }
            return false;
        });

        if (mensuraClickSuccess) {
            console.log("   > Click en Mensura realizado. Esperando modal...");
            await delay(3000);

            const btnDownload = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('i, button, span, a')).find(el =>
                    el.classList.contains('fa-download') ||
                    el.innerText.toLowerCase().includes('descargar')
                );
            });

            if (btnDownload && btnDownload.asElement()) {
                console.log("   > Click en Descargar PDF...");
                await btnDownload.asElement().click();
                await delay(8000);
            }
        }

    } catch (err) {
        console.error("❌ Error en Modo Aprendizaje:", err.message);
    } finally {
        console.log("⚠️ FIN DEL SCRIPT. Navegador abierto para revisión final.");
        // no cerrar
    }
}

// Ejecutar
runTestManual('A10169791');
