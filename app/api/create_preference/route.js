import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export async function POST(req) {
    try {
        const { adrema, title, price, payer_email, payer_name, payer_phone } = await req.json();

        // Detectar origen real — ngrok/producción envían x-forwarded-host
        // Los fetch same-origin no incluyen el header 'origin'
        const forwardedHost = req.headers.get('x-forwarded-host');
        const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
        const origin = req.headers.get('origin')
            || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:3000');

        const preference = new Preference(client);

        const priceNum = Math.max(Number(price) || 0, 1);
        
        const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
        const forceHttps = (url) => isLocalhost ? url : url.replace('http://', 'https://');

        const preferenceBody = {
            items: [
                {
                    id: adrema || "REF-DEFT",
                    title: title || `Informe Urbanístico - ${adrema || "REF-DEFT"}`,
                    quantity: 1,
                    unit_price: priceNum
                }
            ],
            payer: {
                email: payer_email || 'correo@ejemplo.com',
                name: (payer_name || '').split(' ')[0] || 'Cliente',
                surname: (payer_name || '').split(' ').slice(1).join(' ') || 'Arquitecto',
                phone: {
                    number: payer_phone || '3794000000'
                }
            },
            back_urls: {
                success: forceHttps(`${origin}/?status=approved&adrema=${adrema}`),
                failure: forceHttps(`${origin}/?status=failure`),
                pending: forceHttps(`${origin}/?status=pending`)
            },
            auto_return: isLocalhost ? undefined : "approved",
            binary_mode: true, // Habilita aprobación inmediata
            external_reference: adrema,
            notification_url: origin.includes('localhost')
                ? undefined
                : `${origin}/api/payment_webhook`
        };

        console.log("Creating MP Preference with Body:", JSON.stringify(preferenceBody, null, 2));

        const result = await preference.create({ body: preferenceBody });

        console.log("MP Preference Created Successfully:", result.id);

        return NextResponse.json({ id: result.id, init_point: result.init_point });

    } catch (error) {
        if (error.response) {
            console.error("Mercado Pago API Error Details:", JSON.stringify(error.response, null, 2));
        } else {
            console.error("Error creating preference (Internal):", error);
        }
        return NextResponse.json({ 
            error: 'Error creando preferencia', 
            details: error.message,
            fullError: error.response || null
        }, { status: 500 });
    }
}
