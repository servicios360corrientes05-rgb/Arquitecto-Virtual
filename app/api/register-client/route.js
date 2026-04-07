import { NextResponse } from 'next/server';
import { registrarClienteEnSheets } from '../../../lib/googleSheets';

export async function POST(request) {
    try {
        const body = await request.json();
        const { nombre, telefono, email, adrema } = body;

        // Validación Básica
        if (!nombre || !telefono || !adrema) {
            return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
        }

        // Persistencia
        const resultado = await registrarClienteEnSheets({ nombre, telefono, email, adrema });

        if (!resultado.success) {
            return NextResponse.json({ error: 'Error guardando datos', details: resultado.error }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
