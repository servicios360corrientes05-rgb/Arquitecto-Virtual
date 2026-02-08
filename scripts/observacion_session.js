/**
 * SESIÓN DE APRENDIZAJE POR OBSERVACIÓN
 * ======================================
 * Abre el navegador VISIBLE, navega a DGC, y graba todos los eventos
 * mientras el usuario opera manualmente.
 *
 * Registra: clics, requests de red (PDFs), pestañas nuevas, descargas, selectores.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const OUTPUT_FOLDER = path.resolve('./public/informes');
const DEBUG_FOLDER = path.resolve('./assets/debug');
const LOG_FILE = path.join(DEBUG_FOLDER, 'observacion_log.json');

if (!fs.existsSync(DEBUG_FOLDER)) fs.mkdirSync(DEBUG_FOLDER, { recursive: true });

const eventLog = [];
function log(tipo, data) {
    const entry = { timestamp: new Date().toISOString(), tipo, ...data };
    eventLog.push(entry);
    console.log(`[${tipo}] ${JSON.stringify(data)}`);
}

(async () => {
    console.log('='.repeat(70));
    console.log('  SESIÓN DE APRENDIZAJE POR OBSERVACIÓN');
    console.log('  Adrema objetivo: A10020941');
    console.log('='.repeat(70));
    console.log('');
    console.log('🟢 Abriendo navegador VISIBLE...');

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized'],
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: path.resolve('./data/chrome_profile_provincia'),
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    // --- CDP para monitorear descargas ---
    const cdp = await page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_FOLDER,
    });
    console.log('🛡️ CDP configurado. Descargas irán a:', OUTPUT_FOLDER);

    // --- GRABACIÓN DE EVENTOS DE RED ---
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const url = req.url();
        // Registrar solo requests relevantes (PDFs, documentos, APIs)
        if (url.includes('.pdf') || url.includes('documento') || url.includes('mensura')
            || url.includes('download') || url.includes('archivo') || url.includes('plano')) {
            log('REQUEST', { method: req.method(), url, resourceType: req.resourceType() });
        }
        req.continue();
    });

    page.on('response', async (res) => {
        const url = res.url();
        const headers = res.headers();
        const contentType = headers['content-type'] || '';
        // Registrar respuestas PDF o de descarga
        if (contentType.includes('pdf') || contentType.includes('octet-stream')
            || url.includes('.pdf') || url.includes('download') || url.includes('documento')) {
            log('RESPONSE_PDF', {
                url,
                status: res.status(),
                contentType,
                contentDisposition: headers['content-disposition'] || 'N/A',
                contentLength: headers['content-length'] || 'N/A',
            });
        }
    });

    // --- GRABACIÓN DE CONSOLA DEL NAVEGADOR ---
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('mensura') || text.includes('download') || text.includes('pdf')
            || text.includes('documento') || text.includes('plano')) {
            log('CONSOLE', { message: text });
        }
    });

    // --- DETECCIÓN DE PESTAÑAS NUEVAS ---
    browser.on('targetcreated', async (target) => {
        const url = target.url();
        const type = target.type();
        log('NUEVA_PESTAÑA', { url, type });
        console.log(`\n🆕 ¡PESTAÑA NUEVA DETECTADA! tipo=${type} url=${url}\n`);

        if (type === 'page') {
            try {
                const newPage = await target.page();
                if (newPage) {
                    // Configurar CDP en la pestaña nueva también
                    try {
                        const newCdp = await newPage.target().createCDPSession();
                        await newCdp.send('Page.setDownloadBehavior', {
                            behavior: 'allow',
                            downloadPath: OUTPUT_FOLDER,
                        });
                    } catch (e) {}

                    // Monitorear la URL final de la pestaña nueva
                    newPage.on('load', () => {
                        log('PESTAÑA_CARGADA', { url: newPage.url() });
                        console.log(`   📄 Pestaña cargó: ${newPage.url()}`);
                    });

                    // Esperar un poco y registrar la URL
                    setTimeout(async () => {
                        try {
                            const finalUrl = newPage.url();
                            log('PESTAÑA_URL_FINAL', { url: finalUrl });
                            console.log(`   📄 URL final de pestaña nueva: ${finalUrl}`);
                        } catch (e) {}
                    }, 5000);
                }
            } catch (e) {}
        }
    });

    browser.on('targetdestroyed', (target) => {
        log('PESTAÑA_CERRADA', { url: target.url(), type: target.type() });
    });

    // --- INYECCIÓN DE TRACKER DE CLICS EN LA PÁGINA ---
    async function inyectarTracker(pg) {
        try {
            await pg.evaluate(() => {
                if (window.__obsTracker) return;
                window.__obsTracker = true;
                document.addEventListener('click', (e) => {
                    const el = e.target;
                    const info = {
                        tag: el.tagName,
                        id: el.id || '',
                        class: el.className || '',
                        title: el.title || el.getAttribute('title') || '',
                        href: el.href || '',
                        text: (el.innerText || '').substring(0, 100),
                        onclick: el.getAttribute('onclick') || '',
                        parentTag: el.parentElement ? el.parentElement.tagName : '',
                        parentClass: el.parentElement ? (el.parentElement.className || '') : '',
                        parentHref: el.parentElement ? (el.parentElement.href || '') : '',
                        x: e.clientX,
                        y: e.clientY,
                    };
                    console.log('__OBS_CLICK__:' + JSON.stringify(info));
                }, true);

                // También capturar hovers sobre elementos con fa-external-link
                document.addEventListener('mouseover', (e) => {
                    const el = e.target;
                    const cls = el.className || '';
                    if (cls.includes('fa-external') || cls.includes('opcion') || cls.includes('download')
                        || cls.includes('documento') || cls.includes('file')) {
                        console.log('__OBS_HOVER__:' + JSON.stringify({
                            tag: el.tagName, class: cls, title: el.title || '',
                            href: el.href || '', parentTag: el.parentElement?.tagName || '',
                            parentClass: el.parentElement?.className || '',
                        }));
                    }
                }, true);
            });
        } catch (e) {}
    }

    // Capturar logs del tracker de clics
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.startsWith('__OBS_CLICK__:')) {
            const data = JSON.parse(text.replace('__OBS_CLICK__:', ''));
            log('CLICK_USUARIO', data);
            console.log(`\n🖱️  CLICK DETECTADO: <${data.tag}> class="${data.class}" title="${data.title}" href="${data.href}" text="${data.text}"\n`);
        }
        if (text.startsWith('__OBS_HOVER__:')) {
            const data = JSON.parse(text.replace('__OBS_HOVER__:', ''));
            log('HOVER_RELEVANTE', data);
        }
    });

    // --- MONITOREO DE ARCHIVOS DESCARGADOS ---
    const archivosIniciales = fs.readdirSync(OUTPUT_FOLDER);
    const checkInterval = setInterval(() => {
        const actuales = fs.readdirSync(OUTPUT_FOLDER);
        const nuevos = actuales.filter(f => !archivosIniciales.includes(f));
        if (nuevos.length > 0) {
            nuevos.forEach(f => {
                if (!eventLog.find(e => e.tipo === 'ARCHIVO_NUEVO' && e.archivo === f)) {
                    const size = fs.statSync(path.join(OUTPUT_FOLDER, f)).size;
                    log('ARCHIVO_NUEVO', { archivo: f, size, sizeKB: (size / 1024).toFixed(1) });
                    console.log(`\n📥 ¡ARCHIVO NUEVO DETECTADO! ${f} (${(size / 1024).toFixed(1)} KB)\n`);
                    archivosIniciales.push(f);
                }
            });
        }
    }, 2000);

    // --- NAVEGACIÓN A DGC ---
    console.log('');
    console.log('🌐 Navegando a https://dgc.corrientes.gob.ar/webapp/ ...');
    await page.goto('https://dgc.corrientes.gob.ar/webapp/', { waitUntil: 'networkidle2' });
    console.log('✅ Página cargada.');

    // Inyectar tracker
    await inyectarTracker(page);

    // Re-inyectar tracker en cada navegación
    page.on('load', async () => {
        await inyectarTracker(page);
    });

    console.log('');
    console.log('='.repeat(70));
    console.log('  🎯 NAVEGADOR LISTO - ESPERANDO TUS MOVIMIENTOS');
    console.log('  ');
    console.log('  Realizá manualmente:');
    console.log('  1. Login (si es necesario)');
    console.log('  2. Buscar A10020941');
    console.log('  3. Hover/click en cada mensura (18505-U, 26753-U, 29864-U)');
    console.log('  4. Descargar los 3 PDFs');
    console.log('  ');
    console.log('  Estoy grabando: clics, requests, pestañas, descargas.');
    console.log('  Cuando termines, CERRÁ EL NAVEGADOR y generaré el informe.');
    console.log('='.repeat(70));
    console.log('');

    // --- ESPERAR CIERRE DEL NAVEGADOR ---
    await new Promise((resolve) => {
        browser.on('disconnected', resolve);
    });

    clearInterval(checkInterval);

    // --- GENERAR INFORME DE CLONACIÓN ---
    console.log('');
    console.log('='.repeat(70));
    console.log('  📋 INFORME DE CLONACIÓN - SESIÓN FINALIZADA');
    console.log('='.repeat(70));
    console.log('');

    // Guardar log completo
    fs.writeFileSync(LOG_FILE, JSON.stringify(eventLog, null, 2));
    console.log(`💾 Log completo guardado en: ${LOG_FILE}`);
    console.log(`   Total de eventos registrados: ${eventLog.length}`);
    console.log('');

    // Resumen por tipo
    const tipos = {};
    eventLog.forEach(e => { tipos[e.tipo] = (tipos[e.tipo] || 0) + 1; });
    console.log('📊 RESUMEN POR TIPO DE EVENTO:');
    Object.entries(tipos).forEach(([tipo, count]) => {
        console.log(`   ${tipo}: ${count}`);
    });
    console.log('');

    // Clicks relevantes
    const clicks = eventLog.filter(e => e.tipo === 'CLICK_USUARIO');
    if (clicks.length > 0) {
        console.log('🖱️  CLICKS REGISTRADOS:');
        clicks.forEach((c, i) => {
            console.log(`   [${i + 1}] <${c.tag}> class="${c.class}" title="${c.title}" href="${c.href}" text="${c.text}"`);
        });
        console.log('');
    }

    // Pestañas nuevas
    const tabs = eventLog.filter(e => e.tipo === 'NUEVA_PESTAÑA' || e.tipo === 'PESTAÑA_URL_FINAL');
    if (tabs.length > 0) {
        console.log('🆕 PESTAÑAS NUEVAS:');
        tabs.forEach((t, i) => {
            console.log(`   [${i + 1}] ${t.tipo}: ${t.url}`);
        });
        console.log('');
    }

    // PDFs detectados en red
    const pdfs = eventLog.filter(e => e.tipo === 'RESPONSE_PDF' || e.tipo === 'REQUEST');
    if (pdfs.length > 0) {
        console.log('📄 REQUESTS/RESPONSES DE PDFs:');
        pdfs.forEach((p, i) => {
            console.log(`   [${i + 1}] ${p.tipo}: ${p.url} (${p.contentType || p.method})`);
        });
        console.log('');
    }

    // Archivos descargados
    const archivos = eventLog.filter(e => e.tipo === 'ARCHIVO_NUEVO');
    if (archivos.length > 0) {
        console.log('📥 ARCHIVOS DESCARGADOS:');
        archivos.forEach((a, i) => {
            console.log(`   [${i + 1}] ${a.archivo} (${a.sizeKB} KB)`);
        });
        console.log('');
    }

    // Hovers relevantes
    const hovers = eventLog.filter(e => e.tipo === 'HOVER_RELEVANTE');
    if (hovers.length > 0) {
        console.log('🎯 HOVERS SOBRE ELEMENTOS RELEVANTES:');
        const unique = [];
        hovers.forEach(h => {
            const key = `${h.tag}_${h.class}`;
            if (!unique.find(u => u.key === key)) {
                unique.push({ key, ...h });
                console.log(`   <${h.tag}> class="${h.class}" title="${h.title}" parentClass="${h.parentClass}"`);
            }
        });
        console.log('');
    }

    console.log('='.repeat(70));
    console.log('  FIN DEL INFORME. Revisá el log completo en:');
    console.log(`  ${LOG_FILE}`);
    console.log('='.repeat(70));

})().catch(err => {
    console.error('Error fatal:', err);
    // Guardar lo que tengamos
    fs.writeFileSync(LOG_FILE, JSON.stringify(eventLog, null, 2));
    console.log(`💾 Log parcial guardado en: ${LOG_FILE}`);
});
