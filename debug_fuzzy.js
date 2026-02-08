const { loadAllRegulations, findRegulation } = require('./lib/regulationsLoader');

console.log("--- DEBUGGING FUZZY MATCHING ---");

// 1. Load Data
const regulationsMap = loadAllRegulations();
console.log(`Debug: Loaded ${regulationsMap.size} districts.`);

// 2. Test Cases
const testCases = [
    "em2",
    "em-2",
    "E.M.2",
    "R1",
    "r 1",
    "Distrito C1"
];

testCases.forEach(input => {
    const result = findRegulation(input, regulationsMap);
    console.log(`Input: "${input}" -> Found: ${result ? "YES (Data Present)" : "NO"}`);
    if (result) {
        // Log the key name found to confirm normalization
        // This is tricky because findRegulation returns the value, not the key.
        // But we can infer success.
    }
});

console.log("--- END DEBUG ---");
