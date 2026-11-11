import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import fs from 'fs';
import path from 'path';

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Llave simple para que la revision no quede abierta a cualquiera.
// Va en el codigo (el repositorio es privado) porque las variables de entorno
// de Railway no se pueden editar desde afuera.
const CLAVE = 'revision-pagos-arneaz';

function fechaMP(d) {
    return new Date(d).toISOString().replace('Z', '-00:00');
}

async function buscarPagos(desde, hasta) {
    const pagos = new Payment(client);
    const intentos = [
        { criteria: 'desc', sort: 'date_created', range: 'date_created', begin_date: fechaMP(desde), end_date: fechaMP(hasta) },
        { criteria: 'desc', sort: 'date_created', range: 'date_created', begin_date: new Date(desde).toISOString(), end_date: new Date(hasta).toISOString() },
        { criteria: 'desc', sort: 'date_created', status: 'approved' }
    ];
    let ultimoError = null;
    for (const options of intentos) {
        try {
            const r = await pagos.search({ options });
            return { ok: true, resultados: (r && r.results) ? r.results : [], modo: Object.keys(options).join(',') };
        } catch (e) {
            ultimoError = e;
        }
    }
    return { ok: false, error: ultimoError && ultimoError.message ? ultimoError.message : String(ultimoError) };
}

function informeDe(adrema, fechaPago) {
    const dir = path.join(process.cwd(), 'public', 'informes');
    try {
        const limite = new Date(fechaPago).getTime();
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.pdf') || !f.includes(adrema)) continue;
            const st = fs.statSync(path.join(dir, f));
            if (st.mtime.getTime() >= limite) return { archivo: f, cuando: st.mtime.toISOString() };
        }
    } catch (e) { }
    return null;
}

export async function GET(req) {
    const url = new URL(req.url);
    const clave = url.searchParams.get('k') || req.headers.get('x-clave');
    if (clave !== CLAVE) {
        return NextResponse.json({ error: 'Falta la llave de revision' }, { status: 403 });
    }

    const horas = Math.min(Math.max(Number(url.searchParams.get('horas') || 72), 1), 240);
    const disparar = url.searchParams.get('disparar') === 'si';

    const hasta = new Date();
    const desde = new Date(hasta.getTime() - horas * 60 * 60 * 1000);

    const busqueda = await buscarPagos(desde, hasta);
    if (!busqueda.ok) {
        return NextResponse.json({ ok: false, motivo: 'MercadoPago no respondio', error: busqueda.error, desde, hasta }, { status: 200 });
    }

    const aprobados = busqueda.resultados.filter(p => p && p.status === 'approved');
    const detalle = [];
    let disparados = 0;
    const cola = path.join(process.cwd(), 'cola_de_proceso');
    if (!fs.existsSync(cola)) fs.mkdirSync(cola, { recursive: true });

    for (const pago of aprobados) {
        const referencia = String(pago.external_reference || '').trim();
        const valida = /^[A-Z]\d{4,}$/i.test(referencia);
        const adrema = valida ? referencia.toUpperCase() : referencia;
        const informe = valida ? informeDe(adrema, pago.date_approved || pago.date_created || hasta) : null;

        let enviado = false;
        if (valida && !informe && disparar) {
            fs.writeFileSync(path.join(cola, adrema + '.txt'), adrema);
            enviado = true;
            disparados++;
        }

        detalle.push({
            id: pago.id,
            estado: pago.status,
            monto: pago.transaction_amount,
            referencia,
            adrema_valida: valida,
            fecha_pago: pago.date_approved || pago.date_created,
            tiene_informe: !!informe,
            informe: informe ? informe.archivo : null,
            enviado_a_la_cola: enviado
        });
    }

    return NextResponse.json({
        ok: true,
        desde, hasta,
        modo_de_busqueda: busqueda.modo,
        total_encontrados: busqueda.resultados.length,
        aprobados: aprobados.length,
        disparados,
        pagos: detalle
    });
}
