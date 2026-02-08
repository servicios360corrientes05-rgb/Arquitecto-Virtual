
require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const path = require('path');
const { loadAllRegulations, findRegulation } = require('../lib/regulationsLoader');

// Cargar normativas
const regulationsMap = loadAllRegulations();

// --- CONFIGURACIÓN ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OUTPUT_FOLDER = './public/informes';
const ASSETS_FOLDER = path.resolve('./assets');

if (!fs.existsSync(OUTPUT_FOLDER)) fs.mkdirSync(OUTPUT_FOLDER);

// Helper Delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// 1. HELPER: REINTENTO DE IA OpenAI
// ============================================================
async function generarConReintento(prompt, intentos = 9) {
    for (let i = 0; i < intentos; i++) {
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Eres un arquitecto senior experto en análisis urbanístico. Responde SOLO con JSON válido, sin texto adicional." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1000
            });
            return {
                response: {
                    text: () => completion.choices[0].message.content
                }
            };
        } catch (error) {
            const msg = (error && error.message) ? error.message : '';
            if (i < intentos - 1) {
                console.log(`⚠️ Servidor IA saturado. Reintentando en 5s... (Intento ${i + 1}/${intentos})`);
                await delay(5000);
            } else {
                throw error;
            }
        }
    }
}

// ============================================================
// 2. SCRAPER (Versión Producción - Puppeteer)
// ============================================================
async function escrapearDatosReales(partida) {
    console.log(`🌍 Iniciando trámite municipal para: ${partida}`);

    const headlessMode = process.env.PUPPETEER_HEADLESS === 'false' ? false : true;
    console.log(`   > Headless Mode: ${headlessMode}`);

    const browser = await puppeteer.launch({
        headless: headlessMode,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    const seleccionarOpcionRobust = async (id, valor, maxAttempts = 3) => {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await page.waitForSelector(`#${id}`, { visible: true, timeout: 8000 });
                await page.select(`#${id}`, valor);
                await page.evaluate((elId, valor) => {
                    const el = document.getElementById(elId);
                    if (el) {
                        el.value = valor;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.focus();
                        el.click();
                    }
                }, id, valor);
                await delay(1000);
                const actual = await page.evaluate((elId) => document.getElementById(elId)?.value, id);
                if (actual === valor) return true;
                console.log(`⚠️ Reintento selección #${id}`);
                await delay(1500);
            } catch (err) {
                console.log(`⚠️ Error selección #${id}: ${err.message}`);
                await delay(2000);
            }
        }
        return false;
    };

    try {
        await page.goto('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/index.php', { waitUntil: 'networkidle2' });

        await seleccionarOpcionRobust('t_uso_suelo', '1');
        await delay(2000);
        await seleccionarOpcionRobust('tipo_actividad', '1');
        await delay(2000);

        // Seleccion Viviendas Colectivas (Valor 2)
        await seleccionarOpcionRobust('activida_d', '2');
        await delay(2000);

        await seleccionarOpcionRobust('ubicacion', 'adrema');
        await delay(1500);

        console.log("⚡ Ingresando Adrema...");
        await page.waitForSelector('#adrema', { visible: true });
        await page.evaluate((val) => {
            const el = document.getElementById('adrema');
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, partida);

        await delay(1000);

        console.log("🚀 Click Siguiente...");
        await page.click('#siguiente');

        console.log("⏳ Aguardando resultados (max 60s)...");
        try {
            await Promise.race([
                page.waitForFunction(() => {
                    const body = document.body.innerText;
                    return (body.includes('Distrito:') || body.includes('Entre Medianeras')) && document.querySelector('table');
                }, { timeout: 120000 }),
                page.waitForSelector('table tr', { visible: true, timeout: 120000 })
            ]);
            console.log("   > ✅ Datos detectados.");
        } catch (e) {
            console.log("   ⚠️ Timeout o datos no detectados visualmente.");
        }

        console.log("   > Esperando renderizado final (Safety Wait 10s)...");
        await delay(10000);

        console.log("🔍 Extrayendo datos...");
        const datos = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const extraer = (regex) => {
                const match = bodyText.match(regex);
                return match ? match[1].trim() : null;
            };

            const distrito = extraer(/Distrito:\s*([^\n\r]+)/i) || extraer(/DISTRITO[:\s]+([^\n\r]+)/i) || null;
            const superficie = extraer(/Sup\.?\s*Parcela:\s*([\d\.,]+)/i) || extraer(/Superficie\s*Terreno:\s*([\d\.,]+)/i);
            const frente = extraer(/Frente:\s*([\d\.,]+)/i);
            const fos = extraer(/Factor de ocupaci[oó]n de suelo:\s*([\d\.,]+)/i) || extraer(/FOS[:\s]*([\d\.,]+)/i);

            let supMaxima = extraer(/Sup\.?\s*Total\s*a\s*Construir:\s*([\d\.,]+)/i) || null;
            let altura = null;

            // PRIORIDAD TABLA
            const rows = Array.from(document.querySelectorAll('tr'));
            const medianera = rows.find(r => /Entre\s*Medianeras/i.test(r.innerText));
            if (medianera) {
                const cells = medianera.querySelectorAll('td');
                if (cells.length >= 2 && cells[1]) supMaxima = cells[1].innerText.trim();
                // Ultima celda es altura
                if (cells.length >= 5) altura = cells[cells.length - 1].innerText.trim();
            }

            if (!altura) {
                const textAfter = bodyText.split('Entre Medianeras')[1];
                if (textAfter) {
                    const m = textAfter.match(/Altura\s*(?:Máxima)?\s*[:\(]?\s*([\d\.,]+)/i);
                    if (m) altura = m[1];
                }
            }

            return { distrito, superficie, frente, fos, altura, supMaxima };
        });

        await browser.close();

        const parseNumber = (val) => {
            if (val === undefined || val === null) return 0;
            let str = String(val).trim();
            if (!str) return 0;

            // Normalizar separadores: "1.234,56" -> "1234.56"; "1234,56" -> "1234.56"
            if (str.match(/\d+\.\d{3},\d+/)) {
                str = str.replace(/\./g, '').replace(',', '.');
            } else if (str.includes(',') && !str.includes('.')) {
                str = str.replace(',', '.');
            } else if (str.includes(' ')) {
                str = str.replace(/ /g, '');
            }
            // NOTA: "11.1" no entra en los ifs de arriba, pasa directo y parseFloat lo toma como 11.1 (CORRECTO)

            const num = parseFloat(str.replace(/[^\d.\-]/g, ''));
            return isNaN(num) ? 0 : num;
        };

        return {
            distrito: datos.distrito || "N/A",
            superficie: parseNumber(datos.superficie) || 300,
            frente: parseNumber(datos.frente) || 10,
            fos: parseNumber(datos.fos) || 0.7,
            altura: parseNumber(datos.altura) || 9,
            supMaxima: parseNumber(datos.supMaxima),
            supVendible: 0
        };

    } catch (e) {
        console.error("❌ ERROR SCRAPER:", e);
        if (browser) await browser.close();
        return null;
    }
}

