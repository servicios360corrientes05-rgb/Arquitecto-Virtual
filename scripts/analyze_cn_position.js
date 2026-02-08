
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-extraction');

async function analyzePdf() {
    const filename = "codigo de planeamiento urbano 2020.pdf";
    const filePath = path.join(process.cwd(), 'data', 'regulations', filename);

    console.log(`Analyzing file: ${filename}`);

    try {
        const buffer = fs.readFileSync(filePath);
        const data = await pdf(buffer);
        const text = data.text;

        console.log(`Total Text Length: ${text.length} characters.`);

        const terms = [
            "Distrito R1",
            "Distrito Central Norte (CN)",
            "5.2.3 Distritos Centrales"
        ];

        console.log("\n--- TERM POSITIONS ---");
        for (const term of terms) {
            const index = text.indexOf(term);
            console.log(`Term: "${term}" found at index: ${index}`);
            if (index > 300000) {
                console.log(`⚠️ CRITICAL: "${term}" is beyond the 300k limit!`);
            } else {
                console.log(`✅ OK: "${term}" is within the 300k limit.`);
            }
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

analyzePdf();
