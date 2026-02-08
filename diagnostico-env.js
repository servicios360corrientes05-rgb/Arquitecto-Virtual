require('dotenv').config(); // Carga el archivo .env
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testConArchivoEnv() {
    // Tu app busca exactamente este nombre de variable
    const CLAVE_DE_TU_ENV = process.env.GEMINI_API_KEY_ARQUITECTO;

    console.log("---------------------------------------------------");
    console.log("🔍 PROBANDO LECTURA DESDE ARCHIVO .env");
    console.log("---------------------------------------------------");

    if (!CLAVE_DE_TU_ENV) {
        console.error("❌ ERROR: No se detecta 'GEMINI_API_KEY_ARQUITECTO' en tu .env.");
        console.log("Asegúrate de que el archivo .env esté en la carpeta raíz.");
        return;
    }

    console.log("✅ .env leído correctamente.");

    const genAI = new GoogleGenerativeAI(CLAVE_DE_TU_ENV);
    // Usamos gemini-2.5-flash para coincidir con tu app v18
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
        const result = await model.generateContent("Responde solo con: FUNCIONA");
        console.log("📡 Respuesta:", result.response.text());
        console.log("✨ RESULTADO FINAL: Tu configuración es perfecta.");
    } catch (e) {
        console.error("❌ ERROR AL CONECTAR:", e.message);
    }
}

testConArchivoEnv();