// ============================================================
// 3. GENERADORES SVG
// ============================================================
function generarSVGGeometria(frenteInput, superficieInput) {
    const frente = parseFloat(frenteInput) || 10;
    const superficie = parseFloat(superficieInput) || 300;
    const fondo = (frente > 0) ? (superficie / frente) : 30;
    const maxDim = Math.max(frente, fondo);
    const scale = 200 / maxDim;
    const w = frente * scale;
    const h = fondo * scale;
    const x = (250 - w) / 2;
    const y = (250 - h) / 2;

    return `
    <svg width="250" height="250" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#F8F9FA"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFE0B2" stroke="#F57C00" stroke-width="2" />
        <text x="${x + w / 2}" y="${y - 10}" font-family="Montserrat" font-size="12" text-anchor="middle" fill="#1A1A1A">${frente.toFixed(2)}m</text>
        <text x="${x - 10}" y="${y + h / 2}" font-family="Montserrat" font-size="12" text-anchor="middle" transform="rotate(-90, ${x - 10}, ${y + h / 2})" fill="#1A1A1A">${fondo.toFixed(2)}m</text>
        <text x="125" y="240" font-family="Orbitron" font-size="10" text-anchor="middle" fill="#777">GEOMETRÍA ESTIMADA</text>
    </svg>`;
}

