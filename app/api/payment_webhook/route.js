import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

/**
 * Verifica la firma del webhook de MercadoPago.
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * Header x-signature formato: "ts=TIMESTAMP,v1=HASH"
 * El hash es HMAC-SHA256 de "id:PAYMENT_ID;request-id:REQUEST_ID;ts:TIMESTAMP"
 * usando MP_WEBHOOK_SECRET como clave.
 */
function verificarFirmaMP(req, paymentId) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
        // Si no está configurado el secret, loguear advertencia pero continuar
        console.warn('⚠️ MP_WEBHOOK_SECRET no configurado. Verificación de firma desactivada.');
        return true;
    }

    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');

    if (!xSignature) {
        // MP no envía x-signature si no configuraste el Secret de validación en el panel.
        // Permitir: el pago se verifica igual contra la API de MP más abajo.
        console.warn('⚠️ Webhook sin x-signature. Procesando igual (verificación vía API activa).');
        return true;
    }

    // Extraer ts y v1 del header
    const parts = Object.fromEntries(xSignature.split(',').map(p => p.split('=')));
    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) return false;

    // Construir mensaje a firmar
    const manifest = `id:${paymentId};request-id:${xRequestId || ''};ts:${ts}`;
    const expectedHash = createHmac('sha256', secret).update(manifest).digest('hex');

    if (expectedHash !== v1) {
        console.error('❌ Firma de webhook inválida. Posible intento de falsificación.');
        return false;
    }

    return true;
}

export async function POST(req) {
    try {
        // MercadoPago envía query params: ?data.id=...&type=payment
        const urlParams = req.nextUrl.searchParams;
        const queryPaymentId = urlParams.get('data.id') || urlParams.get('id');
        const topic = urlParams.get('type') || urlParams.get('topic');

        // Solo procesar notificaciones de pago
        if (topic && topic !== 'payment') {
            return NextResponse.json({ status: 'ignored', reason: `topic=${topic}` });
        }

        // Leer body
        let paymentId = queryPaymentId;
        try {
            const body = await req.json();
            paymentId = body?.data?.id || body?.id || queryPaymentId;
        } catch (e) { /* body no es JSON, usar queryParam */ }

        console.log(`📩 Webhook recibido. Payment ID: ${paymentId}`);

        if (!paymentId) {
            return NextResponse.json({ status: 'ignored', reason: 'no payment id' });
        }

        // Verificar firma de MP
        if (!verificarFirmaMP(req, paymentId)) {
            return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
        }

        // Consultar estado real del pago en MP
        const payment = new Payment(client);
        const paymentData = await payment.get({ id: paymentId });

        console.log(`💳 Estado: ${paymentData.status} | Ref: ${paymentData.external_reference}`);

        if (paymentData.status === 'approved') {
            const adrema = paymentData.external_reference;

            if (!adrema || !/^[A-Z]\d{4,}$/i.test(adrema)) {
                console.warn(`⚠️ Pago aprobado pero external_reference inválida: "${adrema}"`);
                return NextResponse.json({ status: 'received_invalid_ref' });
            }

            // CREAR TRIGGER en cola_de_proceso
            const queuePath = path.join(process.cwd(), 'cola_de_proceso');
            if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath, { recursive: true });

            const adremaClean = adrema.trim().toUpperCase();
            const triggerFile = path.join(queuePath, `${adremaClean}.txt`);
            fs.writeFileSync(triggerFile, adremaClean);

            console.log(`✅ WEBHOOK: Pago aprobado. Trigger creado para: ${adremaClean}`);
            return NextResponse.json({ status: 'processed', adrema: adremaClean });
        }

        // Pago pendiente, rechazado, etc.
        console.log(`ℹ️ Pago ${paymentId} en estado "${paymentData.status}". Sin acción.`);
        return NextResponse.json({ status: 'received', payment_status: paymentData.status });

    } catch (error) {
        console.error("❌ Error en webhook de MP:", error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
