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

        // Verificacion simple: Si aparece el popup, fallamos. Si no, seguimos.
        // OJO: Si el flag funciona, NO DEBERÍA aparecer.

        // Pero por si acaso, mantenemos la lógica de clic ciega de "Aceptar" si algo aparece
        // Intentaremos cerrar el modal de "Bienvenido" si aparece
        try {
            const closeBtn = await page.$('.close, [data-dismiss="modal"], .modal-close');
            if (closeBtn) {
                console.log("   > Modal Bienvenida detectado. Cerrando...");
                await closeBtn.click();
            }
        } catch (e) { }

        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 10000 });
        console.log("   ✅ ¡LOGIN LIMPIO! No hubo bloqueo de Chrome.");

        await inputAdrema.click({ clickCount: 3 });
        await inputAdrema.type(adrema);
        await page.keyboard.press('Enter');

        console.log("   > Resultados Adrema solicitados.");
        await delay(5000);

    } catch (err) {
        console.error("❌ Error General:", err.message);
        console.log("📸 Si ves el popup de 'Contraseña' ahora, significa que los flags no fueron suficientes.");
    } finally {
        console.log("⚠️ FIN TEST FIX. Revisar pantalla.");
    }
}

escrapearProvincia('A10169791');
