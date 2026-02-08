const { loadAllRegulations, findRegulation } = require('./lib/regulationsLoader');

console.log("--- DEBUG CHAT EXTRACTION ---");
const regulationsMap = loadAllRegulations();

const queries = [
    "retiro de frente en DISTRITO CN?",
    "retiros en DISTRITO CN?",
    "altura maxima en distrito em2",
    "dime sobre CN"
];

queries.forEach(msg => {
    console.log(`\nQuery: "${msg}"`);

    // CURRENT LOGIC SIMULATION
    let distMatch = msg.match(/(?:Distrito|Zona|en)\s*([A-Z0-9.-]+)/i);
    let district = distMatch ? distMatch[1] : null;
    console.log(`  > Regex result: "${district}"`);

    let valid = findRegulation(district, regulationsMap);
    console.log(`  > Is valid? ${valid ? "YES" : "NO"}`);

    if (!district) {
        console.log("  > Entering Fallback (Token Search)...");
        // ... fallback logic simulation
    } else if (!valid) {
        console.log("  > Regex returned invalid code. Fallback SKIPPED (THIS IS THE BUG)");
    }
});
