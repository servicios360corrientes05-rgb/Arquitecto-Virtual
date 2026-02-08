const { loadAllRegulations } = require('./lib/regulationsLoader');

console.log("--- LISTING ALL DISTRICT KEYS ---");
const regulationsMap = loadAllRegulations();
const keys = Array.from(regulationsMap.keys()).sort();
console.log(JSON.stringify(keys, null, 2));
console.log("--- END LIST ---");
