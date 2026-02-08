/**
 * GENERADOR DE REPORTE UNIFICADO v2.0 - Arquitecto Virtual
 * Orquesta: Scraper Municipal + Catastro Provincial + Fusión PDF
 *
 * Uso: node ejecucion/generador_reporte_total.js A10169791
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const { chromium } = require('playwright');
const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN GLOBAL ===
const CONFIG = {
    municipal: {
        url: 'https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/'
    },
    catastro: {
        url: 'https://dgc.corrientes.gob.ar',
        user: process.env.DGC_CATASTRO_USER,
        pass: process.env.DGC_CATASTRO_PASS
    },
    paths: {
        tempDescargas: path.join(process.cwd(), '.tmp', 'descargas'),
        informesFinales: path.join(process.cwd(), 'informes_finales')
    },
    colores: {
        negroVolcanico: rgb(0.1, 0.1, 0.1),
        rojoVolcanico: rgb(0.8, 0.2, 0.15),
        grisClaro: rgb(0.95, 0.95, 0.95),
        blanco: rgb(1, 1, 1)
    },
    timeout: 30000
};

// === UTILIDADES ===
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function asegurarDirectorios() {
    [CONFIG.paths.tempDescargas, CONFIG.paths.informesFinales].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

function limpiarTemporal() {
    const files = fs.readdirSync(CONFIG.paths.tempDescargas);
    files.forEach(file => {
        fs.unlinkSync(path.join(CONFIG.paths.tempDescargas, file));
    });
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 1: SCRAPER MUNICIPAL (Playwright)
// ══════════════════════════════════════════════════════════════

async function scrapeMunicipal(adrema) {
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  🏛️  MÓDULO 1: SCRAPER MUNICIPAL                         │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    try {
        console.log('   → Conectando con Municipalidad de Corrientes...');
        await page.goto(CONFIG.municipal.url, { timeout: 30000, waitUntil: 'domcontentloaded' });

        // Configurar formulario
        await page.waitForSelector('#t_uso_suelo', { state: 'visible', timeout: 10000 });
        await page.selectOption('#t_uso_suelo', '1');
        await page.waitForTimeout(1500);

        await page.selectOption('#tipo_actividad', '1');
        await page.waitForTimeout(1500);

        await page.evaluate(() => {
            const select = document.querySelector('#activida_d');
            if (select) {
                const option = Array.from(select.options).find(o => o.text.includes('Viviendas Colectivas'));
                if (option) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await page.waitForTimeout(2000);

        await page.selectOption('#ubicacion', 'adrema');
        await page.waitForSelector('#adrema', { state: 'visible', timeout: 5000 });
        await page.fill('#adrema', adrema);
        await page.waitForTimeout(1000);

        await page.click('#siguiente');
        console.log('   → Esperando respuesta del servidor municipal...');

        await page.waitForFunction(() => {
            const body = document.body.innerText;
            return body.includes('Distrito:') || body.includes('No se encontraron');
        }, { timeout: 60000 });
        await page.waitForTimeout(2000);

        // Extraer datos
        const data = await page.evaluate(() => {
            const resultDiv = document.querySelector('.alert-warning');
            if (!resultDiv) return null;

            const text = resultDiv.innerText;
            const extract = (regex) => {
                const match = text.match(regex);
                return match ? match[1].trim() : null;
            };

            const table = resultDiv.querySelector('table');
            let tableData = null;
            if (table) {
                const rows = Array.from(table.querySelectorAll('tbody tr'));
                const medianerasRow = rows.find(r => r.innerText.includes('Entre Medianeras'));
                if (medianerasRow) {
                    const cells = Array.from(medianerasRow.querySelectorAll('td'));
                    tableData = {
                        supMaxConstruir: cells[1]?.innerText.trim(),
                        altMax: cells[4]?.innerText.trim()
                    };
                }
            }

            return {
                distrito: extract(/Distrito:\s*([^\s]+)/i),
                supParcela: extract(/Sup\. Parcela:\s*([\d.,]+)/i),
                frente: extract(/Frente:\s*([\d.,]+)/i),
                fos: extract(/Factor de ocupación de suelo:\s*([\d.,]+)/i),
                supMaxOcupar: extract(/Superficie máxima del terreno a ocupar:\s*([\d.,]+)/i),
                tableData
            };
        });

        await browser.close();
        console.log(`   ✓ Datos obtenidos: Distrito ${data?.distrito || 'No encontrado'}`);
        return data;

    } catch (err) {
        await browser.close();
        console.error(`   ✗ Error municipal: ${err.message}`);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 2: SCRAPER CATASTRO PROVINCIAL (Puppeteer)
// ══════════════════════════════════════════════════════════════

async function scrapeCatastro(adrema) {
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  📐 MÓDULO 2: SCRAPER CATASTRO PROVINCIAL               │');
    console.log('└─────────────────────────────────────────────────────────┘');

    if (!CONFIG.catastro.user || !CONFIG.catastro.pass) {
        console.log('   ⚠ Credenciales DGC no configuradas - saltando módulo');
        return { success: false, mensuraPath: null, datos: null };
    }

    const browser = await puppeteer.launch({
        headless: false, // Visible para debug
        slowMo: 100,
        defaultViewport: { width: 1366, height: 768 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.timeout);

    // Configurar directorio de descargas
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.paths.tempDescargas
    });

    // Manejar diálogos automáticamente
    page.on('dialog', async dialog => {
        console.log(`   ℹ Diálogo: ${dialog.message()}`);
        await dialog.accept();
    });

    let resultado = {
        success: false,
        mensuraPath: null,
        datos: {
            mensuraId: null,
            nomenclatura: null,
            titulares: null,
            matricula: null,
            parcela: {}
        }
    };

    try {
        // PASO 1: Navegar al sitio
        console.log('   → Paso 1/9: Navegando a dgc.corrientes.gob.ar...');
        await page.goto(CONFIG.catastro.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000);

        // PASO 2: Login
        console.log('   → Paso 2/9: Realizando login...');
        const userSelectors = ['input[name="usuario"]', 'input[name="user"]', 'input[type="text"]'];
        const passSelectors = ['input[name="password"]', 'input[name="clave"]', 'input[type="password"]'];

        for (const sel of userSelectors) {
            try {
                const el = await page.$(sel);
                if (el) { await page.type(sel, CONFIG.catastro.user, { delay: 50 }); break; }
            } catch (e) { }
        }

        for (const sel of passSelectors) {
            try {
                const el = await page.$(sel);
                if (el) { await page.type(sel, CONFIG.catastro.pass, { delay: 50 }); break; }
            } catch (e) { }
        }

        // Click en botón de login
        const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', '.btn-login', '#btnLogin'];
        for (const sel of submitSelectors) {
            try {
                const btn = await page.$(sel);
                if (btn) { await btn.click(); break; }
            } catch (e) { }
        }
        await delay(3000);

        // PASO 3: Pop-up "Cambiar Contraseña"
        console.log('   → Paso 3/9: Manejando pop-up "Cambiar Contraseña"...');
        try {
            const aceptarBtn = await page.$('button:has-text("Aceptar"), .swal2-confirm, #btnAceptar');
            if (aceptarBtn) await aceptarBtn.click();
        } catch (e) { }
        await delay(1000);

        // PASO 4: Pop-up "Guardar Contraseña" (navegador - ignorado automáticamente)
        console.log('   → Paso 4/9: Pop-up navegador (auto-manejado)');

        // PASO 5: Pop-up "Bienvenido"
        console.log('   → Paso 5/9: Cerrando ventana de bienvenida...');
        try {
            const closeSelectors = ['.modal .close', '.modal-header .close', 'button[data-dismiss="modal"]', '.btn-close'];
            for (const sel of closeSelectors) {
                const closeBtn = await page.$(sel);
                if (closeBtn) { await closeBtn.click(); break; }
            }
        } catch (e) { }
        await page.keyboard.press('Escape');
        await delay(1500);

        // PASO 6: Búsqueda por Adrema
        console.log(`   → Paso 6/9: Buscando Adrema ${adrema}...`);
        const searchSelectors = ['input[name="adrema"]', 'input[name="buscar"]', 'input[placeholder*="Buscar"]', '#txtBuscar'];
        for (const sel of searchSelectors) {
            try {
                const input = await page.$(sel);
                if (input) {
                    await input.click();
                    await input.type(adrema, { delay: 50 });
                    break;
                }
            } catch (e) { }
        }
        await page.keyboard.press('Enter');
        await delay(4000);

        // PASO 7: Extracción de datos de la grilla
        console.log('   → Paso 7/9: Extrayendo datos de resultados...');
        const datosExtraidos = await page.evaluate(() => {
            const result = { mensuraId: null, nomenclatura: null, titulares: null, matricula: null, parcela: {} };
            const bodyText = document.body.innerText;

            // Buscar ID de mensura (formato: XXXX-X)
            const mensuraMatch = bodyText.match(/(\d{3,5}-[A-Z])/i);
            if (mensuraMatch) result.mensuraId = mensuraMatch[1];

            // Buscar nomenclatura
            const nomenclaturaMatch = bodyText.match(/([A-Z]-\d{2}-\d{2}-\d{2}-\d{3}-\d{3})/i);
            if (nomenclaturaMatch) result.nomenclatura = nomenclaturaMatch[1];

            // Buscar superficie
            const supMatch = bodyText.match(/([\d.,]+)\s*m[²2]/i);
            if (supMatch) result.parcela.superficie = supMatch[1] + ' m²';

            return result;
        });

        Object.assign(resultado.datos, datosExtraidos);
        console.log(`   ✓ Mensura detectada: ${resultado.datos.mensuraId || 'No encontrada'}`);

        // PASO 8: Abrir visor de mensura
        if (resultado.datos.mensuraId) {
            console.log('   → Paso 8/9: Abriendo visor de mensura...');

            // Buscar y clickear el ícono de "Ver Documento"
            const clicked = await page.evaluate(() => {
                const filas = document.querySelectorAll('tr, .row, .list-item');
                for (const fila of filas) {
                    if (fila.innerText.toLowerCase().includes('mensura')) {
                        const iconos = fila.querySelectorAll('a, button, img, i, svg, [onclick]');
                        if (iconos.length > 0) {
                            iconos[0].click();
                            return true;
                        }
                    }
                }
                // Intento alternativo: primer enlace con "ver" o "documento"
                const verDoc = document.querySelector('a[href*="ver"], a[href*="documento"], a[title*="Ver"]');
                if (verDoc) { verDoc.click(); return true; }
                return false;
            });

            if (clicked) await delay(3000);

            // PASO 9: Descargar PDF
            console.log('   → Paso 9/9: Descargando plano de mensura...');

            const downloadClicked = await page.evaluate(() => {
                const downloadSelectors = [
                    'a[download]', 'button[title*="Descargar"]', 'a[title*="Descargar"]',
                    '.fa-download', 'i.fa-arrow-down', '[class*="download"]'
                ];
                for (const sel of downloadSelectors) {
                    const btn = document.querySelector(sel);
                    if (btn) { btn.click(); return true; }
                }
                return false;
            });

            if (downloadClicked) {
                await delay(5000); // Esperar descarga

                // Buscar archivo descargado y renombrar
                const files = fs.readdirSync(CONFIG.paths.tempDescargas)
                    .filter(f => f.endsWith('.pdf'))
                    .map(f => ({
                        name: f,
                        path: path.join(CONFIG.paths.tempDescargas, f),
                        time: fs.statSync(path.join(CONFIG.paths.tempDescargas, f)).mtime.getTime()
                    }))
                    .sort((a, b) => b.time - a.time);

                if (files.length > 0) {
                    const targetPath = path.join(CONFIG.paths.tempDescargas, `${resultado.datos.mensuraId}.pdf`);
                    if (files[0].path !== targetPath) {
                        fs.renameSync(files[0].path, targetPath);
                    }
                    resultado.mensuraPath = targetPath;
                    resultado.success = true;
                    console.log(`   ✓ Mensura descargada: ${resultado.datos.mensuraId}.pdf`);
                }
            }
        }

    } catch (err) {
        console.error(`   ✗ Error catastro: ${err.message}`);
        await page.screenshot({ path: path.join(CONFIG.paths.tempDescargas, 'error_catastro.png') });
    }

    await browser.close();
    return resultado;
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 3: GENERADOR DE INFORME PDF (Estética Volcánica)
// ══════════════════════════════════════════════════════════════

async function generarInformePrincipal(adrema, datosMunicipales, datosCatastro, hayMensura) {
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  📄 MÓDULO 3: GENERADOR DE INFORME                      │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // === PÁGINA 1: CARÁTULA ===
    const pagina1 = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = pagina1.getSize();

    // Header negro volcánico
    pagina1.drawRectangle({
        x: 0, y: height - 140,
        width: width, height: 140,
        color: CONFIG.colores.negroVolcanico
    });

    // Línea roja volcánica
    pagina1.drawRectangle({
        x: 0, y: height - 145,
        width: width, height: 5,
        color: CONFIG.colores.rojoVolcanico
    });

    // Logo/Título
    pagina1.drawText('ARQUITECTO VIRTUAL', {
        x: 50, y: height - 60,
        size: 32, font: fontBold,
        color: CONFIG.colores.blanco
    });

    pagina1.drawText('Sistema de Análisis Urbanístico Automatizado', {
        x: 50, y: height - 90,
        size: 12, font: fontRegular,
        color: CONFIG.colores.rojoVolcanico
    });

    pagina1.drawText(`INFORME DE RENTABILIDAD`, {
        x: 50, y: height - 125,
        size: 14, font: fontBold,
        color: CONFIG.colores.blanco
    });

    // Fecha
    const fecha = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    pagina1.drawText(fecha, {
        x: width - 150, y: height - 125,
        size: 10, font: fontRegular,
        color: rgb(0.7, 0.7, 0.7)
    });

    // Adrema destacado
    pagina1.drawRectangle({
        x: 50, y: height - 220,
        width: width - 100, height: 50,
        color: CONFIG.colores.grisClaro,
        borderColor: CONFIG.colores.rojoVolcanico,
        borderWidth: 2
    });

    pagina1.drawText('ADREMA:', {
        x: 70, y: height - 200,
        size: 12, font: fontBold,
        color: CONFIG.colores.negroVolcanico
    });

    pagina1.drawText(adrema, {
        x: 150, y: height - 200,
        size: 18, font: fontBold,
        color: CONFIG.colores.rojoVolcanico
    });

    // === SECCIÓN: DATOS MUNICIPALES ===
    let yPos = height - 280;

    pagina1.drawText('INDICADORES URBANÍSTICOS', {
        x: 50, y: yPos,
        size: 14, font: fontBold,
        color: CONFIG.colores.rojoVolcanico
    });

    yPos -= 10;
    pagina1.drawRectangle({
        x: 50, y: yPos,
        width: 200, height: 2,
        color: CONFIG.colores.rojoVolcanico
    });

    yPos -= 30;
    const lineHeight = 28;

    const camposMunicipales = [
        { label: 'Distrito', value: datosMunicipales?.distrito || 'Sin datos' },
        { label: 'Superficie Parcela', value: datosMunicipales?.supParcela ? `${datosMunicipales.supParcela} m²` : 'Sin datos' },
        { label: 'Frente', value: datosMunicipales?.frente ? `${datosMunicipales.frente} m` : 'Sin datos' },
        { label: 'F.O.S.', value: datosMunicipales?.fos || 'Sin datos' },
        { label: 'Sup. Máx. Ocupar', value: datosMunicipales?.supMaxOcupar ? `${datosMunicipales.supMaxOcupar} m²` : 'Sin datos' },
        { label: 'Sup. Máx. Construir', value: datosMunicipales?.tableData?.supMaxConstruir || 'Sin datos' },
        { label: 'Altura Máxima', value: datosMunicipales?.tableData?.altMax ? `${datosMunicipales.tableData.altMax} m` : 'Sin datos' }
    ];

    for (const campo of camposMunicipales) {
        pagina1.drawText(`${campo.label}:`, {
            x: 70, y: yPos,
            size: 11, font: fontBold,
            color: CONFIG.colores.negroVolcanico
        });

        pagina1.drawText(campo.value, {
            x: 220, y: yPos,
            size: 11, font: fontRegular,
            color: CONFIG.colores.negroVolcanico
        });

        yPos -= lineHeight;
    }

    // === SECCIÓN: DATOS CATASTRALES ===
    if (datosCatastro?.datos) {
        yPos -= 20;

        pagina1.drawText('DATOS CATASTRALES', {
            x: 50, y: yPos,
            size: 14, font: fontBold,
            color: CONFIG.colores.rojoVolcanico
        });

        yPos -= 10;
        pagina1.drawRectangle({
            x: 50, y: yPos,
            width: 200, height: 2,
            color: CONFIG.colores.rojoVolcanico
        });

        yPos -= 30;

        const camposCatastro = [
            { label: 'ID Mensura', value: datosCatastro.datos.mensuraId || 'No registrado' },
            { label: 'Nomenclatura', value: datosCatastro.datos.nomenclatura || 'No disponible' },
            { label: 'Superficie Catastral', value: datosCatastro.datos.parcela?.superficie || 'No disponible' }
        ];

        for (const campo of camposCatastro) {
            pagina1.drawText(`${campo.label}:`, {
                x: 70, y: yPos,
                size: 11, font: fontBold,
                color: CONFIG.colores.negroVolcanico
            });

            pagina1.drawText(campo.value, {
                x: 220, y: yPos,
                size: 11, font: fontRegular,
                color: CONFIG.colores.negroVolcanico
            });

            yPos -= lineHeight;
        }
    }

    // === FOOTER ===
    // Línea inferior
    pagina1.drawRectangle({
        x: 0, y: 70,
        width: width, height: 2,
        color: CONFIG.colores.rojoVolcanico
    });

    pagina1.drawText('Documento generado automáticamente por Arquitecto Virtual', {
        x: 50, y: 50,
        size: 8, font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
    });

    pagina1.drawText('Fuentes: Sistema de Uso de Suelo - Municipalidad de Corrientes | DGC Catastro Provincial', {
        x: 50, y: 38,
        size: 8, font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
    });

    // Nota si no hay mensura
    if (!hayMensura) {
        pagina1.drawRectangle({
            x: 40, y: 80,
            width: width - 80, height: 25,
            color: rgb(1, 0.95, 0.9),
            borderColor: CONFIG.colores.rojoVolcanico,
            borderWidth: 1
        });

        pagina1.drawText('NOTA: No se registra plano de mensura digitalizado en Catastro Provincial', {
            x: 60, y: 88,
            size: 9, font: fontBold,
            color: CONFIG.colores.rojoVolcanico
        });
    }

    console.log('   ✓ Informe principal generado');
    return pdfDoc;
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 4: FUSIÓN DE PDFs (MERGE)
// ══════════════════════════════════════════════════════════════

async function fusionarDocumentos(informePdf, mensuraPath, adrema) {
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  🔗 MÓDULO 4: FUSIÓN DE DOCUMENTOS                      │');
    console.log('└─────────────────────────────────────────────────────────┘');

    const fontBold = await informePdf.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await informePdf.embedFont(StandardFonts.Helvetica);

    if (mensuraPath && fs.existsSync(mensuraPath)) {
        console.log(`   → Anexando mensura: ${path.basename(mensuraPath)}`);

        // Leer PDF de mensura
        const mensuraBytes = fs.readFileSync(mensuraPath);
        const mensuraPdf = await PDFDocument.load(mensuraBytes);

        // Página separadora de ANEXO
        const separador = informePdf.addPage([595, 842]);
        const { width, height } = separador.getSize();

        // Fondo
        separador.drawRectangle({
            x: 0, y: height / 2 - 50,
            width: width, height: 100,
            color: CONFIG.colores.negroVolcanico
        });

        separador.drawText('ANEXO TÉCNICO', {
            x: 180, y: height / 2 + 15,
            size: 28, font: fontBold,
            color: CONFIG.colores.blanco
        });

        separador.drawText('PLANO DE MENSURA', {
            x: 200, y: height / 2 - 20,
            size: 16, font: fontRegular,
            color: CONFIG.colores.rojoVolcanico
        });

        // Copiar páginas de la mensura
        const paginas = await informePdf.copyPages(mensuraPdf, mensuraPdf.getPageIndices());

        for (const pagina of paginas) {
            const { width: pWidth, height: pHeight } = pagina.getSize();

            // Detectar orientación horizontal (paisaje) y rotar
            if (pWidth > pHeight) {
                console.log('   ↻ Rotando página horizontal 90°');
                pagina.setRotation(degrees(90));
            }

            informePdf.addPage(pagina);
        }

        console.log(`   ✓ Mensura anexada (${paginas.length} página/s)`);

        // Eliminar archivo temporal
        fs.unlinkSync(mensuraPath);

    } else {
        console.log('   ⚠ Sin mensura para anexar');
    }

    // Guardar documento final
    const outputPath = path.join(CONFIG.paths.informesFinales, `Informe_Completo_${adrema}.pdf`);
    const pdfBytes = await informePdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`   ✓ Documento final guardado`);
    return outputPath;
}

// ══════════════════════════════════════════════════════════════
// ORQUESTADOR PRINCIPAL
// ══════════════════════════════════════════════════════════════

async function generarReporteTotal(adrema) {
    console.log('\n' + '═'.repeat(60));
    console.log('   🌋 ARQUITECTO VIRTUAL - Generador de Reporte Unificado');
    console.log('═'.repeat(60));
    console.log(`   Adrema: ${adrema}`);
    console.log(`   Fecha: ${new Date().toLocaleString('es-AR')}`);
    console.log('═'.repeat(60));

    // Validar formato Adrema (Protocolo UX - Caso A)
    const regexAdrema = /^[A-Z]\s*\d{4,}$/i;
    if (!regexAdrema.test(adrema)) {
        console.error('\n❌ Error: Formato de Adrema inválido.');
        console.error('   Debe ser letra + números (ej: A10169791)');
        process.exit(1);
    }

    // Preparar directorios
    asegurarDirectorios();

    try {
        // MÓDULO 1: Scraper Municipal
        const datosMunicipales = await scrapeMunicipal(adrema);

        // MÓDULO 2: Scraper Catastro
        const resultadoCatastro = await scrapeCatastro(adrema);

        // MÓDULO 3: Generar informe principal
        const hayMensura = resultadoCatastro.success && resultadoCatastro.mensuraPath;
        const informePdf = await generarInformePrincipal(
            adrema,
            datosMunicipales,
            resultadoCatastro,
            hayMensura
        );

        // MÓDULO 4: Fusionar documentos
        const outputPath = await fusionarDocumentos(
            informePdf,
            resultadoCatastro.mensuraPath,
            adrema
        );

        // Limpiar temporales
        limpiarTemporal();

        // Resultado final
        console.log('\n' + '═'.repeat(60));
        console.log('   ✅ PROCESO COMPLETADO');
        console.log('═'.repeat(60));
        console.log(`   📁 Archivo: ${outputPath}`);
        console.log('═'.repeat(60) + '\n');

        return {
            success: true,
            archivo: outputPath,
            datosMunicipales,
            datosCatastro: resultadoCatastro.datos,
            incluyeMensura: hayMensura
        };

    } catch (err) {
        console.error('\n❌ Error fatal:', err.message);
        process.exit(1);
    }
}

// === EJECUCIÓN ===
const adrema = process.argv[2];

if (!adrema) {
    console.log('\n📋 Uso: node ejecucion/generador_reporte_total.js <ADREMA>');
    console.log('   Ejemplo: node ejecucion/generador_reporte_total.js A10169791\n');
    process.exit(1);
}

generarReporteTotal(adrema);
