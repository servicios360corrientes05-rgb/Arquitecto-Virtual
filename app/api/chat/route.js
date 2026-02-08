
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRegulationsContext } from '@/lib/pdfLoader';
import { loadAllRegulations, findRegulation } from '@/lib/regulationsLoader';

// Cache regulations in memory to avoid reading files on every request
const regulationsMap = loadAllRegulations();

// Initialize OpenAI
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: apiKey });

export async function POST(req) {
    try {
        const { messages } = await req.json();

        // Safety check for API Key
        if (!apiKey) {
            return NextResponse.json({
                role: 'assistant',
                content: "Error: No se ha configurado la API Key de OpenAI. Por favor verifique OPENAI_API_KEY en las variables de entorno."
            });
        }

        console.log("--- CHAT REQUEST START (OPENAI) ---");

        // 1. Get Context (RAG)
        const context = await getRegulationsContext();

        // 2. Parse User Query for District (Flexible)
        const lastMessageContent = messages[messages.length - 1].content;

        // Estrategia Doble: Regex con prefijo O búsqueda de tokens conocidos
        let distMatch = lastMessageContent.match(/(?:Distrito|Zona|en)\s*([A-Z0-9.-]+)/i);
        let district = distMatch ? distMatch[1] : null;
        let invalidDistrictAttempt = null;

        // VALIDACIÓN: Si el regex capturó algo (ej: "DISTRITO" en "en DISTRITO CN"), verificar si es real.
        // Si no es un distrito válido, guardamos el intento para el Protocolo UX Caso B.
        if (district) {
            const isValid = findRegulation(district, regulationsMap);
            if (!isValid) {
                console.log(`⚠️ Regex capturó '${district}' pero no es válido. Guardando para UX Caso B...`);
                invalidDistrictAttempt = district; // Guardar el intento inválido para el mensaje de error
                district = null;
            }
        }

        // Si no capturó con regex (o era inválido), intentar buscar tokens conocidos
        if (!district) {
            const words = lastMessageContent.split(/[\s,¿?]+/);
            for (const word of words) {
                // Ignorar palabras comunes cortas para no falsos positivos
                if (word.length < 2) continue;

                // Intentar ver si `findRegulation` lo reconoce
                const found = findRegulation(word, regulationsMap);
                if (found) {
                    district = word;
                    console.log(`🤖 Chatbot: Distrito detectado por token: ${district}`);
                    break;
                }
            }
        }

        const frontMatch = lastMessageContent.match(/(?:Frente|ancho)\s*([0-9.,]+)/i);
        const depthMatch = lastMessageContent.match(/(?:Fondo|largo|profundidad)\s*([0-9.,]+)/i);
        const surfMatch = lastMessageContent.match(/(?:Superficie|Area|Lote)\s*([0-9.,]+)/i);

        let urbanAnalysisContext = "";

        if (district && (frontMatch || surfMatch || depthMatch)) {
            // Re-asignar district code limpio si viene de regex
            // ... (rest of logic)
            const front = frontMatch ? parseFloat(frontMatch[1].replace(',', '.')) : 0;
            const depth = depthMatch ? parseFloat(depthMatch[1].replace(',', '.')) : 0;
            let surface = surfMatch ? parseFloat(surfMatch[1].replace(',', '.')) : 0;

            if (surface === 0 && front > 0 && depth > 0) {
                surface = front * depth;
            }

            const { calculateUrbanIndicators } = await import('@/lib/urbanPlanning');
            const indicators = calculateUrbanIndicators(district, surface, front);

            urbanAnalysisContext = `
            [DATOS CALCULADOS AUTOMÁTICAMENTE PARA ESTA CONSULTA]
            Distrito Detectado: ${district}
            Medidas Detectadas: Frente ${front}m, Superficie ${surface}m².
            
            RESULTADOS DEL CÁLCULO DE POTENCIAL:
            - F.O.T. Máximo Aplicable: ${indicators.fotMax}
            - Altura Máxima Permitida: ${indicators.heightMax}m
            - Pisos Estimados: ${indicators.pisos}
            - Volumen Total Edificable: ${indicators.volTotal} m³
            - Área Máxima por Piso: ${indicators.areaPorPiso}
            
            Instrucción Crítica: UTILIZA ESTOS DATOS EXACTOS EN TU RESPUESTA.
            `;
        }

        // 3. Focused District Context (Structured + Unstructured)
        let specificDistrictContext = "";

        if (district) {
            // Already have district string
            const regData = findRegulation(district, regulationsMap);
            if (regData) {
                console.log(`--- INJECTING STRUCTURED JSON FOR ${district} ---`);
                specificDistrictContext += `
                 [NORMATIVA OFICIAL ESTRUCTURADA PARA DISTRITO ${district}]
                 Estos datos provienen de la ficha técnica oficial (${district}). ÚSALOS TEXTUALMENTE.
                 
                 CARÁCTER: ${JSON.stringify(regData.a_caracter)}
                 DISPOSICIONES: ${JSON.stringify(regData.disposiciones_generales)}
                 TEJIDO (Alturas, FOS, FOT): ${JSON.stringify(regData.tejido)}
                 RETIROS DE FRENTE: ${JSON.stringify(regData.retiros_de_frente)}
                 RETIRO DE FONDO: ${JSON.stringify(regData.retiro_de_fondo)}
                 RETIROS LATERALES: ${JSON.stringify(regData.retiros_laterales)}
                 OBSERVACIONES: ${JSON.stringify(regData.observaciones)}
                 -------------------------------------------------------
                 `;
            }

            // B. Unstructured Search in PDF Context
            const regex = new RegExp(`(?:Distrito|Zona)\\s*${district.replace('.', '\\.?')}\\b`, 'gi');
            let bestMatch = null;
            let maxScore = -1;
            let match;
            while ((match = regex.exec(context)) !== null) {
                const start = match.index;
                const atomicContext = context.substring(start, start + 5000);
                let score = 0;
                if (atomicContext.match(/FOS|F\.O\.S/i)) score += 2;
                if (atomicContext.match(/FOT|F\.O\.T/i)) score += 2;
                if (atomicContext.match(/Retiro/i)) score += 1;
                if (atomicContext.match(/Altura/i)) score += 1;
                if (atomicContext.match(/Usos/i)) score += 1;
                if (atomicContext.match(/Car.cter/i)) score += 2;
                if (atomicContext.match(/\.{4,}/)) score -= 10;
                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = atomicContext;
                }
            }

            if (bestMatch && maxScore > 0) {
                specificDistrictContext += `
                 [CONTEXTO ADICIONAL DEL LIBRO DE CÓDIGO]
                 ${bestMatch}
                 -------------------------------------------------------
                 `;
            }
        }

        const systemPrompt = `
    Eres el "Arquitecto Virtual", experto en normativas de Corrientes.
    ${specificDistrictContext}
    ${urbanAnalysisContext}
    
    [ESTADO DE VALIDACIÓN DE DISTRITO]
    Distrito Identificado: ${district || "Ninguno"}
    Intento de Distrito No Válido: ${invalidDistrictAttempt || "Ninguno"}
    
    Instrucciones Generales:
    1. Si hay [DATOS CALCULADOS AUTOMÁTICAMENTE], son la VERDAD ABSOLUTA para esta consulta. Úsalos con prioridad total.
    2. Si hay [NORMATIVA OFICIAL ESTRUCTURADA], es la fuente primaria para FOS, FOT, Alturas y Retiros.
    3. Responde basándote en el "CONTEXTO DE NORMATIVAS" proporcionado abajo y en los datos estructurados.
    4. PROTOCOLO UX - CASO DE ERROR:
       Si "Intento de Distrito No Válido" es distinto de "Ninguno" y el usuario pregunta por él:
       NO digas "No encuentro información".
       DI: "No logro localizar el Distrito ${invalidDistrictAttempt || "X"} en la normativa vigente de Corrientes. Por favor verifica si el código es correcto, o si te refieres a una zona cercana."
    5. Si la respuesta no está en el contexto y NO es un error de distrito, di "No encuentro información específica sobre eso en las normativas cargadas."
    6. Sé conciso y profesional.
    7. Habla siempre en Español Latinoamericano.
    
    CONTEXTO DE NORMATIVAS (GENERAL):
    ${context.substring(0, 50000)} 
    `;
        // Nota: El contexto general se recorta a 50k caracteres para no exceder tokens de entrada, 
        // confiando más en la inyección específica de arriba.

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        const reply = completion.choices[0].message.content;

        return NextResponse.json({ role: 'assistant', content: reply });

    } catch (error) {
        console.error("Chat API Error (OpenAI):", error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
