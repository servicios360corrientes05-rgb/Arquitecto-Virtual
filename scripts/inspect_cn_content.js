
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-extraction');

async function inspectContent() {
    const filename = "codigo de planeamiento urbano 2020.pdf";
    const filePath = path.join(process.cwd(), 'data', 'regulations', filename);

    try {
        const buffer = fs.readFileSync(filePath);
        const data = await pdf(buffer);
        const text = data.text;

        const index = text.indexOf("Distrito Central Norte (CN)");
        if (index === -1) {
            console.log("Term not found.");
            return;
        }

        console.log(`\n--- CONTEXT AT INDEX ${index} ---`);
        console.log("PREV 500 chars:");
        console.log(text.substring(index - 500, index));
        console.log("\n>>> MATCH <<<");
        console.log(text.substring(index, index + 50));
        console.log("\nNEXT 1000 chars:");
        console.log(text.substring(index + 50, index + 1050));

    } catch (e) {
        console.error("Error:", e);
    }
}

inspectContent();
