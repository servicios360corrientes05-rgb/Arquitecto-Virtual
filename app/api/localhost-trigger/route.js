
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req) {
    try {
        const { adrema } = await req.json();

        if (!adrema) {
            return NextResponse.json({ error: 'Adrema required' }, { status: 400 });
        }

        // TRIGGER GENERATION - Escribir en cola_de_proceso
        const queuePath = path.join(process.cwd(), 'cola_de_proceso');
        if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath);

        const triggerFile = path.join(queuePath, `${adrema}.txt`);

        // Solo escribimos si no existe (o sobrescribimos para re-generar)
        fs.writeFileSync(triggerFile, adrema);
        console.log(`✅ LOCALHOST TRIGGER: Generado para: ${adrema}`);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Localhost Trigger Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
