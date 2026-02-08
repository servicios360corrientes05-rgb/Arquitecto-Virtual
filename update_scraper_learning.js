const fs = require('fs');
const watcherPath = './watcher.js';
let content = fs.readFileSync(watcherPath, 'utf8');

// 1. Inyectar Flags de Supresión de Chrome (Si no estaban ya)
const targetArgs = "args: ['--start-maximized']";
const safeArgs = "args: ['--start-maximized', '--disable-features=PasswordLeakDetection', '--disable-save-password-bubble', '--no-default-browser-check']";
if (!content.includes('PasswordLeakDetection')) {
    content = content.replace(targetArgs, safeArgs);
}

// 2. Reemplazar Lógica de Cierre de Modal Bienvenida con selector capturado
// Buscamos el bloque try-catch del modal
// Patrón: // 5. Popup "Bienvenido" ...
const closeModalBlockVIEJO = `
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
        }`;

const closeModalBlockNUEVO = `
        // 5. Popup "Bienvenido" -> Cerrar con SELECTOR APRENDIDO
        try {
            await delay(2000); // Espera prudente
            // Selector específico capturado en sesión manual
            const selectorClose = 'span.fa.fa-close'; 
            const closeBtn = await page.$(selectorClose);
            if (closeBtn) {
                 console.log("   > 🎯 Clic en cerrar Modal Bienvenida (Aprendido)");
                 await closeBtn.click();
            } else {
                 console.log("   > Modal Bienvenida no detectado (o ya cerrado).");
            }
        } catch (e) { console.log("   > Skip modal bienvenida."); }`;

// Intentamos reemplazo inteligente (regex simple)
content = content.replace(/\/\/ 5\. Popup "Bienvenido"[\s\S]*?catch \(e\) \{\s*\/\/ No es critico\s*\}/, closeModalBlockNUEVO);


// 3. Reemplazar Selector de Adrema con #search-pattern
// Patrón: // 6. Ingresar Adrema ...
const searchBlockVIEJO = `
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
        }`;

const searchBlockNUEVO = `
        // 6. Ingresar Adrema (Selector Aprendido: #search-pattern)
        console.log("   > Buscando Adrema en #search-pattern...");
        try {
            // Esperamos explícitamente el ID capturado
            const inputAdrema = await page.waitForSelector('#search-pattern', { visible: true, timeout: 15000 });
            await inputAdrema.click({ clickCount: 3 });
            await inputAdrema.type(adrema);
            await page.keyboard.press('Enter');
        } catch (e) {
            console.error("❌ Fallo buscando #search-pattern. Reintentando genérico...");
            try {
                const inputGen = await page.waitForSelector('input[type="text"]', {visible:true});
                await inputGen.type(adrema);
                await page.keyboard.press('Enter');
            } catch(ex) { throw e; }
        }`;

// Reemplazo regex mas laxa para capturar variaciones anteriores
content = content.replace(/\/\/ 6\. Ingresar Adrema[\s\S]*?catch \(e\) \{\s*await reportarError\('BusquedaAdrema', e, page\);\s*throw e;\s*\}/, searchBlockNUEVO);
// Si el anterior script de repair usaba una estructura ligeramente distinta, el replace podría fallar.
// Vamos a asegurar el reemplazo buscando cadenas clave.

// Fallback manual replace si regex falla (por espacios o cambios previos)
if (!content.includes('#search-pattern')) {
    // Intentamos buscar por el log
    const markerStart = '// 6. Ingresar Adrema';
    const markerEnd = 'console.log("   > Esperando resultados...");';
    const idxStart = content.indexOf(markerStart);
    const idxEnd = content.indexOf(markerEnd);

    if (idxStart !== -1 && idxEnd !== -1) {
        const pre = content.substring(0, idxStart);
        const post = content.substring(idxEnd);
        content = pre + searchBlockNUEVO + '\n\n' + '        ' + post;
    }
}

// 4. ELIMINAR CAJA DE REPARACIÓN (Ya no es necesaria con Suppression Flags)
// El bloque de "CAJA DE REPARACIÓN DINÁMICA" es enorme. Vamos a simplificarlo.
// Si tenemos suppression, el login es directo.
// Buscamos desde "await page.click('#loginbtn');" hasta "// 5. Popup"
const loginBtnMarker = "await page.click('#loginbtn');";
const popupMarker = "// 5. Popup";

const idxLogin = content.indexOf(loginBtnMarker);
const idxPopup = content.indexOf(popupMarker, idxLogin);

if (idxLogin !== -1 && idxPopup !== -1) {
    const pre = content.substring(0, idxLogin + loginBtnMarker.length);
    const post = content.substring(idxPopup);
    // Inyectamos sólo una espera simple, borrando todo el bloque de rescate complejo
    content = pre + '\n        console.log("   > Login enviado. Esperando navegación (Suppression Active)...");\n        await delay(5000);\n\n' + post;
}

fs.writeFileSync(watcherPath, content);
console.log("Watcher updated based on Learning Session!");
