
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

async function testUsage() {
    try {
        const { PDFParse } = require('pdf-parse');
        console.log("PDFParse type:", typeof PDFParse);

        // Find a PDF to test
        const dataDir = path.join(process.cwd(), 'data', 'regulations');
        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
        if (files.length === 0) { console.log("No PDFs found"); return; }

        const pdfPath = path.join(dataDir, files[0]);
        const buffer = fs.readFileSync(pdfPath);
        console.log(`Processing ${files[0]} (${buffer.length} bytes)`);

        // Attempt 1: New instance
        try {
            console.log("Attempt 1: new PDFParse(buffer)");
            const instance = new PDFParse(buffer);
            console.log("Instance created. Keys:", Object.keys(instance));
            // Check if it has text immediately
            if (instance.text) console.log("Text found in instance!");
            // Check if it has a generic 'text' method or promise
            if (typeof instance.then === 'function') console.log("Instance is a promise!");

            // Try to extract text if it's an object
            if (typeof instance.extractText === 'function') {
                console.log("Calling extractText()...");
                const text = await instance.extractText();
                console.log("Text length:", text.length);
            }

        } catch (e) {
            console.log("Attempt 1 failed:", e.message);
        }

    } catch (e) {
        console.error("Setup failed:", e);
    }
}

testUsage();
