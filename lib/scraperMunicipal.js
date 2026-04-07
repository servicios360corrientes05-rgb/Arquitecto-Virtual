'use strict';
/**
 * scraperMunicipal.js
 * Motor de scraping para el portal de Uso de Suelo de la Municipalidad de Corrientes.
 * Reemplaza el código duplicado que existía en watcher.js y app/api/analyze/route.js.
 *
 * Retorna un objeto unificado compatible con ambos consumidores.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MUNICIPAL_URL = 'https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/index.php';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Realiza el scraping del portal municipal para una partida/adrema dada.
 * @param {string} adrema - Código de partida, ej: "A10169791"
 * @returns {Promise<object>} Datos extraídos del portal.
 */
async function scrapeMunicipal(adrema) {
    console.log(`🌍 [ScraperMunicipal] Iniciando consulta para: ${adrema}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let page;
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page = await context.newPage();

        // Helper: guardar dump HTML en caso de error para debugging
        const dumpHTML = async (label) => {
            try {
                const html = await page.content();
                const dumpDir = path.join(process.cwd(), 'data');
                if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
                const dumpPath = path.join(dumpDir, `error_dump_${label}_${Date.now()}.html`);
                fs.writeFileSync(dumpPath, html, 'utf8');
                console.error(`❌ [${label}] HTML guardado en: ${dumpPath}`);
            } catch (e) { /* no crítico */ }
        };

        // Helper: seleccionar dropdown con reintentos y verificación de valor final
        const selectRobust = async (selector, value, maxAttempts = 3) => {
            for (let i = 0; i < maxAttempts; i++) {
                try {
                    await page.waitForSelector(selector, { state: 'visible', timeout: 8000 });
                    await page.selectOption(selector, value);
                    // Disparar eventos para activar AJAX del sitio
                    await page.evaluate(({ sel, val }) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            el.value = val;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, { sel: selector, val: value });
                    await delay(1000);
                    // Verificar que el valor quedó aplicado
                    const actual = await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.value : null;
                    }, selector); // un solo argumento — OK
                    if (actual === value) return true;
                    console.log(`⚠️ Valor no aplicado en ${selector} (esperado=${value}, actual=${actual}). Reintentando...`);
                    await delay(1500);
                } catch (err) {
                    console.log(`⚠️ Intento ${i + 1}/${maxAttempts} fallido en ${selector}: ${err.message}. Reintentando...`);
                    await delay(2000);
                }
            }
            await dumpHTML(`Selector_${selector.replace(/[#.]/g, '')}_Failed`);
            console.error(`❌ Error seleccionando ${selector} tras ${maxAttempts} intentos.`);
            return false;
        };

        await page.goto(MUNICIPAL_URL, { waitUntil: 'networkidle', timeout: 120000 });

        // --- NAVEGACIÓN DEL FORMULARIO ---
        console.log('   > Seleccionando Tipo de Uso de Suelo...');
        await selectRobust('#t_uso_suelo', '1');
        await delay(3000);

        console.log('   > Seleccionando Actividad (Residencial)...');
        await selectRobust('#tipo_actividad', '1');
        await delay(3000);

        console.log('   > Seleccionando Viviendas Colectivas...');
        const activSelected = await selectRobust('#activida_d', '2');
        if (!activSelected) {
            // Fallback: buscar por texto si el valor '2' falló
            await page.evaluate(() => {
                const select = document.querySelector('#activida_d');
                if (select) {
                    const opt = Array.from(select.options).find(o =>
                        o.text.toLowerCase().includes('viviendas colectivas')
                    );
                    if (opt) {
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        }
        await delay(3000);

        console.log('   > Seleccionando Ubicación por ADREMA...');
        await selectRobust('#ubicacion', 'adrema');
        await delay(2000);

        // --- INGRESO DE ADREMA ---
        console.log('   > Ingresando Adrema...');
        const cleanAdrema = adrema.trim().toUpperCase().replace(/\s/g, '');
        await page.waitForSelector('#adrema', { state: 'visible', timeout: 10000 });
        await page.evaluate((val) => {
            const el = document.getElementById('adrema');
            if (el) {
                el.focus();
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        }, cleanAdrema);
        await delay(800);

        // --- ENVÍO DEL FORMULARIO ---
        console.log('🚀 Consultando base de datos municipal...');
        try {
            await page.waitForSelector('#siguiente', { state: 'visible', timeout: 10000 });
            await page.click('#siguiente');
            await page.waitForSelector('.loading-status-ui', { state: 'hidden', timeout: 30000 }).catch(() => {});
            await delay(10000);
        } catch (err) {
            console.log('⚠️ Botón #siguiente no disponible, intentando submit del formulario...');
            await page.evaluate(() => {
                const f = document.querySelector('form');
                if (f) f.submit();
            });
        }

        // --- ESPERA INTELIGENTE DE RESULTADOS ---
        console.log('⏳ Aguardando datos municipales (hasta 120s)...');
        try {
            await Promise.race([
                page.waitForFunction(() => {
                    return (
                        document.body.innerText.includes('Distrito:') ||
                        document.body.innerText.includes('Entre Medianeras')
                    ) && document.querySelector('table');
                }, { timeout: 120000 }),
                page.waitForSelector('table tr', { state: 'visible', timeout: 120000 })
            ]);
            console.log('   > ✅ Datos detectados en la página.');
        } catch (e) {
            console.log('   ⚠️ Timeout esperando tabla. Intentando extracción de todos modos...');
            await dumpHTML('WaitResults_Timeout');
        }
        await delay(5000);

        // --- EXTRACCIÓN DE DATOS DEL DOM ---
        const raw = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : '';
            const extract = (regex) => {
                const m = bodyText.match(regex);
                return m ? m[1].trim() : null;
            };

            const distrito = extract(/Distrito:\s*([^\s\n\r]+)/i) || extract(/DISTRITO[:\s]+([^\n\r]+)/i);
            const superficie = extract(/Sup\.?\s*Parcela:\s*([\d\.,]+)/i) || extract(/Superficie\s*Terreno:\s*([\d\.,]+)/i);
            const frente = extract(/Frente:\s*([\d\.,]+)/i);
            const fos = extract(/Factor de ocupaci[oó]n de suelo:\s*([\d\.,]+)/i) || extract(/FOS[:\s]*([\d\.,]+)/i);
            const supMaxOcupar = extract(/Superficie m[aá]xima del terreno a ocupar:\s*([\d\.,]+)/i);

            let supMaxima = null;
            let alturaMaxima = null;
            let alturaBasamento = null;

            // Prioridad 1: fila "Entre Medianeras" de la tabla de indicadores
            // Estructura de columnas: [0] Tipología [1] Sup.Máx.Construir [2] Comp [3] Alt.Basamento [4] Alt.Máxima
            const rows = Array.from(document.querySelectorAll('tr'));
            const medianeraRow = rows.find(r => /Entre\s*Medianeras/i.test(r.innerText));
            if (medianeraRow) {
                const cells = Array.from(medianeraRow.querySelectorAll('td, th'));
                if (cells.length >= 2 && /[\d\.,]+/.test(cells[1].innerText.trim())) {
                    supMaxima = cells[1].innerText.trim();
                }
                if (cells.length >= 4 && /[\d\.,]+/.test(cells[3].innerText.trim())) {
                    alturaBasamento = cells[3].innerText.trim();
                }
                if (cells.length >= 5) {
                    const lastCell = cells[cells.length - 1].innerText.trim();
                    if (/[\d\.,]+/.test(lastCell)) alturaMaxima = lastCell;
                }
            }

            // Prioridad 2: regex sobre el texto a continuación de "Entre Medianeras"
            if (!alturaMaxima) {
                const textAfterMedianera = bodyText.split('Entre Medianeras')[1];
                if (textAfterMedianera) {
                    const m = textAfterMedianera.match(/Altura\s*(?:M[áa]xima)?\s*[:\(]?\s*([\d\.,]+)/i);
                    if (m) alturaMaxima = m[1];
                }
            }
            // Fallback global
            if (!alturaMaxima) {
                alturaMaxima = extract(/Altura\s*M[áa]xima[:\s]*([\d\.,]+)/i);
            }

            return { distrito, superficie, frente, fos, supMaxOcupar, supMaxima, alturaMaxima, alturaBasamento };
        });

        console.log('✅ [ScraperMunicipal] Datos crudos:', raw);

        // Guardar checkpoint para diagnóstico
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(path.join(dataDir, 'ultimo_scrapeo.json'), JSON.stringify(raw, null, 2));
        } catch (e) { /* no crítico */ }

        // Normalizar: convertir strings a números para cálculos
        const parseNum = (val) => {
            if (!val) return 0;
            let s = String(val).trim();
            // Formato "1.234,56" → "1234.56"
            if (s.match(/\d+\.\d{3},\d+/)) s = s.replace(/\./g, '').replace(',', '.');
            else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
            const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
            return isNaN(n) ? 0 : n;
        };

        return {
            // Campos numéricos (para watcher.js y cálculos)
            distrito:        raw.distrito || 'N/A',
            superficie:      parseNum(raw.superficie) || 300,
            frente:          parseNum(raw.frente) || 10,
            fos:             parseNum(raw.fos) || 0.7,
            altura:          parseNum(raw.alturaMaxima) || 9,   // alias para compatibilidad con watcher.js
            alturaMaxima:    parseNum(raw.alturaMaxima) || 9,
            alturaBasamento: parseNum(raw.alturaBasamento) || 9,
            supMaxima:       parseNum(raw.supMaxima),
            supVendible:     0,
            tipologia:       'Entre Medianeras',
            // Campos string (para route.js display y compatibilidad)
            superficieTotal: raw.superficie || '300',
            supMaxOcupar:    raw.supMaxOcupar || '-',
            alturaWeb:       raw.alturaMaxima || '9',
            volumenWeb:      raw.supMaxima ? raw.supMaxima.replace(/\./g, '') : null,
            tableRaw: {
                supMaxConstruir:  raw.supMaxima,
                altMax:           raw.alturaMaxima,
                altMaxBasamento:  raw.alturaBasamento,
            },
        };

    } catch (error) {
        console.error('❌ ERROR CRÍTICO ScraperMunicipal:', error.message);
        return {
            distrito: 'Error',
            superficie: 300, superficieTotal: '300',
            frente: 10,
            fos: 0.7,
            altura: 9, alturaMaxima: 9, alturaBasamento: 9,
            supMaxima: 0, supVendible: 0,
            tipologia: 'Error',
            supMaxOcupar: '-', alturaWeb: '9', volumenWeb: null,
            tableRaw: null,
        };
    } finally {
        await browser.close();
        console.log('   > 🔒 Navegador municipal cerrado.');
    }
}

module.exports = { scrapeMunicipal };
