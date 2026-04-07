
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadAllRegulations, findRegulation } from '@/lib/regulationsLoader';
import fs from 'fs';
import path from 'path';

// Cache regulations
const regulationsMap = loadAllRegulations();

// --- CACHÉ DE SCRAPING ---
const CACHE_PATH = path.join(process.cwd(), 'data', 'scraper_cache.json');
const CACHE_TTL_DAYS = 30;

function loadScraperCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        }
    } catch (e) {
        console.warn("⚠️ No se pudo leer la caché del scraper:", e.message);
    }
    return {};
}

function saveScraperCache(cache) {
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.warn("⚠️ No se pudo guardar la caché del scraper:", e.message);
    }
}

function getCachedData(adrema) {
    const cache = loadScraperCache();
    const entry = cache[adrema.toUpperCase()];
    if (!entry) return null;
    const ageMs = Date.now() - new Date(entry.timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > CACHE_TTL_DAYS) {
        console.log(`⏰ Caché expirada para ${adrema} (${Math.floor(ageDays)} días)`);
        return null;
    }
    console.log(`✅ Datos del caché para ${adrema} (${Math.floor(ageDays)} días de antigüedad)`);
    return entry.data;
}

function setCachedData(adrema, data) {
    const cache = loadScraperCache();
    cache[adrema.toUpperCase()] = { data, timestamp: new Date().toISOString() };
    saveScraperCache(cache);
    console.log(`💾 Caché guardada para ${adrema}`);
}

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
        let usedCache = false;

        // 1. Verificar caché antes de scrapear
        const cachedData = getCachedData(adrema);
        if (cachedData) {
            scraperData = cachedData;
            usedCache = true;
            console.log("📦 Usando datos del caché para", adrema);
        }

        if (!scraperData) {
            try {
                const { scrapeMunicipal } = await import('@/lib/scraperMunicipal');
                const rawData = await scrapeMunicipal(adrema);
                if (rawData.distrito === 'Error') {
                    throw new Error('El scraper no pudo extraer datos del portal municipal.');
                }
                scraperData = rawData;
                setCachedData(adrema, scraperData);
                console.log("Scraper successful:", scraperData.distrito);
            } catch (err) {
                console.warn("Scraper failed:", err.message);
                // Intentar usar caché expirada como último recurso
                const expiredCache = (() => {
                    try {
                        const cache = loadScraperCache();
                        const entry = cache[adrema.toUpperCase()];
                        return entry ? entry.data : null;
                    } catch { return null; }
                })();

                if (expiredCache) {
                    console.log("🕰️ Usando caché expirada como fallback para", adrema);
                    scraperData = expiredCache;
                    usedCache = true;
                    usedFallback = false;
                } else {
                    usedFallback = true;
                    scraperData = { error: err.message };
                }
            }
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

        // Resolver normativa del distrito para los cálculos y el dictamen IA
        const regData = findRegulation(district, regulationsMap);

        const indicators = calculateUrbanIndicators(district, surf, front, regData);
        let { fotMax, heightMax, fosMax, basamentoAltura, pisos, volTotal, areaPorPiso, regulationContext } = indicators;

        // --- NEW AI DICTAMEN (OPENAI + REGULATIONS) ---
        let aiNarrative = "";

        if (usedFallback) {
            // Intentar generar dictamen genérico basado solo en la regulación del distrito
            if (apiKey && regData) {
                try {
                    const fallbackContext = `
                        [NORMATIVA OFICIAL - DISTRITO ${district}]
                        - Carácter: ${JSON.stringify(regData.a_caracter)}
                        - Tejido: ${JSON.stringify(regData.tejido)}
                    `;
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{
                            role: "system",
                            content: `Actúa como Arquitecto Experto en Corrientes. El sitio municipal está temporalmente inaccesible, pero conocemos el distrito normativo. Genera un DICTAMEN TÉCNICO RESUMIDO basado solo en la normativa vigente, indicando que los datos catastrales (superficie, frente) no pudieron obtenerse en este momento. Normativa:\n${fallbackContext}\nMáx 800 caracteres. Sin markdown complejo.`
                        }],
                        temperature: 0.7,
                        max_tokens: 350
                    });
                    aiNarrative = `⚠️ Datos del servidor municipal no disponibles. Dictamen basado en normativa del distrito:\n\n${completion.choices[0].message.content}`;
                } catch (e) {
                    console.error("OpenAI fallback error:", e);
                    aiNarrative = "Por problemas técnicos del servidor municipal, la consulta catastral se encuentra interrumpida. Intente nuevamente en unos minutos.";
                }
            } else {
                aiNarrative = "Por problemas técnicos del servidor municipal, la consulta catastral se encuentra interrumpida. Intente nuevamente en unos minutos.";
            }
        } else {
            try {
                if (apiKey) {
                    // Inject Structured Regulations (usa el regData ya resuelto)
                    let contextNormativa = "";

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
            alturaBasamento: scraperData?.tableRaw?.altMaxBasamento || `${basamentoAltura}`,
            pisosEstimados: pisos.toString(),
            areaPorPiso: areaPorPiso,
            volumenConstructible: scraperData?.volumenWeb || volTotal,
            supMaxComp: scraperData?.tableRaw?.supMaxComp || "-",
            reglamentoTexto: usedFallback ? "Servicio Interrumpido" : (regulationContext ? regulationContext : "Normativa Oficial"),
            analisisIA: aiNarrative,
            isFallback: usedFallback,
            usedCache: usedCache,
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
