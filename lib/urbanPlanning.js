/**
 * Calcula los indicadores urbanísticos para un terreno.
 * @param {string} district - Código del distrito (ej: "EM.2", "CN", "R1")
 * @param {number} surface - Superficie del terreno en m²
 * @param {number} frontage - Frente del terreno en metros
 * @param {object|null} regData - Objeto de normativa ya resuelto por regulationsLoader (opcional)
 */
export function calculateUrbanIndicators(district, surface, frontage, regData = null) {
    // --- Valores por defecto (último fallback absoluto) ---
    let fotMax = 3.0;
    let heightMax = 21.0;
    let fosMax = 0.75;
    let basamentoAltura = 9.0;
    let regulationContext = "";

    // --- Extraer valores dinámicamente del JSON de regulaciones ---
    if (regData && regData.tejido) {
        const tejido = regData.tejido;

        // FOT: priorizar uso_residencial, luego fot_maximos genérico, luego fot_maximo directo
        if (tejido.fot_maximos) {
            fotMax = tejido.fot_maximos.uso_residencial
                ?? tejido.fot_maximos.PL
                ?? tejido.fot_maximos.SPL
                ?? tejido.fot_maximos.EM
                ?? fotMax;
        } else if (tejido.fot_maximo != null) {
            fotMax = parseFloat(tejido.fot_maximo) || fotMax;
        }

        // FOS
        if (tejido.fos_maximo != null) {
            fosMax = parseFloat(tejido.fos_maximo) || fosMax;
        }

        // Altura máxima: jerarquía PL_SPL > PL > SPL > EM > metros directo
        if (tejido.alturas_maximas_y_plantas) {
            const alt = tejido.alturas_maximas_y_plantas;
            const altMetros =
                alt.PL_SPL?.metros
                ?? alt.PL?.metros
                ?? alt.SPL?.metros
                ?? alt.SPL_EM?.metros
                ?? alt.todas_tipologias?.metros
                ?? alt.metros
                ?? null;
            if (altMetros != null) heightMax = parseFloat(altMetros);

            // Altura de basamento
            if (alt.basamento?.metros != null) {
                basamentoAltura = parseFloat(alt.basamento.metros);
            }
        }

        // Contexto de regulación
        const caracter = regData.a_caracter?.descripcion
            || regData.a_caracter?.Distrito_R1
            || regData.a_caracter?.a1_propuesta
            || "";
        regulationContext = `Distrito ${district}: ${caracter}. F.O.T. Máximo ${fotMax}. Altura Máxima ${heightMax}m. F.O.S. ${fosMax}.`;
    } else {
        // Fallback hardcoded solo para CN y C1 (datos verificados)
        if (district === 'CN') {
            fotMax = 6.8;
            heightMax = 30.0;
            fosMax = 0.75;
            regulationContext = "Distrito CN: Zona Residencial de Alta Densidad. F.O.T. Máximo 6.8. Altura Máxima 30m.";
        } else if (district === 'C1') {
            fotMax = 5.0;
            heightMax = 24.0;
        }
    }

    // --- Cálculos ---
    const pisos = Math.floor(heightMax / 3);
    let volTotal = "Calculando...";
    let areaPorPiso = "Calculando...";

    if (surface > 0) {
        volTotal = (surface * fotMax).toLocaleString('es-AR', { maximumFractionDigits: 2 });

        const groundFloorArea = surface * fosMax;

        if (district === 'CN') {
            // Algoritmo específico CN: basamento (piso 1-3) + torre con retiro de frente
            const basementArea = groundFloorArea;
            const towerRestiroArea = frontage * 5;
            let towerArea = Math.max(basementArea - towerRestiroArea, 0);
            const format = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

            if (pisos > 3) {
                areaPorPiso = `${format(basementArea)} m² del 1º al 3º / ${format(towerArea)} m² del 4º al ${pisos}º`;
            } else {
                areaPorPiso = `${format(basementArea)} m²`;
            }
        } else {
            areaPorPiso = `${groundFloorArea.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m² (Estimado promediado)`;
        }
    }

    return {
        fotMax,
        heightMax,
        fosMax,
        basamentoAltura,
        pisos,
        volTotal,
        areaPorPiso,
        regulationContext
    };
}
