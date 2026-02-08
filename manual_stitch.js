const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function stitch() {
    console.log('🔧 Stitching Manual - Lightweight Mode');

    // Rutas de archivos
    const OUTPUT_FOLDER = './public/informes';

    // Buscar el informe municipal más reciente
    const municipalFiles = fs.readdirSync(OUTPUT_FOLDER)
        .filter(f => f.startsWith('Informe_A10169791') && f.endsWith('.pdf') && !f.includes('Final'))
        .sort((a, b) => b.localeCompare(a));

    if (municipalFiles.length === 0) {
        throw new Error('No se encontró Informe Municipal para A10169791');
    }

    const municipalPath = path.join(OUTPUT_FOLDER, municipalFiles[0]);
    const mensuraPath = path.join(OUTPUT_FOLDER, 'Mensura_A10169791.pdf');
    const outputPath = path.join(OUTPUT_FOLDER, 'Informe_Final_Adrema_A10169791.pdf');

    console.log(`📄 Municipal: ${municipalFiles[0]}`);
    console.log(`📄 Mensura: Mensura_A10169791.pdf`);

    // Cargar documentos
    const municipalPdf = await PDFDocument.load(fs.readFileSync(municipalPath));
    const mensuraPdf = await PDFDocument.load(fs.readFileSync(mensuraPath));
    const finalPdf = await PDFDocument.create();

    // 1. Copiar páginas del informe municipal
    const municipalPages = await finalPdf.copyPages(municipalPdf, municipalPdf.getPageIndices());
    municipalPages.forEach(page => finalPdf.addPage(page));
    console.log(`✅ ${municipalPages.length} páginas municipales copiadas`);

    // 2. Copiar página de la mensura
    const mensuraPages = await finalPdf.copyPages(mensuraPdf, mensuraPdf.getPageIndices());
    mensuraPages.forEach(page => finalPdf.addPage(page));
    console.log(`✅ ${mensuraPages.length} página(s) de mensura copiadas`);

    // 3. Metadatos Volcanic
    finalPdf.setTitle('Informe Completo - Adrema A10169791');
    finalPdf.setSubject('Titular: GARCIA NAVARRETE, FCO. P. | Ubicación: CAPITAL, Corrientes');
    finalPdf.setKeywords(['Arquitecto Virtual', 'Volcanic Red', 'A10169791']);
    finalPdf.setProducer('ArNeaz Tecnology - Arquitecto Virtual');

    // Guardar resultado
    const pdfBytes = await finalPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`\n✅ Informe Final creado exitosamente: ${outputPath}`);
    console.log(`📊 Total de páginas: ${finalPdf.getPageCount()}`);
    console.log(`🌐 Disponible en: http://localhost:3000/informes/Informe_Final_Adrema_A10169791.pdf\n`);
}

stitch().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
