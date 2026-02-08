
import { NextResponse } from 'next/server';
import { registrarClienteEnSheets } from '../../../lib/googleSheets';

export async function GET() {
    console.log("🧪 Iniciando prueba de Google Sheets...");
    try {
        const testData = {
            nombre: "Test User",
            telefono: "123456789",
            email: "test@debug.com",
            adrema: "TEST-DEBUG"
        };

        const result = await registrarClienteEnSheets(testData);

        if (result.success) {
            console.log("✅ Prueba Sheets EXITOSA.");
            return NextResponse.json({ status: 'Success', message: 'Row added' });
        } else {
            console.error("❌ Prueba Sheets FALLIDA:", result.error);
            return NextResponse.json({ status: 'Error', error: result.error }, { status: 500 });
        }
    } catch (e) {
        console.error("❌ Error Crítico en Test Sheets:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
