
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

async function testUsage() {
    try {
        const { PDFParse } = require('pdf-parse');
        const dataDir = path.join(process.cwd(), 'data', 'regulations');
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
        const pdfPath = path.join(dataDir, files[0]);
        const buffer = fs.readFileSync(pdfPath);

        try {
            const instance = new PDFParse(buffer);
            console.log("Prototype Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));

            // Try common names
            if (instance.text) await instance.text();

        } catch (e) {
            console.log("Error:", e.message);
        }

    } catch (e) {
        console.error("Setup failed:", e);
    }
}

testUsage();
