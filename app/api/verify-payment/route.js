import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export async function POST(req) {
    try {
        const { adrema } = await req.json();

        if (!adrema) {
            return NextResponse.json({ error: 'Adrema requerido' }, { status: 400 });
        }

        // Search for payments with this external_reference
        const payment = new Payment(client);
        const searchResult = await payment.search({
            options: {
                criteria: 'desc',
                sort: 'date_created',
                external_reference: adrema,
            }
        });

        const results = searchResult.results || [];
        const approved = results.find(p => p.status === 'approved');

        if (approved) {
            return NextResponse.json({
                paid: true,
                payment_id: approved.id,
                amount: approved.transaction_amount,
                date: approved.date_approved,
                status: approved.status
            });
        }

        return NextResponse.json({
            paid: false,
            message: 'No se encontró un pago aprobado para esta Adrema.',
            total_results: results.length
        });

    } catch (error) {
        console.error("Error verifying payment:", error);
        return NextResponse.json({
            error: 'Error verificando pago',
            details: error.message
        }, { status: 500 });
    }
}
