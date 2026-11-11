'use strict';
/**
 * coserInforme.js
 * Junta el informe municipal (PDF) con la/s mensura/s del catastro provincial (DGC).
 *
 * La mensura puede estar en tres carpetas distintas segun quien la haya bajado:
 *   - public/informes            (el generador de informes, watcher.js)
 *   - /tmp/mensuras/<ADREMA>     (la pagina, via /api/catastro)
 *   - data/mensuras/<ADREMA>     (respaldo historico)
 * Por eso se buscan todas y se copian a la carpeta de salida antes de coser.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const ESTADO_INFORMES = path.resolve('./data/informes_estado.json');

function patronMensura(adrema) {
    return new RegExp('Mensura_.*' + adrema + '.*\\.pdf$', 'i');
}

function carpetas(adrema, carpetaSalida) {
    return [
        path.resolve(carpetaSalida),
        path.join('/tmp/mensuras', adrema),
        path.resolve('./data/mensuras', adrema)
    ];
}

/** Devuelve [{ archivo, ruta, carpeta }] sin repetir nombres. */
function buscarMensuras(adrema, carpetaSalida) {
    const pat = patronMensura(adrema);
    const vistos = new Set();
    const lista = [];
    for (const carpeta of carpetas(adrema, carpetaSalida)) {
        let archivos = [];
        try { archivos = fs.readdirSync(carpeta); } catch (e) { continue; }
        for (const f of archivos) {
            if (!pat.test(f) || vistos.has(f)) continue;
            const ruta = path.join(carpeta, f);
            try { if (!fs.statSync(ruta).isFile()) continue; } catch (e) { continue; }
            if (fs.statSync(ruta).size < 1000) continue; // descargas a medias
            vistos.add(f);
            lista.push({ archivo: f, ruta: ruta, carpeta: carpeta });
        }
    }
    lista.sort((a, b) => a.archivo.localeCompare(b.archivo));
    return lista;
}

async function cargarPdf(bytes) {
    try {
        return await PDFDocument.load(bytes);
    } catch (e) {
        return await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
    }
}

function guardarEstadoInforme(adrema, archivo, resultado) {
    try {
        const carpeta = path.dirname(ESTADO_INFORMES);
        if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
        let estado = {};
        try { estado = JSON.parse(fs.readFileSync(ESTADO_INFORMES, 'utf8')); } catch (e) { estado = {}; }
        estado[adrema] = {
            archivo: path.basename(archivo),
            paginas: (resultado.paginasInforme || 0) + (resultado.paginasMensura || 0),
            paginasInforme: resultado.paginasInforme || 0,
            paginasMensura: resultado.paginasMensura || 0,
            mensuras: resultado.mensuras || [],
            tieneMensura: (resultado.paginasMensura || 0) > 0,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(ESTADO_INFORMES, JSON.stringify(estado, null, 2));
    } catch (e) {
        console.log('⚠️ No se pudo guardar el estado del informe:', e.message);
    }
}

/**
 * Cose el informe con todas las mensuras encontradas.
 * @returns {Promise<object>} { ok, destino, paginasInforme, paginasMensura, mensuras, motivo, bytes }
 */
async function coser(adrema, carpetaSalida, opciones) {
    const op = opciones || {};
    const salida = path.resolve(carpetaSalida);
    const mensuras = buscarMensuras(adrema, salida);

    if (!op.informe || !fs.existsSync(op.informe)) {
        return { ok: false, motivo: 'no-hay-informe', mensuras: mensuras.length };
    }

    // Las mensuras que viven fuera de la carpeta de salida se copian ahi,
    // asi quedan servidas por /api/serve-pdf y no se pierden si el contenedor se reinicia.
    for (const m of mensuras) {
        const destinoCopia = path.join(salida, m.archivo);
        if (path.dirname(m.ruta) !== salida) {
            try { fs.copyFileSync(m.ruta, destinoCopia); } catch (e) { }
        }
    }

    const municipalPdf = await cargarPdf(fs.readFileSync(op.informe));
    const finalPdf = await PDFDocument.create();
    const paginasInforme = await finalPdf.copyPages(municipalPdf, municipalPdf.getPageIndices());
    paginasInforme.forEach(p => finalPdf.addPage(p));

    let paginasMensura = 0;
    const anexadas = [];
    for (const m of mensuras) {
        const rutaLocal = fs.existsSync(path.join(salida, m.archivo)) ? path.join(salida, m.archivo) : m.ruta;
        try {
            const men = await cargarPdf(fs.readFileSync(rutaLocal));
            const copiadas = await finalPdf.copyPages(men, men.getPageIndices());
            copiadas.forEach(p => finalPdf.addPage(p));
            paginasMensura += copiadas.length;
            anexadas.push(m.archivo);
            console.log('   > ✅ ' + m.archivo + ': ' + copiadas.length + ' página(s) anexada(s)');
        } catch (e) {
            console.log('   > ⚠️ No se pudo anexar ' + m.archivo + ': ' + e.message);
        }
    }

    const bytes = await finalPdf.save();
    const destino = op.destino || path.join(salida, 'Informe_Final_Adrema_' + adrema + '.pdf');
    fs.writeFileSync(destino, bytes);

    const resultado = {
        ok: true,
        destino: destino,
        archivo: path.basename(destino),
        paginasInforme: municipalPdf.getPageCount(),
        paginasMensura: paginasMensura,
        mensuras: anexadas,
        bytes: bytes.length
    };
    guardarEstadoInforme(adrema, destino, resultado);
    return resultado;
}

module.exports = { buscarMensuras, coser, guardarEstadoInforme };
