import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import fs from 'fs';
import path from 'path';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export async function POST(req) {
    try {
        const { adrema } = await req.json();

        if (!adrema) {
            return NextResponse.json({ error: 'Adrema requerido' }, { status: 400 });
        }

        // Validar formato de adrema antes de cualquier operación
        if (!/^[A-Z]\d{4,}$/i.test(adrema.trim())) {
            return NextResponse.json({ error: 'Formato de adrema inválido' }, { status: 400 });
        }

        // VERIFICACIÓN DE PAGO: antes de crear el trigger, confirmar con MP
        // que existe un pago aprobado para esta adrema.
        // Esto protege el endpoint aunque alguien conozca la URL.
        try {
            const payment = new Payment(client);
            const searchResult = await payment.search({
                options: {
                    criteria: 'desc',
                    sort: 'date_created',
                    external_reference: adrema.trim().toUpperCase(),
                }
            });

            const results = searchResult.results || [];
            const aprobado = results.find(p => p.status === 'approved');

            if (!aprobado) {
                console.warn(`⛔ TRIGGER BLOQUEADO: No hay pago aprobado para ${adrema}`);
                return NextResponse.json(
                    { error: 'No se encontró pago aprobado para esta adrema.' },
                    { status: 403 }
                );
            }

            console.log(`✅ Pago verificado para ${adrema} (ID: ${aprobado.id})`);

        } catch (mpErr) {
            // Si MP no responde, logueamos pero no bloqueamos para no romper
            // el flujo del usuario justo después de pagar
            console.warn(`⚠️ No se pudo verificar pago con MP: ${mpErr.message}. Continuando...`);
        }

        // CREAR TRIGGER en cola_de_proceso
        const queuePath = path.join(process.cwd(), 'cola_de_proceso');
        if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath, { recursive: true });

        const adremaClean = adrema.trim().toUpperCase();
        const triggerFile = path.join(queuePath, `${adremaClean}.txt`);
        fs.writeFileSync(triggerFile, adremaClean);

        console.log(`✅ TRIGGER CREADO para: ${adremaClean}`);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error en localhost-trigger:", error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
