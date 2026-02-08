const fs = require('fs');

const watcherPath = './watcher.js';
let content = fs.readFileSync(watcherPath, 'utf8');

const newFunction = `// ============================================================
// NUEVO ROBOT PROVINCIAL (DGC CORRIENTES)
// ============================================================
async function escrapearProvincia(adrema) {
    console.log(\`🌍 Iniciando trámite provincial (DGC) para: \${adrema}\`);
    
    // Configurar descarga
    const downloadPath = path.resolve(OUTPUT_FOLDER); 
    
    // MODO VISIBLE SOLICITADO POR USUARIO
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
        
        console.log("   > Logueando...");
        await page.type('input[name="user"]', 'arneaz90'); 
        await page.click('input[name="password"]'); 
        await page.type('input[name="password"]', 'dani1204');
        await page.click('button[type="submit"]');
        
        // 3. Popup "Cambia la Contraseña" o similar -> "Aceptar"
        await delay(4000); 
        console.log("   > Gestionando Popups (Contraseña/Bienvenida)...");
        
        const btnAccion = await page.evaluateHandle(() => {
            const botones = Array.from(document.querySelectorAll('button, div, a'));
            return botones.find(el => {
                const txt = el.innerText.trim().toLowerCase();
                return txt === 'aceptar' || txt === 'guardar';
            });
        });
        if (btnAccion && btnAccion.asElement()) {
            console.log("   > Click en Popup Accion (Aceptar/Guardar)");
            await btnAccion.asElement().click();
        }

        // 5. Popup "Bienvenido" -> Cerrar con 'X'
        try {
            await page.waitForSelector('.close, [data-dismiss="modal"], .modal-close', { visible: true, timeout: 5000 });
            await page.click('.close, [data-dismiss="modal"], .modal-close');
            console.log("   > Modal Bienvenida cerrado.");
        } catch (e) {
            console.log("   > No se detectó modal de bienvenida (o ya se cerró).");
        }
        
        // 6. Ingresar Adrema
        console.log("   > Buscando Adrema...");
        const inputAdrema = await page.waitForSelector('input[placeholder*="Adrema"], input[type="text"]', { visible: true, timeout: 10000 });
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

        // 8. y 9. Descarga de Mensura
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
                    el.classList.contains('fa-download') || 
                    el.innerText.toLowerCase().includes('descargar')
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
        try {
            await page.screenshot({ path: path.join(OUTPUT_FOLDER, 'debug_provincia_error.png') });
        } catch (sErr) {}
        return { titulares: "Error", superficieDGC: "0" };
    } finally {
        await browser.close();
        if (mensuraFilename) {
             try {
                const files = fs.readdirSync(OUTPUT_FOLDER).filter(f => f.endsWith('.pdf') && !f.startsWith('Informe_') && !f.startsWith('Mensura_'));
                // Sort by time descending (newest first) to get the downloaded file
                files.sort((a, b) => {
                    return fs.statSync(path.join(OUTPUT_FOLDER, b)).mtimeMs - fs.statSync(path.join(OUTPUT_FOLDER, a)).mtimeMs;
                });
                
                if (files.length > 0) {
                     const oldName = files[0];
                     const newName = \`Mensura_\${adrema}.pdf\`;
                     const oldPath = path.join(OUTPUT_FOLDER, oldName);
                     const newPath = path.join(OUTPUT_FOLDER, newName);
                     if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
                     fs.renameSync(oldPath, newPath);
                     console.log(\`   > 📄 Mensura renombrada a \${newName}\`);
                }
             } catch(e) { console.error("Error gestion archivo mensura:", e); }
        }
    }
}
`;

// Find start and end indexes
const startMarker = "async function escrapearProvincia(adrema) {";
const endMarker = "// 2. GENERADORES GRÁFICOS";

const startIndex = content.indexOf(startMarker);
// We want to replace from the SECTION HEADER actually to be cleaner, or just the function.
// Previous header was "// NUEVO ROBOT PROVINCIAL..." around line 336.
const headerIndex = content.lastIndexOf("// ============================================================", startIndex);
// The header spans 3 lines. Let's find the start of the "async function" and back up to the header.

if (startIndex === -1) {
    console.error("Could not find start marker");
    process.exit(1);
}

// Find the end marker (Generadores Graficos starts after)
const endIndex = content.indexOf(endMarker, startIndex);

if (endIndex === -1) {
    console.error("Could not find end marker");
    process.exit(1);
}

// We need to back up from startIndex to include the header comments if we want to replace them cleanly
// The script provided replacement content INCLUDES the header comments.
// So we should replace FROM headerIndex TO endIndex (exclusive of endIndex's header lines that might overlap? No, endMarker is "2. GENERADORES...")

// The endMarker is "// 2. GENERADORES GRÁFICOS"
// We want to insert BEFORE that.
// But we need to verify if there's a header line before that marker we should consume?
// In file: 
// 410: // ============================================================
// 411: // 2. GENERADORES GRÁFICOS

// So we should find the index of the separator line before "2. GENERADORES..."
const separatorBeforeEnd = content.lastIndexOf("// ============================================================", endIndex);

const replaceStart = headerIndex;
// We want to replace up to the start of the NEXT section's header
const replaceEnd = separatorBeforeEnd;

const finalContent = content.substring(0, replaceStart) + newFunction + "\n" + content.substring(replaceEnd);

fs.writeFileSync(watcherPath, finalContent);
console.log("Replacement successful!");
