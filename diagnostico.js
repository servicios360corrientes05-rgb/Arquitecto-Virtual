const { GoogleGenerativeAI } = require("@google/generative-ai");

async function diagnosticoFinal() {
    // 1. Pon tu clave DIRECTAMENTE aquí entre las comillas para probar
    const API_KEY = "AIzaSyAQ7ktx7fFZJxXMxkaz9zrAWm3PfcxxIGs";

    console.log("---------------------------------------------------");
    console.log("🛠️  INICIANDO DIAGNÓSTICO DE CONEXIÓN CON GOOGLE");
    console.log("---------------------------------------------------");

    if (!API_KEY || API_KEY.includes("PEGAR_TU_CLAVE")) {
        console.error("❌ ERROR: No has pegado tu clave API en el código.");
        return;
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    // Probamos con el modelo más estándar
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        console.log("📡 Enviando mensaje de prueba a Gemini...");
        const prompt = "Responde solo con la palabra: CONECTADO.";

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("✅ ¡ÉXITO! Google respondió:", text);
        console.log("---------------------------------------------------");
        console.log("CONCLUSIÓN: Tu clave funciona. El problema estaba en el archivo .env");
    } catch (error) {
        console.error("❌ ERROR FATAL DETECTADO:");
        console.error(error.message); // Veremos el error real (sin filtros)

        if (error.message.includes("404")) {
            console.log("\n💡 PISTA: Error 404 significa 'No encontrado'.");
            console.log("   - Puede que el servicio 'Generative Language API' no esté habilitado en tu cuenta de Google Cloud.");
        }
        if (error.message.includes("400")) {
            console.log("\n💡 PISTA: Error 400 suele ser 'API Key inválida' o clave mal copiada.");
        }
    }
}

diagnosticoFinal();