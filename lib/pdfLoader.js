
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-extraction');

let cachedContext = null;

export async function getRegulationsContext() {
    if (cachedContext) return cachedContext;

    const dataDir = path.join(process.cwd(), 'data', 'regulations');

    if (!fs.existsSync(dataDir)) {
        console.warn("Regulations directory not found. Creating...");
        fs.mkdirSync(dataDir, { recursive: true });
        return "";
    }

    let files = fs.readdirSync(dataDir).filter(file => file.toLowerCase().endsWith('.pdf'));

    if (files.length === 0) {
        return "No hay documentos de normativa cargados en el sistema.";
    }

    // PRIORITIZATION: Move "codigo de planeamiento" to the front
    const priorityFile = "codigo de planeamiento urbano 2020.pdf";
    files = files.sort((a, b) => {
        if (a.toLowerCase().includes("planeamiento")) return -1;
        if (b.toLowerCase().includes("planeamiento")) return 1;
        return a.localeCompare(b);
    });

    let combinedText = "";

    for (const file of files) {
        const filePath = path.join(dataDir, file);
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            combinedText += `\n--- DOCUMENTO: ${file} ---\n${data.text}\n`;
        } catch (error) {
            console.error(`Error reading PDF ${file}:`, error);
        }
    }

    cachedContext = combinedText;
    return combinedText;
}