function generarSVGFOSRealista(fosInput) {
    const fos = parseFloat(fosInput) || 0.70;
    const size = 180;
    const padding = 35;
    const builtHeight = size * fos;
    const porcentaje = (fos * 100).toFixed(0);

    return `
        <svg width="250" height="320" xmlns="http://www.w3.org/2000/svg">
        <rect x="${padding}" y="${padding}" width="${size}" height="${size}" fill="#F3F4F6" stroke="#1A1A1A" stroke-width="2" />
        <rect x="${padding}" y="${padding + (size - builtHeight)}" width="${size}" height="${builtHeight}" fill="#D32F2F" opacity="0.9" />
        <text x="125" y="${padding + size - builtHeight / 2 + 10}" font-family="Orbitron" font-weight="bold" fill="white" font-size="32" text-anchor="middle" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${porcentaje} %</text>
        <text x="125" y="${padding + size + 20}" font-family="Montserrat" font-size="10" text-anchor="middle" fill="#4B5563">FOS: ${fos}</text>
        <text x="125" y="${padding + size + 35}" font-family="Montserrat" font-size="10" text-anchor="middle" fill="#4B5563">Representación de ocupación</text>
        <text x="125" y="${padding + size + 50}" font-family="Montserrat" font-size="10" text-anchor="middle" fill="#4B5563">en Planta Baja</text>
    </svg>`;
}

function generarSVGEnvolventeVerticalPro(alturaMaxima) {
    const altura = parseFloat(alturaMaxima) || 12;
    const pisos = Math.floor(altura / 3);
    const canvasH = 350;
    const canvasW = 350;
    const groundY = 310;
    const floorHeightPx = (pisos > 0) ? 220 / pisos : 0;
    const buildingW = 120;
    const axisX = 90;
    const startX = 170;

    let floorsHtml = "";
    for (let i = 0; i < pisos; i++) {
        const yPos = groundY - ((i + 1) * floorHeightPx);
        const label = (i === 0) ? "Planta Baja" : `${i}º Piso`;
        const bgColor = (i === 0) ? "#D1D5DB" : "#F3F4F6";
        floorsHtml += `
        <rect x="${startX}" y="${yPos}" width="${buildingW}" height="${floorHeightPx}" fill="${bgColor}" stroke="#1A1A1A" stroke-width="1.5" />
            <text x="${startX + buildingW / 2}" y="${yPos + floorHeightPx / 2 + 4}" font-family="Montserrat" font-size="9" text-anchor="middle" fill="#374151">${label}</text>
    `;
    }

    return `
        <svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
        <line x1="${axisX}" y1="${groundY}" x2="${axisX}" y2="${groundY - 250}" stroke="#1A1A1A" stroke-width="1" />
        <text x="${axisX - 5}" y="${groundY - 5}" font-family="Montserrat" font-size="10" text-anchor="end">0.00 m</text>
        <line x1="${axisX + 20}" y1="${groundY - (altura * (220 / altura))}" x2="${startX + buildingW}" y2="${groundY - (altura * (220 / altura))}" stroke="#D32F2F" stroke-width="2" stroke-dasharray="4" />
        <text x="${axisX - 5}" y="${groundY - 225}" font-family="Orbitron" font-weight="bold" fill="#D32F2F" font-size="12" text-anchor="end">${altura.toFixed(2)} m</text>
        <text x="${axisX - 5}" y="${groundY - 212}" font-family="Montserrat" font-size="8" fill="#1A1A1A" text-anchor="end">Altura Máxima</text>
        ${floorsHtml}
        <text x="${canvasW / 2}" y="${canvasH - 10}" font-family="Orbitron" font-weight="bold" font-size="11" fill="#1A1A1A" text-anchor="middle">
            Potencial: PB + ${Math.max(pisos - 1, 0)} Pisos
        </text>
        <line x1="${axisX}" y1="${groundY}" x2="${canvasW}" y2="${groundY}" stroke="#1A1A1A" stroke-width="4" stroke-linecap="square" />
    </svg>`;
}

