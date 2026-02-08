
require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testScraping(partida) {
    console.log(`🛠️ DEBUG: Iniciando prueba de scraping para: ${partida}`);

    // Configuración Headless igual que watcher.js
    const headlessMode = process.env.PUPPETEER_HEADLESS === 'false' ? false : true; // "new" is deprecated but keeping compatible logic

    console.log(`   > Browser Headless: ${headlessMode}`);

    const browser = await puppeteer.launch({
        headless: headlessMode,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    // Usamos los tiempos optimizados
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    // Selección robusta (copiada de watcher.js)
    const seleccionarOpcionRobust = async (id, valor, maxAttempts = 3) => {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await page.waitForSelector(`#${id}`, { visible: true, timeout: 8000 });
                await page.select(`#${id}`, valor);
                await page.evaluate((elId, valor) => {
                    const el = document.getElementById(elId);
                    if (el) {
                        el.value = valor;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, id, valor);
                await delay(1000);
                const actual = await page.evaluate((elId) => document.getElementById(elId)?.value, id);
                if (actual === valor) return true;
                console.log(`⚠️ Reintento selección #${id}`);
            } catch (err) {
                console.log(`⚠️ Error selección #${id}: ${err.message}`);
                await delay(2000);
            }
        }
        return false;
    };

    try {
        await page.goto('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/index.php', { waitUntil: 'networkidle2' });
        console.log("   > Navegación inicial OK");

        await seleccionarOpcionRobust('t_uso_suelo', '1');
        await delay(1000);
        await seleccionarOpcionRobust('tipo_actividad', '1');
        await delay(1000);
        await seleccionarOpcionRobust('activida_d', '2'); // Viviendas Colectivas
        await delay(1000);
        await seleccionarOpcionRobust('ubicacion', 'adrema');
        await delay(1000);

        console.log(`   > Ingresando Adrema ${partida}...`);
        await page.waitForSelector('#adrema', { visible: true });
        await page.type('#adrema', partida);

        console.log("   > Click Siguiente...");
        await page.click('#siguiente');

        console.log("   > Esperando resultados (timeout 60s)...");

        // Espera inteligente
        try {
            await Promise.race([
                page.waitForFunction(() => {
                    const body = document.body.innerText;
                    return (body.includes('Distrito:') || body.includes('Entre Medianeras')) && document.querySelector('table');
                }, { timeout: 60000 }),
                page.waitForSelector('table tr', { visible: true, timeout: 60000 })
            ]);
            console.log("   > ✅ Datos detectados visualmente.");
        } catch (e) {
            console.error("   ❌ TEOUT esperando datos. Posible 'congelamiento' o sin resultados.");
            const bodyPreview = await page.evaluate(() => document.body.innerText.substring(0, 500));
            console.log("   DEBUG HTML PREVIEW:", bodyPreview);
        }

        console.log("   > Espera de seguridad (5s)...");
        await delay(5000);

        // Extracción simple para verificar
        const datos = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const matchSup = bodyText.match(/Sup\.?\s*Parcela:\s*([\d\.,]+)/i);
            const matchAltura = bodyText.match(/Altura\s*(?:Máxima)?\s*[:\(]?\s*([\d\.,]+)/i); // Fallback regex

            // Buscar en tabla
            let supMaxima = "0";
            let altura = "0";
            const rows = Array.from(document.querySelectorAll('tr'));
            const medianera = rows.find(r => /Entre\s*Medianeras/i.test(r.innerText));
            if (medianera) {
                const cells = medianera.querySelectorAll('td');
                if (cells.length > 1) supMaxima = cells[1].innerText;
                if (cells.length > 4) altura = cells[cells.length - 1].innerText;
            }

            return {
                superficie: matchSup ? matchSup[1] : 'N/A',
                altura_tabla: altura,
                sup_maxima: supMaxima,
                texto_completo_preview: bodyText.substring(0, 200)
            };
        });

        console.log("📊 RESULTADOS EXTRAÍDOS:");
        console.log(JSON.stringify(datos, null, 2));

    } catch (error) {
        console.error("❌ ERROR CRÍTICO:", error);
    } finally {
        await browser.close();
        console.log("👋 Navegador cerrado.");
    }
}

const partidaArg = process.argv[2];
if (!partidaArg) {
    console.log("Uso: node debug_adrema.js <PARTIDA>");
} else {
    testScraping(partidaArg);
}
