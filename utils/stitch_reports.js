const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

/**
 * Script de Stitching: Une el Informe Municipal con la Mensura descargada
 * Aplica branding Volcanic (rojo #FF4500 en metadatos)
 */
async function stitchReports(adrema) {
    console.log(`📋 Iniciando Stitching para Adrema: ${adrema}`);

    const OUTPUT_FOLDER = path.resolve('./public/informes');
    const DATA_FOLDER = path.resolve('./data');

    // 1. Buscar el más reciente Informe Municipal generado para esta Adrema
    const municipalPattern = `Informe_${adrema}`;
    const informeFiles = fs.readdirSync(OUTPUT_FOLDER).filter(f => f.startsWith(municipalPattern) && f.endsWith('.pdf'));

    if (informeFiles.length === 0) {
        throw new Error(`No se encontró Informe Municipal para ${adrema}. Ejecutá watcher.js primero.`);
    }

    // Ordenar por fecha (nombre incluye timestamp) y tomar el más reciente
    informeFiles.sort((a, b) => b.localeCompare(a));
    const municipalFile = path.join(OUTPUT_FOLDER, informeFiles[0]);
    console.log(`📄 Informe Municipal: ${informeFiles[0]}`);

    // 2. Ruta de Mensura
    const mensuraFile = path.join(OUTPUT_FOLDER, `Mensura_${adrema}.pdf`);
    if (!fs.existsSync(mensuraFile)) {
        throw new Error(`Mensura no encontrada: ${mensuraFile}`);
    }
    console.log(`📄 Mensura: Mensura_${adrema}.pdf`);

    // 3. Cargar datos extraídos
    const extractedDataPath = path.join(DATA_FOLDER, 'mensura_extracted_data.json');
    let metadata = { titular: 'No extraído', manzana: 'N/A', ubicacion: 'N/A' };

    if (fs.existsSync(extractedDataPath)) {
        metadata = JSON.parse(fs.readFileSync(extractedDataPath, 'utf-8'));
        console.log('✅ Metadatos cargados:', metadata);
    } else {
        console.log('⚠ Archivo de metadatos no encontrado. Usando valores por defecto.');
    }

    // 4. Cargar PDFs con pdf-lib
    const municipalBytes = fs.readFileSync(municipalFile);
    const mensuraBytes = fs.readFileSync(mensuraFile);

    const municipalPdf = await PDFDocument.load(municipalBytes);
    const mensuraPdf = await PDFDocument.load(mensuraBytes);

    console.log(`📊 Municipal: ${municipalPdf.getPageCount()} páginas`);
    console.log(`📊 Mensura: ${mensuraPdf.getPageCount()} páginas`);

    // 5. STITCHING: Copiar páginas de Mensura al final del Municipal
    const copiedPages = await municipalPdf.copyPages(mensuraPdf, mensuraPdf.getPageIndices());
    copiedPages.forEach((page) => {
        municipalPdf.addPage(page);
    });

    console.log(`✅ Páginas fusionadas. Total: ${municipalPdf.getPageCount()} páginas`);

    // 6. Aplicar Metadatos "Volcanic" (Rojo en el subject/keywords)
    municipalPdf.setTitle(`Informe Completo - Adrema ${adrema}`);
    municipalPdf.setSubject(`Titular: ${metadata.titular} | Manzana: ${metadata.manzana} | Ubicación: ${metadata.ubicacion}`);
    municipalPdf.setKeywords(['Arquitecto Virtual', 'Volcanic Red', 'Informe Inmobiliario', adrema]);
    municipalPdf.setProducer('ArNeaz Tecnology - Arquitecto Virtual');
    municipalPdf.setCreator('Antigravity AI');

    // 7. Guardar PDF Final con Timestamp para evitar colisiones
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const finalFilename = `Informe_Final_Adrema_${adrema}_${timestamp}.pdf`;
    const finalPath = path.join(OUTPUT_FOLDER, finalFilename);
    const pdfBytes = await municipalPdf.save();
    fs.writeFileSync(finalPath, pdfBytes);

    console.log(`✅ PDF Final guardado: ${finalPath}`);
    console.log(`🌐 Disponible en: http://localhost:3000/informes/${finalFilename}`);

    return {
        path: finalPath,
        pages: municipalPdf.getPageCount(),
        metadata
    };
}

// CLI Execution
if (require.main === module) {
    const adrema = process.argv[2] || 'A10169791';

    stitchReports(adrema)
        .then(result => {
            console.log('\n🎉 INTEGRACIÓN COMPLETADA CON ÉXITO');
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => {
            console.error('❌ Error:', err.message);
            process.exit(1);
        });
}

module.exports = { stitchReports };
