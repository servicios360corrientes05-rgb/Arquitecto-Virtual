const { loadAllRegulations, findRegulation } = require('./lib/regulationsLoader');

const regulationsMap = loadAllRegulations();
const cnData = findRegulation("CN", regulationsMap);

console.log("--- DATA FOR CN ---");
if (cnData) {
    console.log("Tejido:", JSON.stringify(cnData.tejido, null, 2));
    console.log("Retiros Frente:", JSON.stringify(cnData.retiros_de_frente, null, 2));
    console.log("Retiro Fondo:", JSON.stringify(cnData.retiro_de_fondo, null, 2));
} else {
    console.log("CN NOT FOUND");
}
