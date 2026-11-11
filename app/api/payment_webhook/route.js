import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createHmac, timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

/**
 * Deja una linea en data/webhooks_mp.log para poder auditar despues
 * que mando MercadoPago y que hicimos nosotros.
 */
function anotar(linea) {
    try {
        const dir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, 'webhooks_mp.log');
        try {
            const st = fs.statSync(archivo);
            if (st.size > 2 * 1024 * 1024) fs.unlinkSync(archivo);
        } catch (e) { }
        fs.appendFileSync(archivo, new Date().toISOString() + ' ' + linea + '\n');
    } catch (e) { }
}

/**
 * Arma todas las variantes posibles del texto que MercadoPago firma.
 * La documentacion oficial usa: id:<data.id>;request-id:<x-request-id>;ts:<ts>
 * Pero segun la integracion el id puede venir en mayusculas/minusculas o faltar
 * el x-request-id. Probamos las variantes razonables antes de darla por mala.
 */
function variantesManifiesto(paymentId, requestId, ts) {
    const ids = [String(paymentId), String(paymentId).toLowerCase(), String(paymentId).toUpperCase()];
    const out = new Set();
    for (const id of ids) {
        out.add('id:' + id + ';request-id:' + requestId + ';ts:' + ts);
        out.add('id:' + id + ';ts:' + ts);
    }
    return [...out];
}

function compararSeguro(a, b) {
    try {
        const ba = Buffer.from(String(a), 'utf8');
        const bb = Buffer.from(String(b), 'utf8');
        if (ba.length !== bb.length) return false;
        return timingSafeEqual(ba, bb);
    } catch (e) {
        return false;
    }
}

/**
 * Resultado: 'sin-secret' | 'sin-firma' | 'ok' | 'invalida'
 */
function verificarFirmaMP(req, paymentId) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) return 'sin-secret';

    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id') || '';
    if (!xSignature) return 'sin-firma';

    let ts = null;
    let v1 = null;
    try {
        for (const parte of xSignature.split(',')) {
            const kv = parte.split('=');
            if (kv[0] === 'ts') ts = kv[1];
            if (kv[0] === 'v1') v1 = kv[1];
        }
    } catch (e) { }

    if (!ts || !v1) return 'invalida';

    for (const manifiesto of variantesManifiesto(paymentId, xRequestId, ts)) {
        const esperado = createHmac('sha256', secret).update(manifiesto).digest('hex');
        if (compararSeguro(esperado, v1)) return 'ok';
    }

    return 'invalida';
}

export async function POST(req) {
    try {
        const urlParams = req.nextUrl.searchParams;
        const queryPaymentId = urlParams.get('data.id') || urlParams.get('id');
        const topic = urlParams.get('type') || urlParams.get('topic');

        if (topic && topic !== 'payment') {
            anotar('ignorado tipo=' + topic);
            return NextResponse.json({ status: 'ignored', reason: 'topic=' + topic });
        }

        let paymentId = queryPaymentId;
        try {
            const body = await req.json();
            paymentId = body?.data?.id || body?.id || queryPaymentId;
        } catch (e) { }

        anotar('recibido id=' + paymentId + ' tipo=' + (topic || '-') + ' firma=' + (req.headers.get('x-signature') ? 'si' : 'no') + ' requestId=' + (req.headers.get('x-request-id') || '-'));

        if (!paymentId) {
            anotar('ignorado: sin id de pago');
            return NextResponse.json({ status: 'ignored', reason: 'no payment id' });
        }

        // La firma se revisa, pero NO es el candado: el candado de verdad es
        // preguntarle a MercadoPago por ese pago con nuestra propia llave (abajo).
        const firma = verificarFirmaMP(req, paymentId);
        if (firma === 'invalida') {
            anotar('AVISO firma invalida id=' + paymentId + ': se sigue y se confirma contra la API de MP');
            console.warn('Aviso: firma de webhook invalida para el pago ' + paymentId + '. Se confirma igual contra la API de MercadoPago.');
        }

        const payment = new Payment(client);
        const paymentData = await payment.get({ id: paymentId });

        anotar('pago=' + paymentId + ' estado=' + paymentData.status + ' referencia=' + paymentData.external_reference + ' firma=' + firma);

        if (paymentData.status === 'approved') {
            const adrema = paymentData.external_reference;

            if (!adrema || !/^[A-Z]\d{4,}$/i.test(String(adrema).trim())) {
                anotar('aprobado sin referencia valida: ' + adrema);
                return NextResponse.json({ status: 'received_invalid_ref' });
            }

            const queuePath = path.join(process.cwd(), 'cola_de_proceso');
            if (!fs.existsSync(queuePath)) fs.mkdirSync(queuePath, { recursive: true });

            const adremaClean = String(adrema).trim().toUpperCase();
            fs.writeFileSync(path.join(queuePath, adremaClean + '.txt'), adremaClean);

            anotar('TRIGGER creado para ' + adremaClean);
            console.log('WEBHOOK: pago aprobado. Trigger creado para: ' + adremaClean);
            return NextResponse.json({ status: 'processed', adrema: adremaClean });
        }

        console.log('Pago ' + paymentId + ' en estado "' + paymentData.status + '". Sin accion.');
        return NextResponse.json({ status: 'received', payment_status: paymentData.status });

    } catch (error) {
        anotar('ERROR ' + (error && error.message ? error.message : error));
        console.error('Error en webhook de MP:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}

// MercadoPago suele probar la URL con un GET al registrarla.
export async function GET() {
    return NextResponse.json({ status: 'ok', endpoint: 'payment_webhook' });
}