// ============================================================
// 4. HTML BUILDER
// ============================================================
function armarHTML(datos, partida) {
    const asset = (fileBaseName) => {
        const possibleNames = [fileBaseName, 'logo 002', 'logo'];
        const extensions = ['.jpg', '.png', '.jpeg'];
        for (const name of possibleNames) {
            for (const ext of extensions) {
                const fullPath = path.join(ASSETS_FOLDER, name + ext);
                if (fs.existsSync(fullPath)) {
                    const bitmap = fs.readFileSync(fullPath);
                    const mime = (ext === '.png') ? 'image/png' : ((ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream');
                    return `data:${mime};base64,${Buffer.from(bitmap).toString('base64')}`;
                }
            }
        }
        return '';
    };

    const distritoLimpio = (datos && datos.distrito) ? String(datos.distrito).split(' ')[0].trim() : 'N/A';
    const svgGeometria = generarSVGGeometria(datos.frente, datos.superficie);
    const svgFOS = generarSVGFOSRealista(datos.fos);
    const svgEnvolvente = generarSVGEnvolventeVerticalPro(datos.altura);
    const pisosEstimados = Math.floor((datos.altura - 3) / 3);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Montserrat:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
        :root {--red: #D32F2F; --black: #1A1A1A; --gray: #F8F9FA; }
        * {box-sizing: border-box; margin: 0; padding: 0; }
        body {font-family: 'Montserrat', sans-serif; background: #FFF; color: var(--black); }
        .page {width: 210mm; height: 296mm; position: relative; overflow: hidden; page-break-after: always; }
        .header {height: 90px; background: var(--black); display: flex; justify-content: space-between; align-items: center; padding: 0 40px; border-bottom: 5px solid var(--red); }
        .header h2 {color: white; font-family: 'Orbitron'; font-size: 14px; letter-spacing: 2px; opacity: 0.9; text-transform: uppercase;}
        .header-right {display: flex; flex-direction: column; align-items: center; }
        .header-logo {height: 40px; object-fit: contain; }
        .header-subtext {color: white; font-family: 'Orbitron'; font-size: 9px; margin-top: 5px; letter-spacing: 1px; }
        .content {padding: 50px; padding-top: 30px; }
        h1 {font-family: 'Orbitron'; font-size: 42px; line-height: 1; margin-bottom: 10px; }
        p {font-size: 12px; line-height: 1.6; text-align: justify; color: #444; }
        .data-grid {display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; }
        .card {background: var(--gray); padding: 15px; border-left: 5px solid var(--red); }
        .card label {display: block; font-family: 'Orbitron'; font-size: 10px; color: #777; margin-bottom: 5px; }
        .card val {font-size: 20px; font-weight: bold; }
        .analysis-box {margin-top: 30px; padding: 20px; background: var(--black); color: white; border-radius: 0 20px 0 0; }
        .analysis-box h3 {font-family: 'Orbitron'; color: var(--red); font-size: 14px; margin-bottom: 10px; }
        .analysis-box p {color: #DDD; }
        .footer-page {position: absolute; bottom: 30px; left: 50px; right: 50px; display: flex; justify-content: space-between; align-items: center; font-family: 'Orbitron'; font-size: 10px; color: var(--black); }
        .footer-arneaz {color: var(--black); font-weight: bold; font-size: 10px; }
    </style>
</head>
<body>

<div class="page">
    <div class="header">
        <h2>Análisis de Potencial Inmobiliario</h2>
        <div class="header-right">
            <img src="${asset('logo 002')}" class="header-logo">
            <div class="header-subtext">SOLUCIONES INTEGRALES</div>
        </div>
    </div>
    <div class="content">
        <p style="font-family: 'Orbitron'; color: var(--black); letter-spacing: 2px; font-size: 42px; margin-top: 10px; font-weight: bold; text-transform: uppercase; line-height: 1;">INFORME TÉCNICO OFICIAL</p>
        <h1><span style="color: var(--red);">ADREMA: ${partida}</span></h1>
        <div style="width: 80px; height: 6px; background: var(--red); margin: 20px 0;"></div>
        <div class="data-grid">
            <div style="text-align: center;">
                <h4 style="font-family: 'Orbitron'; margin-bottom: 10px;">GEOMETRÍA DEL SUELO</h4>
                ${svgGeometria}
            </div>
            <div>
                <div class="card"><label>DISTRITO</label><val>${distritoLimpio}</val></div>
                <div style="height: 10px;"></div>
                <div class="card"><label>SUPERFICIE TOTAL</label><val>${datos.superficie} m²</val></div>
                <div style="height: 10px;"></div>
                <div class="card"><label>FRENTE LOTE</label><val>${datos.frente} m</val></div>
                <div style="margin-top: 30px; text-align: center; border: 2px dashed var(--black); padding: 15px;">
                    <div style="font-family: 'Orbitron'; font-size: 10px;">INCIDENCIA ESTIMADA</div>
                    <div style="font-size: 38px; font-weight: bold; color: var(--red);">${datos.incidencia}</div>
                    <div style="font-size: 10px;">MULTIPLICADOR DE SUELO</div>
                </div>
            </div>
        </div>
    </div>
    <div class="footer-page">
        <span>ID: ${partida} | PÁGINA 01</span>
        <span class="footer-arneaz">ArNeaz Tecnology</span>
    </div>
</div>

<!-- PAGINA 2 -->
<div class="page">
    <div class="header">
        <h2>Volumetría y Normativa</h2>
        <div class="header-right">
            <img src="${asset('logo 002')}" class="header-logo">
            <div class="header-subtext">SOLUCIONES INTEGRALES</div>
        </div>
    </div>
    <div class="content">
        <div class="data-grid">
            <div style="text-align: center;">
                <h4 style="font-family: 'Orbitron'; margin-bottom: 10px;">OCUPACIÓN (F.O.S.)</h4>
                ${svgFOS}
            </div>
            <div style="text-align: center;">
                <h4 style="font-family: 'Orbitron'; margin-bottom: 10px;">ENVOLVENTE VERTICAL NORMATIVA</h4>
                ${svgEnvolvente}
            </div>
        </div>
        <div class="analysis-box">
            <h3>ANÁLISIS DE INTELIGENCIA ARTIFICIAL</h3>
            <p style="font-family: 'Montserrat'; font-size: 11px;">
                ${datos.analisis_urbano || datos.resumen}
            </p>
        </div>
        <div style="margin-top: 20px; text-align: center;">
            <div style="font-family: 'Orbitron'; font-weight: bold; font-size: 14px;">POTENCIAL CONSTRUCTIVO</div>
            <div style="font-family: 'Montserrat'; font-size: 12px; font-weight: bold;">PB + ${pisosEstimados} PISOS ALTOS (${datos.altura}m)</div>
        </div>
    </div>
    <div class="footer-page">
        <span>ID: ${partida} | PÁGINA 02</span>
        <span class="footer-arneaz">ArNeaz Tecnology</span>
    </div>
</div>

<!-- PAGINA 3 -->
<div class="page">
    <div class="header">
        <h2>Rentabilidad y Cierre</h2>
        <div class="header-right">
            <img src="${asset('logo 002')}" class="header-logo">
            <div class="header-subtext">SOLUCIONES INTEGRALES</div>
        </div>
    </div>
    <div class="content">
        <h4 style="font-family: 'Orbitron'; margin-bottom: 15px;">TABLA DE VALUACIÓN PRELIMINAR</h4>
        <table style="width: 100%; border-collapse: collapse; font-family: 'Montserrat'; font-size: 12px;">
            <tr style="background: var(--black); color: white;">
                <th style="padding: 10px; text-align: left;">INDICADOR</th>
                <th style="padding: 10px; text-align: right;">VALOR ESTIMADO</th>
            </tr>
            <tr style="border-bottom: 1px solid #CCC;">
                <td style="padding: 10px;">Sup. Vendible Estimada (bruta)</td>
                <td style="padding: 10px; text-align: right; font-weight: bold;">${datos.supVendible} m²</td>
            </tr>
            <tr style="border-bottom: 1px solid #CCC;">
                <td style="padding: 10px;">Costo Construcción</td>
                <td style="padding: 10px; text-align: right;">U$S 1050 / m²</td>
            </tr>
            <tr style="border-bottom: 1px solid #CCC;">
                <td style="padding: 10px;">Ticket Venta Promedio</td>
                <td style="padding: 10px; text-align: right;">U$S 2100 / m²</td>
            </tr>
             <tr style="background: #FFF3E0;">
                <td style="padding: 10px; color: var(--red); font-weight: bold;">RENTABILIDAD BRUTA</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: var(--red);">ALTO POTENCIAL</td>
            </tr>
        </table>
        <h4 style="font-family: 'Orbitron'; margin: 30px 0 10px 0;">CONCLUSIÓN FINAL</h4>
        <p style="font-size: 11px; line-height: 1.8;">
            ${datos.conclusion_final}
        </p>
    </div>
    <div class="footer-page">
        <span>ID: ${partida} | PÁGINA 03</span>
        <span class="footer-arneaz">ArNeaz Tecnology</span>
    </div>
</div>
</body>
</html>`;
}

// ============================================================
// 5. MAIN EXECUTION
// ============================================================
async function runTest(partida) {
    if (!partida) return console.log("Falta Adrema!");

    // 1. Scrape
    let datosTerreno = await escrapearDatosReales(partida);
    if (!datosTerreno) return;

    console.log("✅ Datos Obtenidos Raw:", datosTerreno);

    // --- VALIDACIÓN CON NORMATIVA LOCAL ---
    if (datosTerreno.distrito && datosTerreno.distrito !== "N/A") {
        const reg = findRegulation(datosTerreno.distrito, regulationsMap);
        if (reg) {
            console.log(`    > 📜 Normativa encontrada para ${datosTerreno.distrito}`);

            // 1. Validar FOS
            if (reg.tejido && reg.tejido.fos_maximo) {
                const fosReg = parseFloat(reg.tejido.fos_maximo);
                if (!isNaN(fosReg) && datosTerreno.fos === 0.7 && fosReg !== 0.7) {
                    datosTerreno.fos = fosReg;
                }
            }

            // 2. Validar Altura
            if ((!datosTerreno.altura || datosTerreno.altura === 9) && reg.tejido && reg.tejido.alturas_maximas_y_plantas) {
                let maxH = 0;
                const hData = reg.tejido.alturas_maximas_y_plantas;
                Object.values(hData).forEach(val => {
                    if (val && val.metros) maxH = Math.max(maxH, val.metros);
                });
                if (maxH > datosTerreno.altura) {
                    datosTerreno.altura = maxH;
                }
            }
        }
    }

    // 2. CÁLCULO FINANCIERO CORREGIDO
    const pisos = Math.floor((datosTerreno.altura - 3) / 3);
    const huella = (datosTerreno.superficie * datosTerreno.fos).toFixed(2);

    let supBruta;
    if (datosTerreno.supMaxima && datosTerreno.supMaxima > 0) {
        supBruta = parseFloat(datosTerreno.supMaxima).toFixed(2);
    } else {
        supBruta = (huella * (pisos + 1)).toFixed(2);
    }

    let supVendible = (supBruta * 0.8).toFixed(2);

    const costoM2 = 1050;
    const ventaM2 = 2100;

    const costoTotalVal = parseFloat(supBruta) * costoM2;
    const costoTotal = costoTotalVal.toLocaleString('es-AR');

    const ventaTotalVal = parseFloat(supVendible) * ventaM2;
    const ventaTotal = ventaTotalVal.toLocaleString('es-AR');

    const margenVal = ventaTotalVal - costoTotalVal;
    const margen = margenVal.toLocaleString('es-AR');

    // TEXTO CONCLUSIÓN IDÉNTICO
    const textoConclusion = `La altura máxima de ${datosTerreno.altura}m, con una estimación conservadora de 3m por nivel, permite la construcción de un edificio de ${pisos + 1} plantas (Planta Baja + ${pisos} pisos tipo). Asumiendo una ocupación similar en las plantas superiores, la superficie bruta total estimada ascendería a ${supBruta} m². Aplicando un factor de eficiencia del 80% para obtener la superficie vendible, se proyectan aproximadamente ${supVendible} m² de superficie comercializable. Un costo de construcción promedio de U$S ${costoM2}/m² (valor extraído de la planilla "TABLA DE VALUACIÓN PRELIMINAR") y venta de U$S ${ventaM2}/m² (valor extraído de la planilla "TABLA DE VALUACIÓN PRELIMINAR"), el costo total ascendería a U$S ${costoTotal} y los ingresos por venta a U$S ${ventaTotal}. Esto arroja un margen bruto significativo de U$S ${margen}.`;

    // 3. AI / Mock
    console.log("🤖 Generando análisis IA...");
    let datosIA;
    try {
        let contextNormativa = "";
        if (datosTerreno.distrito) {
            const regData = findRegulation(datosTerreno.distrito, regulationsMap);
            if (regData) {
                contextNormativa = `
                 [NORMATIVA OFICIAL - DISTRITO ${datosTerreno.distrito}]
                 CARÁCTER: ${JSON.stringify(regData.a_caracter)}
                 TEJIDO: ${JSON.stringify(regData.tejido)}
                 RETIROS FRENTE: ${JSON.stringify(regData.retiros_de_frente)}
                 RETIRO FONDO: ${JSON.stringify(regData.retiro_de_fondo)}
                 RETIROS LATERALES: ${JSON.stringify(regData.retiros_laterales)}
                 `;
            }
        }

        const prompt = `
Actúa como arquitecto senior. Analiza la partida ${partida} del Distrito ${datosTerreno.distrito}.
DATOS REALES:
- Superficie: ${datosTerreno.superficie} m2
- FOS: ${datosTerreno.fos}
- Altura: ${datosTerreno.altura} m
${contextNormativa}

Calcula/Redacta:
1. Incidencia del terreno (Alta/Media/Baja)
2. Resumen ejecutivo (max 50 palabras)
3. Análisis Urbano detallado (max 100 palabras). IMPORTANTE: Menciona explícitamente los retiros de frente, fondo y laterales según la normativa inyectada arriba.

Genera un JSON con textos:
{
    "incidencia": "...",
    "resumen": "...",
    "analisis_urbano": "..."
}
Responde SOLO con el JSON.
`;
        const res = await generarConReintento(prompt);
        datosIA = JSON.parse(res.response.text().replace(/```json/g, '').replace(/```/g, ''));
    } catch (e) {
        datosIA = {
            analisis_urbano: "Análisis no disponible en modo Test.",
            incidencia: "A DETERMINAR"
        };
    }

    const datosFinales = {
        ...datosIA,
        ...datosTerreno,
        supVendible: supVendible,
        supBruta: supBruta,
        conclusion_final: textoConclusion
    };

    // 4. PDF
    console.log("📄 Generando PDF (Calidad Producción + Contenido Full)...");
    const htmlContent = armarHTML(datosFinales, partida);
    const outputFilename = `Test_Informe_${partida}_${Date.now()}.pdf`;
    const outputPath = path.join(OUTPUT_FOLDER, outputFilename);

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });
    await browser.close();

    console.log(`🎉 PDF Generado: ${outputPath}`);

    // Auto-Open
    exec(`start "" "${outputPath}"`);
}

runTest(process.argv[2]);
