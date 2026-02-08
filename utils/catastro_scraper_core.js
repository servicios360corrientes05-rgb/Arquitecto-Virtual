const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * Módulo Estandarizado para Scraping de Catastro (DGC Corrientes)
 * Implementa el patrón: Perfil Limpio + Caja de Reparación + Selectores Grabados + Reglas de Oro
 */
class CatastroScraper {
    constructor(options = {}) {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.outputFolder = options.outputFolder || path.resolve(__dirname, '../public/informes');
        this.debugFolder = options.debugFolder || path.resolve(__dirname, '../assets/debug');

        // Ensure folders exist
        if (!fs.existsSync(this.outputFolder)) fs.mkdirSync(this.outputFolder, { recursive: true });
        if (!fs.existsSync(this.debugFolder)) fs.mkdirSync(this.debugFolder, { recursive: true });
    }

    async launch() {
        console.log("[CatastroScraper] Lanzando Navegador (Perfil Limpio)...");
        this.browser = await chromium.launch({
            headless: false,
            channel: 'chrome',
            slowMo: 50,
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });

        this.context = await this.browser.newContext({
            viewport: null,
            acceptDownloads: true,
            ignoreHTTPSErrors: true
        });

        this.page = await this.context.newPage();
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    // REGLA DE ORO: Usuario Primero, luego Contraseña
    async login(user, pass) {
        console.log("[CatastroScraper] Capa 1: Login (Secuencia Estricta)...");
        await this.page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle', timeout: 60000 });

        // 1. Wait/Fill User
        const userInput = this.page.locator('#Login');
        await userInput.waitFor({ state: 'visible', timeout: 10000 });
        await userInput.click();
        await userInput.fill('');
        await this.page.waitForTimeout(100);
        await userInput.type(user, { delay: 100 });

        await this.page.waitForTimeout(500);

        // 2. Fill Pass
        const passInput = this.page.locator('#Password');
        await passInput.click();
        await passInput.fill(pass);

        // 3. Submit
        await this.page.waitForTimeout(500);
        await this.page.click('#loginbtn', { force: true });

        console.log("Esperando Dashboard...");
        await this.page.waitForURL(/.*(Index|Home|Map).*/, { timeout: 60000 });
        console.log("Dashboard cargado.");
        await this.page.waitForTimeout(3000);
    }

    async applyRepairBox() {
        // ... (Same logic as before, abbreviated here for brevity but assuming same effect)
        const page = this.page;
        try {
            if ((await page.innerText('body')).includes('Cambia tu contraseña')) await page.click('text=Aceptar');
        } catch (e) { }
        try {
            const closeBtn = await page.locator('.close, [data-dismiss="modal"]').first();
            if (await closeBtn.isVisible()) await closeBtn.click();
        } catch (e) { }
        // Aggressive modalInfoProvisoria handling
        const infoModal = page.locator('#modalInfoProvisoria');
        if (await infoModal.isVisible()) {
            const btn = infoModal.locator('button, [data-dismiss="modal"]').first();
            if (await btn.isVisible()) await btn.click();
            await page.keyboard.press('Escape');
            await infoModal.waitFor({ state: 'hidden', timeout: 5000 });
        }
    }

    async searchAdrema(adrema) {
        console.log(`[CatastroScraper] Buscando Adrema: ${adrema}`);
        const searchInput = this.page.locator('#search-pattern');
        await searchInput.waitFor({ state: 'visible' });
        await searchInput.click();
        await searchInput.fill('');
        await this.page.waitForTimeout(500);
        await searchInput.type(adrema, { delay: 150 });
        await this.page.waitForTimeout(500);
        await searchInput.press('Enter');

        // Wait for results
        await this.page.waitForSelector('#search-results .panel-body', { timeout: 30000 });
    }

    // REGLA DE ORO: Persistencia en Descarga
    async downloadMensura(adrema) {
        console.log("[CatastroScraper] Iniciando Descarga...");

        // 1. Mensura Item (Fila visual 3)
        const mensuraItem = this.page.locator('.mensuras span.ng-binding').filter({ hasText: /^\d{1,6}-[A-Z]$/ }).first();
        await mensuraItem.waitFor({ state: 'visible', timeout: 10000 });

        // 2. Hover Row
        const mensuraRow = mensuraItem.locator('xpath=./ancestor::div[contains(@class, "srow")]');
        await mensuraRow.hover();
        await this.page.waitForTimeout(1000);

        // 3. Click 'Ver Documento'
        const viewDocBtn = mensuraRow.locator('[title="Ver Documento"]').first();
        await viewDocBtn.click();

        // 4. Poll for Download Button (30s)
        console.log("Buscando botón de descarga en modal (Polling 30s)...");
        const downloadBtnSelector = '#btnDescargar, .modal.in .fa-desktop, [title="Descargar"], [title="Descarga"]';

        let downloadBtn = null;
        const pollStartTime = Date.now();
        let found = false;

        while (Date.now() - pollStartTime < 30000) {
            try {
                downloadBtn = this.page.locator(downloadBtnSelector).first();
                if (await downloadBtn.isVisible()) {
                    found = true;
                    break;
                }
            } catch (e) { }
            await this.page.waitForTimeout(2000);
        }

        if (!found) throw new Error("Botón de descarga no encontrado tras 30s.");

        console.log("Botón encontrado. Clickeando...");
        const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
        await downloadBtn.click();
        const download = await downloadPromise;

        const finalPath = path.join(this.outputFolder, `Mensura_${adrema}.pdf`);
        await download.saveAs(finalPath);
        console.log(`Guardado: ${finalPath}`);
        return finalPath;
    }
}

module.exports = CatastroScraper;
