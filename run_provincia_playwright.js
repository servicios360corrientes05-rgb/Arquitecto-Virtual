const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- CONFIGURACIÓN ESTÁNDAR "BRILLANTE" ---
const CREDENTIALS = { user: 'arneaz90', pass: 'dani1204' };
const ADREMA = 'A10169791';
const OUTPUT_FOLDER = path.resolve('./public/informes');
const DEBUG_FOLDER = path.resolve('./assets/debug');
const MAX_RETRIES = 3;

// Asegurar directorios
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
if (!fs.existsSync(DEBUG_FOLDER)) fs.mkdirSync(DEBUG_FOLDER, { recursive: true });

async function logStep(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

(async () => {
    logStep("🚀 Iniciando Scraper - Versión Restaurada (Robustez Total)");

    let browser = null;
    try {
        browser = await chromium.launch({
            headless: false,
            channel: 'chrome',
            slowMo: 100,
            args: ['--start-maximized']
        });

        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();

        // 1. LOGIN (Regla: Secuencia Estricta)
        logStep("Capa 1: Login Humano...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/Account/Login', { waitUntil: 'load', timeout: 60000 });

        const userBox = page.locator('#Login'); // Selector más robusto que getByRole para este sitio
        await userBox.waitFor({ state: 'visible' });
        await userBox.fill('');
        await userBox.type(CREDENTIALS.user, { delay: 150 });
        await page.waitForTimeout(500);

        const passBox = page.locator('#Password');
        await passBox.fill(CREDENTIALS.pass, { delay: 100 });

        await page.click('#loginbtn', { force: true });

        logStep("Esperando Dashboard...");
        // Robustez: Esperamos cualquier indicador de carga exitosa (URL o Elemento)
        try {
            await Promise.race([
                page.waitForURL(/.*(Index|Home).*/, { timeout: 60000 }),
                page.waitForSelector('#search-pattern', { state: 'visible', timeout: 60000 })
            ]);
        } catch (e) { logStep("Tick de espera finalizado (procediendo)..."); }
        logStep("✅ Dashboard alcanzado.");

        // 2. CAJA DE REPARACIÓN (ROBUSTEZ TOTAL)
        logStep("Capa 2: Caja de Reparación (Anti-Bloqueo)...");
        await page.waitForTimeout(2000); // Esperar que aparezcan los popups

        // A. Cierre Genérico de Modales (Bienvenido / Info)
        const closeSelectors = [
            '.close',
            '[data-dismiss="modal"]',
            '.modal-close',
            '#modalInfoProvisoria button'
        ];

        for (const selector of closeSelectors) {
            try {
                const els = await page.locator(selector).all();
                for (const el of els) {
                    if (await el.isVisible()) {
                        await el.click();
                        logStep(`Popup cerrado usando: ${selector}`);
                        await page.waitForTimeout(500);
                    }
                }
            } catch (e) { }
        }

        // B. Escape de Seguridad
        await page.keyboard.press('Escape');

        // 3. BÚSQUEDA
        logStep(`Buscando Adrema: ${ADREMA}`);
        const searchBox = page.locator('#search-pattern');
        await searchBox.waitFor({ state: 'visible' });
        await searchBox.click();
        await searchBox.fill('');
        await page.waitForTimeout(300);
        await searchBox.type(ADREMA, { delay: 100 });
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');

        // 4. INTERACCIÓN CON MENSURA (REGLA DE ORO: Click en ícono dentro del recuadro rojo)
        logStep("Esperando resultados...");
        await page.waitForTimeout(5000);

        // Buscar el item de Mensura (ej: "3356-U")
        const mensuraItem = page.locator('.mensuras span.ng-binding').filter({ hasText: /^\d{1,6}-[A-Z]$/ }).first();
        await mensuraItem.waitFor({ state: 'visible', timeout: 30000 });

        logStep("Mensura encontrada. Haciendo HOVER para revelar íconos...");

        // Obtener el contenedor de la fila
        const mensuraRow = mensuraItem.locator('xpath=./ancestor::div[contains(@class, "srow")]');

        // *** PASO CRÍTICO: HOVER sobre la fila para que aparezcan los íconos ***
        await mensuraRow.hover();
        logStep("✅ Hover realizado. Esperando a que íconos se vuelvan visibles...");
        await page.waitForTimeout(1500); // Dar tiempo a la animación

        // CLICK PRECISO en el ícono de external-link (cuadrado con flecha)
        // Este ícono SOLO es visible después del hover
        const externalLinkIcon = mensuraRow.locator('.fa-external-link, .fa-share-square-o, [class*="external"], i.fa').first();

        try {
            await externalLinkIcon.waitFor({ state: 'visible', timeout: 5000 });
            await externalLinkIcon.click();
            logStep("✅ Click realizado en ícono de external-link. Esperando modal...");
        } catch (e) {
            logStep("⚠ Ícono no encontrado por clase. Intentando por título...");
            // Fallback: buscar por atributo title
            const titleIcon = mensuraRow.locator('[title*="Ver"], [title*="Abrir"], [title*="Documento"]').first();
            await titleIcon.click();
            logStep("✅ Click realizado por título. Esperando modal...");
        }

        // Esperar que aparezca el modal/visor
        await page.waitForTimeout(3000);


        // 5. DESCARGA DEL PDF
        logStep("Esperando botón de descarga en Modal...");

        try {
            const downloadButton = page.locator('#btnDescargar');
            await downloadButton.waitFor({ state: 'visible', timeout: 30000 });

            logStep("recibi el comando de descargar del usuario y lo ejecuto...");
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 60000 }),
                downloadButton.click(),
            ]);

            const finalPath = path.join(OUTPUT_FOLDER, `Mensura_${ADREMA}.pdf`);
            await download.saveAs(finalPath);
            logStep(`✅ Archivo guardado EXITOSAMENTE: ${finalPath}`);
            logStep(`Link: http://localhost:3000/informes/Mensura_${ADREMA}.pdf`);

        } catch (e) {
            logStep("❌ Error: Timeout esperando #btnDescargar. Intentando clickear la fila nuevamente...");

            // Fallback: Click the row itself again -> Sometimes this triggers the modal
            const mensuraItem = page.locator('.mensuras span.ng-binding').filter({ hasText: /^\d{1,6}-[A-Z]$/ }).first();
            await mensuraItem.click();
            await page.waitForTimeout(2000);

            // Retry button find
            const retryBtn = page.locator('#btnDescargar');
            if (await retryBtn.isVisible({ timeout: 5000 })) {
                const [dl] = await Promise.all([
                    page.waitForEvent('download'),
                    retryBtn.click()
                ]);
                await dl.saveAs(path.join(OUTPUT_FOLDER, `Mensura_${ADREMA}.pdf`));
                logStep("✅ Descarga exitosa tras reintento.");
            } else {
                logStep("❌ Falló definitivamente.");
                // Dump for debug
                const html = await page.content();
                fs.writeFileSync(path.join(DEBUG_FOLDER, 'debug_modal_fail_final.html'), html);
                throw e;
            }
        }

    } catch (error) {
        logStep(`❌ Error: ${error.message}`);
        const screenPath = path.join(DEBUG_FOLDER, `error_restaurado.png`);
        if (browser && browser.contexts()[0]?.pages()[0]) {
            await browser.contexts()[0].pages()[0].screenshot({ path: screenPath });
        }
    } finally {
        logStep("Proceso Finalizado.");
        if (browser) await browser.close(); // ✅ Cerrar navegador para evitar conflictos
    }
})();
