import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export async function POST(req) {
    try {
        const { adrema, title, price, payer_email } = await req.json();

        const origin = req.headers.get('origin') || 'http://localhost:3000';

        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [
                    {
                        id: adrema,
                        title: title || `Informe Urbanístico - ${adrema}`,
                        quantity: 1,
                        unit_price: Number(price)
                    }
                ],
                payer: {
                    email: payer_email || 'test_user@test.com'
                },
                back_urls: {
                    success: `${origin}/?status=approved&adrema=${adrema}`,
                    failure: `${origin}/?status=failure`,
                    pending: `${origin}/?status=pending`
                },
                auto_return: "approved",
                external_reference: adrema,
                // Fix: MercadoPago valida que la URL sea válida y accesible. Localhost falla.
                notification_url: req.headers.get('origin').includes('localhost')
                    ? undefined
                    : `${req.headers.get('origin')}/api/payment_webhook`
            }
        });

        return NextResponse.json({ id: result.id, init_point: result.init_point });

    } catch (error) {
        console.error("Error creating preference:", error);
        return NextResponse.json({ error: 'Error creando preferencia' }, { status: 500 });
    }
}
