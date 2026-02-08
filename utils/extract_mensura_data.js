const fs = require('fs');
const path = require('path');

/**
 * Simplif Fallback: Usa datos ya capturados de ultimo_scrapeo.json (Provincia)
 * en lugar de intentar parsear el PDF de la Mensura
 */
function useScrapedData() {
    const jsonPath = path.join(__dirname, '../data/ultimo_scrapeo.json');

    if (!fs.existsSync(jsonPath)) {
        console.log('⚠ No se encontró data/ultimo_scrapeo.json');
        return {
            titular: 'No extraído',
            manzana: 'N/A',
            ubicacion: 'Consultar Registro'
        };
    }

    const scraped = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    // De ultimo_scrapeo: puede tener titulares, superficieDGC, etc.
    return {
        titular: scraped.titulares || 'No detectado',
        manzana: 'N/A', // No disponible en scraper actual
        ubicacion: 'Ver Mensura adjunta', // No incluimos en scraper
        superficieDGC: scraped.superficieDGC || '0'
    };
}

// CLI Execution
if (require.main === module) {
    const data = useScrapedData();

    // Guardar en formato esperado
    const outputPath = path.join(__dirname, '../data/mensura_extracted_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log('✅ Datos simplificados guardados:', data);
    console.log(`📁 Ubicación: ${outputPath}`);
}

module.exports = { useScrapedData };
