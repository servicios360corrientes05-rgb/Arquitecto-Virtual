
const fs = require('fs');
const path = require('path');

const REGULATIONS_DIR = path.join(process.cwd(), 'data', 'regulations');

function loadAllRegulations() {
    console.log(`📂 Cargando normativas desde: ${REGULATIONS_DIR}`);
    const regulationsMap = new Map();

    if (!fs.existsSync(REGULATIONS_DIR)) {
        console.warn("⚠️ No se encontró la carpeta 'data/regulations'.");
        return regulationsMap;
    }

    const files = fs.readdirSync(REGULATIONS_DIR);

    files.forEach(file => {
        if (file.endsWith('.js') || file.endsWith('.json')) {
            try {
                const filePath = path.join(REGULATIONS_DIR, file);
                const content = fs.readFileSync(filePath, 'utf8');

                // Intentar parsear como JSON directo
                // Aunque la extension sea .js, el contenido es JSON array en los ejemplos vistos
                const data = JSON.parse(content);

                if (Array.isArray(data)) {
                    data.forEach(item => {
                        // Cada item es un objeto con una clave principal (ej: "5.1.1_Distrito_R1")
                        const keys = Object.keys(item);
                        keys.forEach(key => {
                            const districtData = item[key];
                            if (districtData && districtData.identificacion && districtData.identificacion.distritos) {
                                districtData.identificacion.distritos.forEach(code => {
                                    // Normalizar codigo (ej: "R1" -> "R1")
                                    regulationsMap.set(code.trim().toUpperCase(), districtData);
                                });
                            }
                        });
                    });
                }
            } catch (e) {
                console.error(`❌ Error cargando normativa ${file}: ${e.message}`);
            }
        }
    });

    console.log(`✅ Normativas cargadas: ${regulationsMap.size} distritos indexados.`);
    return regulationsMap;
}

/**
 * Busca la normativa para un código de distrito dado.
 * Maneja coincidencias parciales si es necesario (ej: "R3b" -> "R3.b").
 */
function findRegulation(districtCode, regulationsMap) {
    if (!districtCode) return null;

    // 1. Búsqueda Directa (Exacta)
    let code = districtCode.split(' ')[0].trim().toUpperCase(); // "R1 (Residencial...)" -> "R1"
    if (regulationsMap.has(code)) return regulationsMap.get(code);

    // 2. Búsqueda Robusta (Normalizando puntos, espacios, guiones y sinónimos comunes)
    // Ejemplo: User busca "em2", Map tiene "E. MIXTO 2"
    const normalize = (str) => {
        return str.toUpperCase()
            .replace('MIXTO', 'M')  // E. MIXTO 2 -> E M 2
            .replace(/[\.\s-]/g, ''); // E M 2 -> EM2
    };

    // Normalizar input
    const target = normalize(districtCode);

    // Iterar todas las llaves y comparar normalizadas
    for (const [key, val] of regulationsMap.entries()) {
        if (normalize(key) === target) {
            console.log(`🔍 Coincidencia robusta: '${districtCode}' interpretado como '${key}'`);
            return val;
        }

        // Match parcial para casos complejos (ej: "Distrito R1" conteniendo "R1")
        // Ojo: Evitar falsos positivos (ej: "R1" dentro de "R10")
        const normKey = normalize(key);
        if (target.includes(normKey) && target.length < normKey.length + 5) {
            console.log(`🔍 Coincidencia parcial: '${districtCode}' contiene '${key}'`);
            return val;
        }
    }

    return null;
}

module.exports = { loadAllRegulations, findRegulation };
