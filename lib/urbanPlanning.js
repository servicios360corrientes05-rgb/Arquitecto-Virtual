export function calculateUrbanIndicators(district, surface, frontage) {
    let fotMax = 3.0; // Default fallback
    let heightMax = 21.0; // Default fallback (7 floors)
    let pisos = 7;
    let volTotal = "Calculando...";
    let areaPorPiso = "Calculando...";
    let regulationContext = "";

    // Normative Rules (Hardcoded based on verified PDF data for specific districts)
    // In a real app, this might come from a DB or parsed PDF text passed in.
    if (district === 'CN') {
        fotMax = 6.8;
        heightMax = 30.0;
        regulationContext = "Distrito CN: Zona Residencial de Alta Densidad. F.O.T. Máximo 6.8. Altura Máxima 30m.";
    } else if (district === 'C1') {
        fotMax = 5.0; // Example
        heightMax = 24.0;
    }

    // Calculations
    pisos = Math.floor(heightMax / 3);
    const fos = 0.75; // Using the verified FOS from previous steps for CN, or default

    if (surface > 0) {
        // Volume Calculation
        volTotal = (surface * fotMax).toLocaleString('es-AR', { maximumFractionDigits: 2 }); // Use locale formatting

        // Area Per Floor Calculation
        const groundFloorArea = (surface * fos);

        if (district === 'CN') {
            // Specific Algorithm for CN requested by User
            // Rule: Basement (Floors 1-3) = Max FOS
            // Rule: Tower (Floors 4-10) = Basement - (Restiro de Frente 5m * Frente)

            const basementArea = groundFloorArea;
            const towerRestiroArea = frontage * 5; // 5 meters setback across the frontage
            let towerArea = basementArea - towerRestiroArea;

            // Safety check: tower area shouldn't be negative
            if (towerArea < 0) towerArea = 0;

            const format = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

            if (pisos > 3) {
                // "174.27 m² del 1º al 3º / 132.77 m² del 4º al 10º"
                areaPorPiso = `${format(basementArea)} m² del 1º al 3º / ${format(towerArea)} m² del 4º al ${pisos}º`;
            } else {
                areaPorPiso = `${format(basementArea)} m²`;
            }
        } else {
            // Default logic
            areaPorPiso = `${groundFloorArea.toFixed(2)} m² (Estimado promediado)`;
        }
    }

    return {
        fotMax,
        heightMax,
        pisos,
        volTotal,
        areaPorPiso,
        regulationContext
    };
}
