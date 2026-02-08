const fs = require('fs');
const watcherPath = './watcher.js';
let content = fs.readFileSync(watcherPath, 'utf8');

const finalFunction = `// ============================================================
// NUEVO ROBOT PROVINCIAL (DGC CORRIENTES)
// ============================================================
async function escrapearProvincia(adrema) {
    console.log(\`🌍 Iniciando trámite provincial (DGC) para: \${adrema}\`);
    
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

    let mensuraFilename = null;

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });
        
        console.log("   > Logueando con selectores validados...");
        // Selectores capturados en Modo Aprendizaje
        await page.waitForSelector('#Login', {visible: true, timeout: 10000}); 
        await page.type('#Login', 'arneaz90'); 
        
        await page.waitForSelector('#Password', {visible: true});
        // Click para asegurar foco si hace falta
        await page.click('#Password');
        await page.type('#Password', 'dani1204');
        
        await page.click('#loginbtn');
        
        // --- MANEJO HÍBRIDO DE POP-UPS ---
        console.log('   > Esperando pop-up de contraseña...');
        await delay(5000); 

        // Intento 1: Clic por coordenadas (ajustado a tu pantalla)
        console.log('   > Intento 1: Clic por coordenadas (778, 304)...');
        try { await page.mouse.click(778, 304); } catch(e) {}
        await delay(1500);

        // Fallback Texto
        const modalSigueVisible = await page.evaluate(() => {
             const bodyTxt = document.body.innerText;
             return bodyTxt.includes('Cambia tu contraseña') || bodyTxt.includes('Guardar la contraseña');
        });

        if (modalSigueVisible) {
            console.log('   ⚠️ El modal sigue visible. Buscando botón Aceptar...');
            const btnAceptar = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button, div')).find(el => el.innerText.trim() === 'Aceptar' || el.innerText.trim() === 'Guardar');
            });
            if (btnAceptar && btnAceptar.asElement()) {
                await btnAceptar.asElement().click();
            }
        }

        // 5. Popup "Bienvenido" -> Cerrar con 'X'
        try {
            await delay(2000);
            const closeBtn = await page.$('.close, [data-dismiss="modal"], .modal-close');
            if (closeBtn) await closeBtn.click();
        } catch (e) {}
        
        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 15000 });
        await inputAdrema.click({ clickCount: 3 });
        await inputAdrema.type(adrema);
        await page.keyboard.press('Enter');
        
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
                 superficie = filas[6]?.innerText.match(/Superficie:\\s*([\\d.,]+)/)?.[1] || "0";
            } else {
                 const allDivs = Array.from(document.querySelectorAll('div'));
                 const tDiv = allDivs.find(d => d.innerText.includes('Titulares:'));
                 const sDiv = allDivs.find(d => d.innerText.includes('Superficie:'));
                 if (tDiv) titulares = tDiv.innerText.split('Titulares:')[1].split('/')[0].trim();
                 if (sDiv) superficie = sDiv.innerText.match(/Superficie:\\s*([\\d.,]+)/)?.[1];
            }

            return { titulares, superficieDGC: superficie };
        });
        console.log("   > Datos Provincia Extraídos:", data);

        // 8. Mensura
        console.log("   > Intentando descargar mensura...");
        const mensuraClickSuccess = await page.evaluate(async () => {
             const allElements = Array.from(document.querySelectorAll('div, span, p, label'));
             const mensuraEl = allElements.find(el => /\\b\\d{1,6}-[A-Z]\\b/.test(el.innerText) && el.innerText.length < 15);
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

        return { ...data, mensuraDownloaded: !!mensuraFilename };

    } catch (err) {
        console.error("❌ Error Provincia:", err.message);
        // await browser.close(); 
        return { titulares: "Error", superficieDGC: "0" };
    } finally {
        console.log("⚠️ FIN PROVINCIA.");
        await browser.close(); 
    }
}
`;

const startMarker = "async function escrapearProvincia(adrema) {";
const endMarker = "// 2. GENERADORES GRÁFICOS";

const startIndex = content.indexOf(startMarker);
// Backtrack to header
const headerIndex = content.lastIndexOf("// ============================================================", startIndex);
// Find end separator
const separatorBeforeEnd = content.lastIndexOf("// ============================================================", content.indexOf(endMarker));

if (startIndex === -1 || separatorBeforeEnd === -1) {
    console.error("Markers not found");
    process.exit(1);
}

// Remove previously duplicated headers if any or ensure clean replacement
const finalContent = content.substring(0, headerIndex) + finalFunction + "\\n\\n" + content.substring(separatorBeforeEnd);

fs.writeFileSync(watcherPath, finalContent);
console.log("Final Scraper Updated with Validated Selectors!");
