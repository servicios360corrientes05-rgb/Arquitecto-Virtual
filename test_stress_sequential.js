const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Script de Test Secuencial - Ejecuta workflow completo para múltiples Adremas
 */

const ADREMAS_TO_TEST = ['A10169791', 'A10045711'];

async function runCommand(cmd, description) {
    console.log(`\n🔧 ${description}...`);
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error: ${error.message}`);
                console.error(stderr);
                reject(error);
            } else {
                console.log(stdout);
                console.log(`✅ ${description} completado.`);
                resolve(stdout);
            }
        });
    });
}

async function runStressTest() {
    console.log('🚀 Iniciando Prueba de Stress Secuencial - Web Data Shield\n');

    for (const adrema of ADREMAS_TO_TEST) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📋 TEST: ADREMA ${adrema}`);
        console.log(`${'='.repeat(60)}\n`);

        try {
            // 1. Cerrar navegadores
            console.log(`🧹 Paso 1: Limpiando navegadores...`);
            try {
                await runCommand('taskkill /F /IM chrome.exe', 'Cerrando Chrome');
            } catch (e) {
                console.log('   (No había instancias de Chrome)');
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            // 2. Descargar Mensura con run_provincia_playwright
            console.log(`\n📥 Paso 2: Descargando Mensura ${adrema}...`);
            // Modificar ADREMA en el archivo temporalmente
            const scriptPath = path.join(__dirname, 'run_provincia_playwright.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            const modifiedScript = scriptContent.replace(/const ADREMA = '[A-Z0-9]+';/, `const ADREMA = '${adrema}';`);
            fs.writeFileSync(scriptPath, modifiedScript);

            await runCommand('node run_provincia_playwright.js', `Scraper Provincial ${adrema}`);

            await new Promise(resolve => setTimeout(resolve, 3000));

            // 3. Generar Informe Municipal con watcher.js
            console.log(`\n📄 Paso 3: Generando Informe Municipal ${adrema}...`);
            const triggerFile = path.join(__dirname, 'cola_de_proceso', `${adrema}.txt`);
            fs.writeFileSync(triggerFile, adrema);

            await runCommand('node watcher.js', `Informe Municipal ${adrema}`);

            await new Promise(resolve => setTimeout(resolve, 2000));

            // 4. Stitch PDFs
            console.log(`\n🔗 Paso 4: Uniendo Informes para ${adrema}...`);
            await runCommand(`node utils/stitch_reports.js ${adrema}`, `Stitching ${adrema}`);

            console.log(`\n✅ TEST ${adrema} COMPLETADO`);
            console.log(`   📁 PDF Final: public/informes/Informe_Final_Adrema_${adrema}.pdf`);
            console.log(`   🌐 Link: http://localhost:3000/informes/Informe_Final_Adrema_${adrema}.pdf`);

        } catch (error) {
            console.error(`\n❌ ERROR EN TEST ${adrema}:`, error.message);
            console.log('   Continuando con siguiente test...\n');
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 PRUEBA DE STRESS SECUENCIAL FINALIZADA');
    console.log(`${'='.repeat(60)}\n`);

    // Listar archivos generados
    const outputFolder = path.join(__dirname, 'public', 'informes');
    const files = fs.readdirSync(outputFolder).filter(f => f.startsWith('Informe_Final_Adrema_'));

    console.log('📊 ARCHIVOS GENERADOS:');
    files.forEach(file => {
        const stats = fs.statSync(path.join(outputFolder, file));
        console.log(`   ✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
}

runStressTest().catch(err => {
    console.error('💥 Error crítico:', err);
    process.exit(1);
});
