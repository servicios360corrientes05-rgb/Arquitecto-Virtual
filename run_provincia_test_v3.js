const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FOLDER = path.resolve('./public/informes');
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function escrapearProvincia(adrema) {
    console.log(`🌍 Iniciando trámite provincial (DGC) para: ${adrema}`);

    const downloadPath = path.resolve(OUTPUT_FOLDER);

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

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("   > Logueando...");
        await page.waitForSelector('#Login', { visible: true, timeout: 10000 });
        await page.type('#Login', 'arneaz90');
        await page.click('#Password');
        await page.type('#Password', 'dani1204');
        await page.click('#loginbtn');

        // --- ESTRATEGIA "BOTÓN AZUL ACEPTAR" ---
        console.log('   > [PRIORIDAD] Buscando botón "Aceptar" (Azul)...');
        await delay(3000); // Esperar que cargue el modal

        let botonEncontrado = false;

        // 1. Búsqueda por Texto Exacto y Aproximado en Botones/Divs
        const clickResult = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('button, div[role="button"], a.btn, div.btn'));

            // Filtro 1: Texto "Aceptar" (ignora mayusc/minusc y espacios)
            const target = candidates.find(el => {
                const txt = el.innerText.trim().toLowerCase();
                return txt === 'aceptar';
            });

            if (target) {
                console.log('     > ENCONTRADO por texto "Aceptar". Haciendo click...');
                target.click();
                return true;
            }
            return false;
        });

        if (clickResult) {
            console.log("   > ✅ ¡Click en Aceptar enviado!");
            botonEncontrado = true;
        } else {
            console.log("   ⚠️ No se encontró por texto exacto. Intentando búsqueda amplia...");
            // Fallback: Buscar cualquier elemento visible con texto "Aceptar"
            const clickFallback = await page.evaluate(() => {
                const all = Array.from(document.querySelectorAll('body *'));
                const visibleAceptar = all.find(el =>
                    el.innerText &&
                    el.innerText.trim().toLowerCase() === 'aceptar' &&
                    el.offsetWidth > 0 &&
                    el.offsetHeight > 0 // Visibilidad básica
                );

                if (visibleAceptar) {
                    visibleAceptar.click();
                    return true;
                }
                return false;
            });

            if (clickFallback) {
                console.log("   > ✅ ¡Click en elemento con texto 'Aceptar' enviado!");
                botonEncontrado = true;
            }
        }

        if (!botonEncontrado) {
            console.log("   ⚠️ Aún no se pudo clickear. Probando Coordenadas (778, 304) como último recurso...");
            try { await page.mouse.click(778, 304); } catch (e) { }
        }

        await delay(2000);

        // 5. Popup "Bienvenido" -> Cerrar con 'X'
        try {
            const closeBtn = await page.$('.close, [data-dismiss="modal"], .modal-close');
            if (closeBtn) {
                await closeBtn.click();
                console.log("   > Modal Bienvenida cerrado.");
            }
        } catch (e) { }

        // 6. Ingresar Adrema
        console.log("   > Validando si estamos dentro (Buscando Adrema)...");
        try {
            const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 5000 });
            console.log("   > ✅ ¡ÉXITO! Estamos logueados y listos para buscar.");

            // Completar prueba
            await inputAdrema.click({ clickCount: 3 });
            await inputAdrema.type(adrema);
            await page.keyboard.press('Enter');
            console.log("   > Buscando Adrema... (Prueba finalizada)");

        } catch (e) {
            console.error("❌ No se detectó la barra de búsqueda. Es posible que el click en 'Aceptar' no haya funcionado o falte cerrar algo.");
        }

    } catch (err) {
        console.error("❌ Error General:", err.message);
    } finally {
        console.log("⚠️ FIN TEST. Navegador abierto para revisión.");
    }
}

escrapearProvincia('A10169791');
