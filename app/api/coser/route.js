import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vuelve a coser un informe que ya existe: toma el informe municipal mas reciente
// de ese adrema, le anexa la mensura del catastro (si la hay) y deja el PDF final.
// No consulta portales ni cobra nada: solo usa los archivos que ya estan en el servidor.

const INFORMES = path.join(process.cwd(), 'public', 'informes');

function ultimoInformeMunicipal(adrema) {
    if (!fs.existsSync(INFORMES)) return null;
    const patron = new RegExp('^Informe_' + adrema + '_.*\\.pdf$', 'i');
    const candidatos = fs.readdirSync(INFORMES)
        .filter((f) => patron.test(f))
        .map((f) => {
            const completo = path.join(INFORMES, f);
            let mtime = 0;
            try { mtime = fs.statSync(completo).mtimeMs; } catch (e) { }
            return { f, completo, mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);
    return candidatos.length > 0 ? candidatos[0].completo : null;
}

async function coserAdrema(adrema) {
    const informe = ultimoInformeMunicipal(adrema);
    if (!informe) {
        return NextResponse.json({
            ok: false,
            motivo: 'No hay ningun informe generado para ese adrema.',
            adrema
        }, { status: 404 });
    }

    const mod = await import('@/lib/coserInforme');
    const coser = mod.coser || (mod.default && mod.default.coser);
    if (typeof coser !== 'function') {
        return NextResponse.json({ ok: false, motivo: 'El modulo de cosido no esta disponible.' }, { status: 500 });
    }

    const ahora = new Date();
    const fechaHora = ahora.toISOString().replace(/[:.]/g, '-');
    const destino = path.join(INFORMES, 'Informe_Final_Adrema_' + adrema + '_' + fechaHora + '.pdf');

    const resultado = await coser(adrema, INFORMES, { informe, destino });

    return NextResponse.json({
        ok: resultado.ok,
        adrema,
        informeUsado: path.basename(informe),
        archivo: resultado.archivo,
        paginasInforme: resultado.paginasInforme,
        paginasMensura: resultado.paginasMensura,
        mensuras: resultado.mensuras,
        tieneMensura: (resultado.paginasMensura || 0) > 0,
        bytes: resultado.bytes,
        url: resultado.archivo ? '/api/serve-pdf/' + encodeURIComponent(resultado.archivo) : null
    });
}

export async function POST(req) {
    let adrema = '';
    try {
        const body = await req.json();
        adrema = String(body?.adrema || '').trim().toUpperCase().replace(/\s+/g, '');
    } catch (e) {
        return NextResponse.json({ ok: false, motivo: 'Cuerpo invalido' }, { status: 400 });
    }
    if (!/^[A-Z]\d{4,}$/.test(adrema)) {
        return NextResponse.json({ ok: false, motivo: 'Adrema invalido' }, { status: 400 });
    }
    try {
        return await coserAdrema(adrema);
    } catch (e) {
        return NextResponse.json({ ok: false, motivo: e?.message || String(e) }, { status: 500 });
    }
}

export async function GET(req) {
    const url = new URL(req.url);
    const adrema = String(url.searchParams.get('adrema') || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z]\d{4,}$/.test(adrema)) {
        return NextResponse.json({ ok: false, motivo: 'Adrema invalido' }, { status: 400 });
    }
    try {
        return await coserAdrema(adrema);
    } catch (e) {
        return NextResponse.json({ ok: false, motivo: e?.message || String(e) }, { status: 500 });
    }
}
