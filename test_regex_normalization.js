const { loadAllRegulations, findRegulation } = require('./lib/regulationsLoader');

// Mock a regulations map for testing (simulating the loadAllRegulations logic)
// In a real run, this would load from files. We will assume the loader works for loading,
// but we want to test the LOOKUP logic specifically.
// However, since we can't easily mock the internal map of the module without rewiring,
// we will just copy the logic we want to test.

const mockMap = new Map();
mockMap.set("R3.A", { id: "R3.a data" });
mockMap.set("R3.B", { id: "R3.b data" });
mockMap.set("C1", { id: "C1 data" });

function textNormalization(input) {
    if (!input) return "";
    return input.toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
}

function robustFind(query, map) {
    // 1. Direct try
    let code = query.trim().toUpperCase();
    if (map.has(code)) return map.get(code);

    // 2. Normalized try (remove dots, spaces)
    const normalizedQuery = textNormalization(code);

    for (const [key, value] of map.entries()) {
        const normalizedKey = textNormalization(key);
        if (normalizedKey === normalizedQuery) {
            return value;
        }
    }
    return null;
}

console.log("Testing 'R3b' (expect R3.b data):", robustFind("R3b", mockMap));
console.log("Testing 'R3.b' (expect R3.b data):", robustFind("R3.b", mockMap));
console.log("Testing 'r3 b' (expect R3.b data):", robustFind("r3 b", mockMap));
console.log("Testing 'C.1' (expect C1 data):", robustFind("C.1", mockMap));
