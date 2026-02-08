
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

async function debugPdf() {
    const filename = "codigo de planeamiento urbano 2020.pdf";
    const filePath = path.join(process.cwd(), 'data', 'regulations', filename);

    console.log(`Checking file: ${filename}`);

    try {
        const buffer = fs.readFileSync(filePath);
        console.log(`Buffer size: ${buffer.length} bytes`);

        const data = await pdf(buffer);
        const text = data.text;

        console.log(`Text extracted: ${text.length} characters.`);

        // Check for specific keywords from user's image
        const keywords = [
            "Distrito R1",
            "4.3.5.3",
            "Depósito complementario",
            "Sección 5.1"
        ];

        console.log("\n--- KEYWORD SEARCH ---");
        let foundAny = false;
        for (const kw of keywords) {
            const index = text.indexOf(kw);
            if (index !== -1) {
                console.log(`✅ FOUND: "${kw}" at index ${index}`);
                console.log(`Context: ...${text.substring(index, index + 100).replace(/\n/g, ' ')}...`);
                foundAny = true;
            } else {
                console.log(`❌ NOT FOUND: "${kw}"`);
            }
        }

        if (!foundAny) {
            console.log("\n⚠️ WARNING: No keywords found. The PDF might be a scanned image without OCR text layer.");
            console.log("First 500 chars dump:");
            console.log(text.substring(0, 500));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

debugPdf();
