// Pega tu clave real aquí abajo, entre las comillas
const API_KEY = "AIzaSyAQ7ktx7fFZJxXMxkaz9zrAWm3PfcxxIGs";

async function listarModelos() {
    console.log("🔍 Consultando lista oficial de modelos a Google...");

    // Usamos la conexión directa (sin intermediarios)
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ ERROR DE CUENTA:", data.error.message);
            console.log("Solución: Ve a Google AI Studio y acepta los términos de uso.");
        } else if (data.models) {
            console.log("✅ ¡CONEXIÓN EXITOSA! Estos son los modelos que puedes usar:");
            console.log("---------------------------------------------------------");
            // Filtramos solo los que sirven para generar texto
            const disponibles = data.models
                .filter(m => m.supportedGenerationMethods.includes("generateContent"))
                .map(m => m.name.replace("models/", "")); // Limpiamos el nombre

            disponibles.forEach(nombre => console.log(`👉 "${nombre}"`));
            console.log("---------------------------------------------------------");
            console.log("TIP: Copia uno de estos nombres y úsalo en tu watcher.js");
        } else {
            console.log("⚠️ Respuesta extraña:", data);
        }
    } catch (error) {
        console.error("Error de red:", error.message);
    }
}

listarModelos();