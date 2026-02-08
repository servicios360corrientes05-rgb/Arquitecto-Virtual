const fs = require('fs');
const watcherPath = './watcher.js';
let content = fs.readFileSync(watcherPath, 'utf8');

const hybridFunction = `// ============================================================
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
        console.log("   > Navegando a DGC (Espera extendida 5s)...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });
        await delay(5000); // Espera inicial extendida solicitada

        console.log("   > Logueando...");
        await page.type('input[name="user"]', 'arneaz90'); 
        await page.click('input[name="password"]'); 
        await page.type('input[name="password"]', 'dani1204');
        await page.click('button[type="submit"]');
        
        // --- MANEJO HÍBRIDO DE POP-UPS ---
        console.log('   > Esperando pop-up de contraseña...');
        await delay(4000); // Damos tiempo real a que cargue la web

        // Intento A: Clic por coordenadas (778, 304)
        console.log('   > Intento 1: Clic por coordenadas (778, 304)...');
        await page.mouse.click(778, 304); 
        await delay(1500);

        // Verificación y Fallback B: Búsqueda por Texto (Si el pop-up sigue ahí)
        // Buscamos si existe algun elemento que contenga "Cambia tu contraseña" o Boton Aceptar visible
        const modalSigueVisible = await page.evaluate(() => {
             const bodyTxt = document.body.innerText;
             return bodyTxt.includes('Cambia tu contraseña') || bodyTxt.includes('Guardar la contraseña');
        });

        if (modalSigueVisible) {
            console.log('   ⚠️ El modal sigue visible. Activando Fallback por Texto...');
            const btnAceptar = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button, div')).find(el => el.innerText.trim() === 'Aceptar' || el.innerText.trim() === 'Guardar');
            });
            if (btnAceptar && btnAceptar.asElement()) {
                console.log('   > Click Fallback Texto exitoso');
                await btnAceptar.asElement().click();
            }
        }

        // 5. Popup "Bienvenido" -> Cerrar con 'X'
        try {
            await delay(2000);
            const closeBtn = await page.$('.close, [data-dismiss="modal"], .modal-close');
            if (closeBtn) {
                 await closeBtn.click();
                 console.log("   > Modal Bienvenida cerrado.");
            }
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
        // NO CERRAR NAVEGADOR EN DEBUG VISUAL
        console.log("⚠️ MANTENIENDO NAVEGADOR ABIERTO PARA DEBUGGING VISUAL...");
        // await browser.close(); 
        return { titulares: "Error", superficieDGC: "0" };
    } finally {
        // En flujo normal cerramos, pero en este caso queremos ver el error si falla
        // Si todo salio bien, cerramos. Si hubo error (catch), ya lo manejamos arriba evitando el close.
        // Pero el finally corre siempre. Necesitamos un flag de error.
        // Simplificación: Cerramos solo si NO hubo error critico, o mejor, NO cerramos nunca en este test run.
        console.log("⚠️ FIN DE DATOS PROVINCIA. Navegador pemanece abierto para revisión.");
        // await browser.close(); 
    }
}
`;

const startMarker = "async function escrapearProvincia(adrema) {";
const endMarker = "// 2. GENERADORES GRÁFICOS";

const startIndex = content.indexOf(startMarker);
const headerIndex = content.lastIndexOf("// ============================================================", startIndex);
const separatorBeforeEnd = content.lastIndexOf("// ============================================================", content.indexOf(endMarker));

if (startIndex === -1 || separatorBeforeEnd === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const finalContent = content.substring(0, headerIndex) + hybridFunction + "\\n" + content.substring(separatorBeforeEnd);
fs.writeFileSync(watcherPath, finalContent);
console.log("Hybrid Scraper Updated!");
