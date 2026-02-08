
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');

// Configuration matches the App
const apiKey = "AIzaSyDCz-HSUBdXnW9cPxRXuwvtROFX1pAj0gM";
const modelName = "gemini-2.5-flash"; // updated model

async function runTest() {
    console.log("=== STARTING INTERNAL SELF-TEST ===");

    // 1. TEST PDF READING
    console.log("\n[1] Testing PDF Access...");
    const dataDir = path.join(process.cwd(), 'data', 'regulations');

    if (!fs.existsSync(dataDir)) {
        console.error("❌ FAILURE: 'data/regulations' directory does not exist.");
        return;
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
    console.log(`Found ${files.length} PDF files.`);

    if (files.length === 0) {
        console.error("❌ FAILURE: No PDFs found.");
        return;
    }

    // Test extraction on the first file
    const testFile = files[0];
    console.log(`Testing extraction on: ${testFile}`);
    let contextText = "";

    try {
        const buffer = fs.readFileSync(path.join(dataDir, testFile));
        const data = await pdf(buffer);
        console.log(`✅ Text Extracted! Length: ${data.text.length} chars`);
        console.log(`Preview: ${data.text.substring(0, 200).replace(/\n/g, ' ')}...`);
        contextText = data.text; // Use this for the chat test
    } catch (e) {
        console.error("❌ FAILURE: PDF Parsing crashed.", e);
        return;
    }

    // 2. TEST GEMINI API
    console.log("\n[2] Testing Gemini API with Model: " + modelName);
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const query = 'que dice el distrito "R1"';
        const prompt = `
        Contexto (de ${testFile}):
        ${contextText.substring(0, 10000)}
        
        Pregunta: ${query}
        `;

        console.log("Sending query to AI...");
        const result = await model.generateContent(prompt);
        const response = result.response.text();

        console.log("\n[3] AI RESPONSE:");
        console.log("--------------------------------------------------");
        console.log(response);
        console.log("--------------------------------------------------");

        if (response.length > 10) {
            console.log("✅ SUCCESS: AI responded.");
        } else {
            console.log("⚠️ WARNING: AI response suspiciously short.");
        }

    } catch (e) {
        console.error("❌ FAILURE: API Call failed.", e);
    }
}

runTest();
