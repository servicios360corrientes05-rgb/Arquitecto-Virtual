
import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import OpenAI from 'openai';
import { loadAllRegulations, findRegulation } from '@/lib/regulationsLoader';

// Cache regulations
const regulationsMap = loadAllRegulations();

// Initialize OpenAI
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: apiKey });

export async function POST(req) {
    try {
        const { adrema } = await req.json();

        if (!adrema) {
            return NextResponse.json({ error: 'Adrema is required' }, { status: 400 });
        }

        // --- CAPA 1.5: VALIDACIÓN DE INTENCIÓN (UX Protocol) ---
        // Valida formato "A" seguido de numeros (ej: A10169791)
        const regexAdrema = /^[A-Z]\s*\d{4,}$/i;
        if (!regexAdrema.test(adrema)) {
            console.log(`⛔ Bloqueo UX: Adrema inválido '${adrema}'`);
            return NextResponse.json({
                details: "He recibido tu solicitud para el análisis de parcela, pero el número de Adrema ingresado parece tener un error de formato. Para garantizar la precisión del informe municipal en Corrientes, ¿podrías confirmarme el código exacto de tu boleta?"
            }, { status: 400 });
        }

        console.log(`Starting analysis for Adrema: ${adrema}`);

        // SMART FALLBACK ALGORITHM
        let scraperData = null;
        let usedFallback = false;

        try {
            // Race: Scraper vs Timeout (120 seconds)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout: El sitio municipal tardó demasiado en responder (120s). Intente nuevamente.")), 120000)
            );

            const scraperPromise = (async () => {
                const browser = await chromium.launch({ headless: true });
                try {
                    const context = await browser.newContext({
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
                    });
                    const page = await context.newPage();

                    console.log("Navigating to municipal site...");
                    await page.goto('https://sistemas.ciudaddecorrientes.gov.ar/usosuelo/', { timeout: 30000, waitUntil: 'domcontentloaded' });

                    // HELPER: Robust Selection
                    const selectRobust = async (selector, value) => {
                        try {
                            await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
                            await page.selectOption(selector, value);
                            await page.evaluate(({ sel, val }) => {
                                const el = document.querySelector(sel);
                                if (el) {
                                    el.value = val;
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }, { sel: selector, val: value });
                            await page.waitForTimeout(1500);
                        } catch (e) {
                            console.warn(`Robust Select Warning ${selector}: ${e.message}`);
                        }
                    };

                    await selectRobust('#t_uso_suelo', '1');
                    await selectRobust('#tipo_actividad', '1');

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
                    await page.waitForTimeout(2500);

                    await selectRobust('#ubicacion', 'adrema');
                    await page.waitForSelector('#adrema', { state: 'visible', timeout: 5000 });
                    await page.fill('#adrema', adrema);
                    await page.waitForTimeout(1000);

                    await page.click('#siguiente');

                    console.log("   > Waiting for AJAX results...");
                    try {
                        await page.waitForFunction(() => {
                            const body = document.body.innerText;
                            return body.includes('Distrito:') || body.includes('Entre Medianeras') || body.includes('No se encontraron');
                        }, { timeout: 90000 });
                    } catch (e) {
                        console.warn("   ⚠️ Timeout waiting for data text, but proceeding to extraction fallbacks.");
                    }
                    await page.waitForTimeout(2000);

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
                            supParcela: extract(/Sup\. Parcela:\s*([\d\.]+)/i),
                            frente: extract(/Frente:\s*([\d\.]+)/i),
                            fos: extract(/Factor de ocupación de suelo:\s*([\d\.]+)/i),
                            supMaxOcupar: extract(/Superficie máxima del terreno a ocupar:\s*([\d\.]+)/i),
                            tableData
                        };
                    });

                    await browser.close();
                    if (!data) throw new Error("Could not parse data from municipal site.");

                    return {
                        distrito: data.distrito,
                        superficieTotal: data.supParcela,
                        frente: data.frente,
                        fos: data.fos,
                        supMaxOcupar: data.supMaxOcupar,
                        volumenWeb: data.tableData?.supMaxConstruir?.replace('.', ''),
                        alturaWeb: data.tableData?.altMax,
                        tableRaw: data.tableData
                    };

                } catch (innerErr) {
                    await browser.close();
                    throw innerErr;
                }
            })();

            scraperData = await Promise.race([scraperPromise, timeoutPromise]);
            console.log("Scraper successful:", scraperData);

        } catch (err) {
            console.warn("Scraper failed:", err.message);
            usedFallback = true;
            scraperData = { error: err.message };
        }

        // --- CALCULATION LOGIC ---
        const { calculateUrbanIndicators } = await import('@/lib/urbanPlanning');

        const district = scraperData?.distrito || "Desconocido";
        let surf = 0;
        let front = 0;
        let depth = 0;

        if (scraperData && !usedFallback) {
            // Convertimos a String primero para evitar errores si vienen como números
            surf = scraperData.superficieTotal ? parseFloat(String(scraperData.superficieTotal).replace(',', '.')) : 0;
            front = scraperData.frente ? parseFloat(String(scraperData.frente).replace(',', '.')) : 0;
            if (front > 0 && surf > 0) {
                depth = (surf / front).toFixed(2);
            }
        }

        const indicators = calculateUrbanIndicators(district, surf, front);
        let { fotMax, heightMax, pisos, volTotal, areaPorPiso, regulationContext } = indicators;

        // --- NEW AI DICTAMEN (OPENAI + REGULATIONS) ---
        let aiNarrative = "";

        if (usedFallback) {
            aiNarrative = "Por problemas Técnicos del Servidor Municipal, la entrega de informes se encuentra interrumpida.";
        } else {
            try {
                if (apiKey) {
                    // Inject Structured Regulations
                    let contextNormativa = "";
                    const regData = findRegulation(district, regulationsMap);

                    if (regData) {
                        contextNormativa = `
                         [NORMATIVA OFICIAL ESTRUCTURADA - DISTRITO ${district}]
                         - Carácter: ${JSON.stringify(regData.a_caracter)}
                         - Tejido (Alturas/FOS): ${JSON.stringify(regData.tejido)}
                         - Retiros Frente: ${JSON.stringify(regData.retiros_de_frente)}
                         - Retiro Fondo: ${JSON.stringify(regData.retiro_de_fondo)}
                         `;
                    }

                    const systemPrompt = `
                        Actúa como un Arquitecto Experto en el Código de Planeamiento Urbano de Corrientes.
                        Genera un "DICTAMEN TÉCNICO RESUMIDO" para un desarrollador.
                        
                        ${contextNormativa}
                        
                        DATOS DEL TERRENO:
                        Distrito: ${district}
                        Superficie: ${surf} m²
                        Frente: ${front} m
                        FOS Web: ${scraperData?.fos || "0.75"}
                        Altura Web: ${scraperData?.tableRaw?.altMax || heightMax} m
                        
                        INSTRUCCIONES:
                        1. Analiza el potencial basándote en la Normativa Oficial inyectada (si existe) y los datos web.
                        2. Menciona si hay restricciones de "Retiro de Fondo" o "Basamento" específicas del distrito.
                        3. Sé directo y técnico. Max 1000 caracteres.
                        4. NO uses markdown complejo, solo texto plano y párrafos.
                    `;

                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 400
                    });

                    aiNarrative = completion.choices[0].message.content;
                } else {
                    aiNarrative = "Error: API Key no configurada.";
                }
            } catch (e) {
                console.error("OpenAI Error:", e);
                aiNarrative = "Error generando el análisis IA. Intente nuevamente.";
            }
        }

        const result = {
            distrito: district,
            superficieTotal: scraperData?.superficieTotal || (surf > 0 ? `${surf} m²` : "Sin Datos"),
            frente: scraperData?.frente || (front > 0 ? `${front} m` : "Sin Datos"),
            fondo: depth > 0 ? `${depth} m` : "Sin Datos",
            fos: scraperData?.fos || "0.70",
            supMaxOcupar: scraperData?.supMaxOcupar || "-",
            fot: fotMax.toString(),
            alturaMaxima: scraperData?.alturaWeb || `${heightMax}`,
            alturaBasamento: scraperData?.tableRaw?.altMaxBasamento || "9.00",
            pisosEstimados: pisos.toString(),
            areaPorPiso: areaPorPiso,
            volumenConstructible: scraperData?.volumenWeb || volTotal,
            supMaxComp: scraperData?.tableRaw?.supMaxComp || "-",
            reglamentoTexto: usedFallback ? "Servicio Interrumpido" : (regulationContext ? regulationContext : "Normativa Oficial"),
            analisisIA: aiNarrative,
            isFallback: usedFallback,
            rawWebData: scraperData
        };

        // Logic moved to Payment Webhook (requires payment)
        // try {
        //     const fs = await import('fs');
        //     const path = await import('path');
        //     const queuePath = path.join(process.cwd(), 'cola_de_proceso');
        //     if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath);
        //     const triggerFile = path.join(queuePath, `${adrema}.txt`);
        //     fs.writeFileSync(triggerFile, adrema);
        // } catch (watchErr) { console.error(watchErr); }

        return NextResponse.json(result);

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
