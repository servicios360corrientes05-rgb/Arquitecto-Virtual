import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = '/tmp/mensuras';

export async function GET(req) {
    const url = new URL(req.url);
    const f = url.searchParams.get('f');
    if (!f) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });

    // Solo se permiten rutas <ADREMA>/<archivo>.pdf dentro de /tmp/mensuras
    const partes = f.split('/');
    if (partes.length !== 2) return NextResponse.json({ error: 'Ruta invalida' }, { status: 400 });
    const [adrema, archivo] = partes;
    if (!/^[A-Z]\d{4,}$/.test(adrema) || !/^[A-Za-z0-9._-]+\.pdf$/i.test(archivo)) {
        return NextResponse.json({ error: 'Ruta invalida' }, { status: 400 });
    }

    const ruta = path.join(BASE, adrema, archivo);
    if (!ruta.startsWith(path.join(BASE, adrema))) {
        return NextResponse.json({ error: 'Ruta invalida' }, { status: 400 });
    }
    if (!fs.existsSync(ruta)) return NextResponse.json({ error: 'No existe' }, { status: 404 });

    const bytes = fs.readFileSync(ruta);
    return new NextResponse(bytes, {
        status: 200,
        headers: {
            'content-type': 'application/pdf',
            'content-disposition': 'inline; filename="' + archivo + '"',
            'cache-control': 'private, max-age=600'
        }
    });
}
