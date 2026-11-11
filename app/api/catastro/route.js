import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registro de trabajos en memoria (una sola instancia en Railway).
// La consulta al catastro provincial tarda entre 40 y 150 segundos,
// asi que no se hace dentro del pedido: se arranca y se consulta despues.
const trabajos = globalThis.__catastroJobs || (globalThis.__catastroJobs = new Map());

const BASE = '/tmp/mensuras';
// Carpeta donde se deja el resultado para que el generador de informes lo reutilice
// (asi no se abre una segunda sesion en el DGC con la misma cuenta).
const ESTADO = path.join(process.cwd(), 'data', 'provincial');
const TTL_MS = 15 * 60 * 1000;

function limpiar() {
    const ahora = Date.now();
    for (const [id, t] of trabajos) {
        if (ahora - t.inicio > TTL_MS) trabajos.delete(id);
    }
}

async function correr(id, adrema) {
    const job = trabajos.get(id);
    const salida = path.join(BASE, adrema);
    const marca = path.join(ESTADO, adrema + '.corriendo');
    try {
        fs.mkdirSync(salida, { recursive: true });
        try {
            fs.mkdirSync(ESTADO, { recursive: true });
            fs.writeFileSync(marca, new Date().toISOString());
        } catch (e) { }
        const mod = await import('@/lib/scraperProvincial');
        const scrapeProvincial = mod.scrapeProvincial || (mod.default && mod.default.scrapeProvincial);
        if (typeof scrapeProvincial !== 'function') {
            throw new Error('El modulo de catastro provincial no expone scrapeProvincial');
        }
        const datos = await scrapeProvincial(adrema, salida);
        const archivos = fs.readdirSync(salida).filter(f => f.toLowerCase().endsWith('.pdf'));
        job.estado = 'listo';
        job.datos = {
            titular: datos?.titular || null,
            ubicacion: datos?.ubicacion || null,
            superficieDGC: datos?.superficieDGC || null,
            hayMensuras: Boolean(datos?.hayMensuras) || archivos.length > 0,
            mensuras: archivos.map(f => ({
                archivo: f,
                bytes: (() => { try { return fs.statSync(path.join(salida, f)).size; } catch { return 0; } })(),
                url: '/api/mensura?f=' + encodeURIComponent(adrema + '/' + f)
            }))
        };
        job.fin = Date.now();

        // Se deja el resultado en disco: el generador de informes lo lee y NO vuelve
        // a consultar el DGC (dos sesiones con la misma cuenta rompen el portal).
        try {
            fs.writeFileSync(path.join(ESTADO, adrema + '.json'), JSON.stringify({
                titular: job.datos.titular,
                ubicacion: job.datos.ubicacion,
                superficieDGC: job.datos.superficieDGC,
                hayMensuras: job.datos.hayMensuras,
                mensuras: archivos,
                timestamp: new Date().toISOString()
            }, null, 2));
        } catch (e) { }
    } catch (e) {
        job.estado = 'error';
        job.error = e?.message || String(e);
        job.fin = Date.now();
        const msg = String(job.error);
        job.pista = msg.includes('DGC_CATASTRO')
            ? 'Faltan las credenciales del catastro provincial (DGC_CATASTRO_USER / DGC_CATASTRO_PASS).'
            : msg;
    } finally {
        try { if (fs.existsSync(marca)) fs.unlinkSync(marca); } catch (e) { }
    }
}

export async function POST(req) {
    limpiar();
    let adrema = '';
    try {
        const body = await req.json();
        adrema = String(body?.adrema || '').trim().toUpperCase();
    } catch {
        return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 });
    }
    if (!/^[A-Z]\s*\d{4,}$/.test(adrema)) {
        return NextResponse.json({ error: 'Adrema invalido' }, { status: 400 });
    }
    adrema = adrema.replace(/\s+/g, '');

    const credenciales = Boolean(process.env.DGC_CATASTRO_USER && process.env.DGC_CATASTRO_PASS);

    // Si ya hay uno corriendo para el mismo adrema, se reutiliza.
    for (const [id, t] of trabajos) {
        if (t.adrema === adrema && t.estado === 'corriendo') {
            return NextResponse.json({ jobId: id, estado: t.estado, credenciales });
        }
    }

    const id = 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    trabajos.set(id, { adrema, estado: 'corriendo', inicio: Date.now(), credenciales });
    correr(id, adrema); // sin await: corre de fondo
    return NextResponse.json({ jobId: id, estado: 'corriendo', credenciales });
}

export async function GET(req) {
    const url = new URL(req.url);
    const id = url.searchParams.get('job');
    if (!id) return NextResponse.json({ error: 'Falta job' }, { status: 400 });
    const t = trabajos.get(id);
    if (!t) return NextResponse.json({ estado: 'desconocido' }, { status: 404 });
    return NextResponse.json({
        estado: t.estado,
        adrema: t.adrema,
        credenciales: t.credenciales,
        datos: t.datos || null,
        error: t.error || null,
        pista: t.pista || null,
        segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000)
    });
}
