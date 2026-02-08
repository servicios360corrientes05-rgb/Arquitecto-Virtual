
import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import fs from 'fs';
import path from 'path';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// --- SIMULACIÓN LOCAL PARA DEV SIN NGROK ---
// Si llamamos a este webhook manualmente o desde local, procesamos igual.

export async function POST(req) {
    try {
        // Mercado Pago envía query params: ?id=...&topic=payment
        // O body data.id

        let paymentId = null;

        const url_id = req.nextUrl.searchParams.get('data.id') || req.nextUrl.searchParams.get('id');

        // Si recibimos JSON
        try {
            const body = await req.json();
            paymentId = body?.data?.id || body?.id || url_id;
        } catch (e) {
            paymentId = url_id;
        }

        console.log(`Webhook Received. Payment ID: ${paymentId}`);

        if (!paymentId) {
            return NextResponse.json({ status: 'ignored (no payment id)' });
        }

        const payment = new Payment(client);
        const paymentData = await payment.get({ id: paymentId });

        console.log(`Payment Status: ${paymentData.status} | Ref: ${paymentData.external_reference}`);

        if (paymentData.status === 'approved') {
            const adrema = paymentData.external_reference;

            if (adrema) {
                // TRIGGER GENERATION - Escribir en cola_de_proceso
                const queuePath = path.join(process.cwd(), 'cola_de_proceso');
                if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath);

                const triggerFile = path.join(queuePath, `${adrema}.txt`);

                // Solo escribimos si no existe (o sobrescribimos para re-generar)
                fs.writeFileSync(triggerFile, adrema);
                console.log(`✅ PAGO APROBADO. Trigger generado para: ${adrema}`);

                return NextResponse.json({ status: 'processed_trigger_created' });
            }
        }

        return NextResponse.json({ status: 'received' });

    } catch (error) {
        console.error("Webhook Error:", error);
        return NextResponse.json({ error: 'Internal Webhook Error' }, { status: 500 });
    }
}
