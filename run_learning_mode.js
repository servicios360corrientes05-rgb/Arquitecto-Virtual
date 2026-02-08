const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FOLDER = path.resolve('./assets/debug');
if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runLearningMode() {
    console.log("🎙️ INICIANDO MODO APRENDIZAJE Y GRABACIÓN DINÁMICA");
    console.log("   > Archivo destino: assets/debug/Protocolo_Manual_DGC.json");
    console.log("   > Tiempo de Grabación: 60 segundos");

    // NOTA: No usamos flags de supresión para permitir que el usuario interactúe con TODO lo que aparezca.
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized'] // Sin flags de bloqueo de password para ver el popup original
    });

    const page = await browser.newPage();

    // Array para guardar eventos
    let sessionEvents = [];

    // Exponer función para recibir eventos del navegador
    await page.exposeFunction('recordEvent', (eventData) => {
        console.log(`   🔴 [REC] Clic detectado: ${eventData.selector} ("${eventData.text}") @ (${eventData.x}, ${eventData.y})`);
        sessionEvents.push({
            timestamp: new Date().toISOString(),
            ...eventData
        });
    });

    // Inyectar listener en el documento
    await page.evaluateOnNewDocument(() => {
        document.addEventListener('click', (e) => {
            const el = e.target;

            // Construir selector CSS aproximado
            let selector = el.tagName.toLowerCase();
            if (el.id) selector += `#${el.id}`;
            if (el.className && typeof el.className === 'string') selector += `.${el.className.split(' ').join('.')}`;

            // Subir info a Node
            window.recordEvent({
                type: 'click',
                x: e.clientX,
                y: e.clientY,
                selector: selector,
                tagName: el.tagName,
                id: el.id,
                className: el.className,
                text: el.innerText ? el.innerText.substring(0, 50).replace(/\n/g, ' ') : '',
                html: el.outerHTML.substring(0, 100)
            });
        }, true);
    });

    try {
        console.log("   > Navegando a DGC...");
        await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });

        console.log("🟢 SISTEMA DE ESCUCHA ACTIVO. Por favor, opera manualmente ahora.");
        console.log("   > Tienes 60 segundos.");

        // Cuenta regresiva visual
        for (let i = 60; i > 0; i--) {
            if (i % 10 === 0) console.log(`   ... Quedan ${i} segundos ...`);
            await delay(1000);
        }

        console.log("🔴 TIEMPO CUMPLIDO. Guardando sesión...");

        const filePath = path.join(OUTPUT_FOLDER, 'Protocolo_Manual_DGC.json');
        fs.writeFileSync(filePath, JSON.stringify(sessionEvents, null, 2));

        console.log(`✅ Sesión guardada con ${sessionEvents.length} eventos.`);
        console.log(`   > Archivo: ${filePath}`);

    } catch (err) {
        console.error("❌ Error en Sesión de Grabación:", err);
    } finally {
        console.log("⚠️ FIN DE GRABACIÓN. Cerrando navegador...");
        await browser.close();
    }
}

runLearningMode();
