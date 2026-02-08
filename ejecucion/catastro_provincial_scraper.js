/**
 * CATASTRO PROVINCIAL SCRAPER v7.0 - Arquitecto Virtual
 * Versión ROBUSTA - Selectores dinámicos, sin coordenadas fijas
 *
 * Uso: node ejecucion/catastro_provincial_scraper.js A10169791
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CONFIG = {
    url: 'https://dgc.corrientes.gob.ar',
    user: process.env.DGC_CATASTRO_USER || 'arneaz90',
    pass: process.env.DGC_CATASTRO_PASS || 'dani1204',
    downloadPath: 'D:\\DANIEL\\Downloads',
    timeout: 30000
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function log(paso, msg) {
    console.log(`   [Paso ${paso}] ${msg}`);
}

async function screenshot(page, nombre) {
    try {
        await page.screenshot({ path: path.join(CONFIG.downloadPath, `debug_${nombre}.png`) });
        console.log(`   📸 ${nombre}.png`);
    } catch (e) {
        console.log(`   ⚠ No se pudo capturar ${nombre}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Buscar y hacer clic en botón por texto exacto
// ═══════════════════════════════════════════════════════════════════════════════
async function clickBotonPorTexto(page, textoBoton, timeout = 10000) {
    const inicio = Date.now();

    while (Date.now() - inicio < timeout) {
        const boton = await page.evaluate((texto) => {
            // Buscar en button, a, span, div que contengan el texto exacto
            const selectores = ['button', 'a', 'span', 'div', 'input[type="button"]'];

            for (const sel of selectores) {
                const elementos = document.querySelectorAll(sel);
                for (const el of elementos) {
                    const elTexto = (el.innerText || el.value || '').trim().toLowerCase();
                    if (elTexto === texto.toLowerCase()) {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        const visible = rect.width > 0 && rect.height > 0 &&
                                       style.display !== 'none' &&
                                       style.visibility !== 'hidden';
                        if (visible) {
                            return {
                                encontrado: true,
                                x: rect.x + rect.width / 2,
                                y: rect.y + rect.height / 2,
                                tag: el.tagName,
                                clase: el.className
                            };
                        }
                    }
                }
            }
            return { encontrado: false };
        }, textoBoton);

        if (boton.encontrado) {
            // Clic con JavaScript directo
            await page.evaluate((coords) => {
                const elem = document.elementFromPoint(coords.x, coords.y);
                if (elem) {
                    elem.click();
                    elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
            }, boton);

            // También clic con mouse
            await page.mouse.click(boton.x, boton.y);

            return { success: true, ...boton };
        }

        await delay(500);
    }

    return { success: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Cerrar modal por botón X
// ═══════════════════════════════════════════════════════════════════════════════
async function cerrarModalPorX(page, timeout = 10000) {
    const inicio = Date.now();

    while (Date.now() - inicio < timeout) {
        const xBoton = await page.evaluate(() => {
            // Método 1: Buscar por clase .close dentro de modal visible
            const modales = document.querySelectorAll('.modal.show, .modal[style*="display: block"], [class*="modal"]:not([style*="display: none"])');
            for (const modal of modales) {
                const closeBtn = modal.querySelector('.close, .btn-close, [data-dismiss="modal"], [aria-label="Close"]');
                if (closeBtn) {
                    const rect = closeBtn.getBoundingClientRect();
                    if (rect.width > 0) {
                        return { encontrado: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2, metodo: 'clase .close' };
                    }
                }
            }

            // Método 2: Buscar símbolo × en cualquier elemento clickeable
            const elementos = document.querySelectorAll('button, span, a, div, i');
            for (const el of elementos) {
                const texto = (el.innerText || el.textContent || '').trim();
                if (texto === '×' || texto === 'X' || texto === 'x' || texto === '✕' || texto === '✖') {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (rect.width > 0 && rect.width < 60 && style.display !== 'none') {
                        return { encontrado: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2, metodo: 'símbolo ×' };
                    }
                }
            }

            // Método 3: Buscar por data-dismiss
            const dismissBtns = document.querySelectorAll('[data-dismiss="modal"], [data-bs-dismiss="modal"]');
            for (const btn of dismissBtns) {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0) {
                    return { encontrado: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2, metodo: 'data-dismiss' };
                }
            }

            return { encontrado: false };
        });

        if (xBoton.encontrado) {
            await page.evaluate((coords) => {
                const elem = document.elementFromPoint(coords.x, coords.y);
                if (elem) elem.click();
            }, xBoton);
            await page.mouse.click(xBoton.x, xBoton.y);
            return { success: true, ...xBoton };
        }

        await delay(500);
    }

    return { success: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Extraer datos estructurados de las 7 filas
// ═══════════════════════════════════════════════════════════════════════════════
async function extraerDatosEstructurados(page) {
    return await page.evaluate(() => {
        const datos = {
            mensuraId: null,
            tipoMensura: null,
            estadoMensura: null,
            nomenclatura: null,
            titulares: null,
            matricula: null,
            superficie: null,
            calle: null,
            numero: null,
            manzana: null,
            lote: null,
            parcela: null
        };

        const texto = document.body.innerText;

        // ═══════════════════════════════════════════════════════════════════
        // FILA 1-2: MENSURAS - ID de mensura (ej: 3356-U)
        // ═══════════════════════════════════════════════════════════════════
        // Buscar patrón de ID de mensura: número-letra
        const mensuraMatch = texto.match(/(\d{3,5}-[A-Z])/);
        if (mensuraMatch) datos.mensuraId = mensuraMatch[1];

        // Tipo de mensura
        const tipoMatch = texto.match(/Tipo:\s*([^\n-]+)/i);
        if (tipoMatch) datos.tipoMensura = tipoMatch[1].trim();

        // Estado
        const estadoMatch = texto.match(/Estado:\s*([A-Z]+)/i);
        if (estadoMatch) datos.estadoMensura = estadoMatch[1].trim();

        // ═══════════════════════════════════════════════════════════════════
        // FILA 3-4: UNIDADES TRIBUTARIAS
        // ═══════════════════════════════════════════════════════════════════
        // Nomenclatura (ej: 5843G5J4+FV4)
        const nomenclaturaMatch = texto.match(/Nomenclatura:\s*([A-Z0-9+]+)/i) ||
                                  texto.match(/([A-Z0-9]{4,}[+][A-Z0-9]+)/);
        if (nomenclaturaMatch) datos.nomenclatura = nomenclaturaMatch[1];

        // ═══════════════════════════════════════════════════════════════════
        // FILA 5: TITULARES
        // ═══════════════════════════════════════════════════════════════════
        const titularesMatch = texto.match(/Titulares?:\s*([^\n]+)/i);
        if (titularesMatch) datos.titulares = titularesMatch[1].trim();

        // ═══════════════════════════════════════════════════════════════════
        // FILA 6: DOMINIOS / MATRÍCULA
        // ═══════════════════════════════════════════════════════════════════
        const matriculaMatch = texto.match(/MATR[IÍ]CULA:\s*([0-9/]+)/i) ||
                               texto.match(/Dominios:\s*MATR[IÍ]CULA:\s*([0-9/]+)/i);
        if (matriculaMatch) datos.matricula = matriculaMatch[1];

        // ═══════════════════════════════════════════════════════════════════
        // FILA 7: PARCELAS - Superficie, Calle, Nro, Manzana, Lote
        // ═══════════════════════════════════════════════════════════════════
        // Parcela ID
        const parcelaMatch = texto.match(/(A\d{8,})/);
        if (parcelaMatch) datos.parcela = parcelaMatch[1];

        // Superficie
        const superficieMatch = texto.match(/Superficie:\s*([\d.,]+)\s*m/i);
        if (superficieMatch) datos.superficie = superficieMatch[1] + ' m²';

        // Calle
        const calleMatch = texto.match(/Calle:\s*([A-ZÁÉÍÓÚÑ\s]+?)(?:\s*-|$)/i);
        if (calleMatch) datos.calle = calleMatch[1].trim();

        // Número
        const nroMatch = texto.match(/Nro:\s*(\d+)/i);
        if (nroMatch) datos.numero = nroMatch[1];

        // Manzana
        const manzanaMatch = texto.match(/Manzana:\s*(\d+)/i);
        if (manzanaMatch) datos.manzana = manzanaMatch[1];

        // Lote
        const loteMatch = texto.match(/Lote:\s*([A-Z0-9]+)/i);
        if (loteMatch) datos.lote = loteMatch[1];

        return datos;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Hover sobre elemento y buscar ícono por title
// ═══════════════════════════════════════════════════════════════════════════════
async function hoverYBuscarIcono(page, textoFila, titleIcono, timeout = 10000) {
    // Primero encontrar el elemento de la fila
    const fila = await page.evaluate((texto) => {
        const elementos = document.querySelectorAll('*');
        for (const el of elementos) {
            const elTexto = (el.innerText || '').trim();
            if (elTexto.startsWith(texto) && elTexto.includes('Tipo:')) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 15 && rect.height < 100) {
                    return {
                        encontrado: true,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()
                    };
                }
            }
        }
        // Fallback: buscar solo por el ID
        for (const el of elementos) {
            const elTexto = (el.innerText || '').trim();
            if (elTexto === texto || (elTexto.startsWith(texto) && elTexto.length < texto.length + 20)) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 30 && rect.height > 10) {
                    return {
                        encontrado: true,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        selector: 'fallback'
                    };
                }
            }
        }
        return { encontrado: false };
    }, textoFila);

    if (!fila.encontrado) {
        return { success: false, error: 'Fila no encontrada' };
    }

    // Hacer HOVER real con page.mouse.move
    await page.mouse.move(fila.x, fila.y);
    await delay(500);

    // Mover ligeramente para activar el hover
    await page.mouse.move(fila.x + 5, fila.y);
    await delay(500);
    await page.mouse.move(fila.x, fila.y);

    // Esperar a que aparezcan los íconos
    await delay(2000);

    // Buscar el ícono por title exacto
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
        const icono = await page.evaluate((title) => {
            // Buscar por title exacto
            const iconos = document.querySelectorAll(`*[title="${title}"], *[title="${title.toLowerCase()}"]`);
            for (const ic of iconos) {
                const rect = ic.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return {
                        encontrado: true,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        title: ic.title
                    };
                }
            }

            // Buscar por title que contenga el texto
            const iconosContiene = document.querySelectorAll(`*[title*="${title}"], *[title*="${title.toLowerCase()}"]`);
            for (const ic of iconosContiene) {
                const rect = ic.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return {
                        encontrado: true,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        title: ic.title
                    };
                }
            }

            return { encontrado: false };
        }, titleIcono);

        if (icono.encontrado) {
            return { success: true, fila, icono };
        }

        // Mantener el hover activo
        await page.mouse.move(fila.x, fila.y);
        await delay(500);
    }

    return { success: false, fila, error: 'Ícono no encontrado después del hover' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════
async function scraper(adrema) {
    console.log('\n' + '═'.repeat(60));
    console.log('   CATASTRO PROVINCIAL SCRAPER v7.0 - ROBUSTO');
    console.log('═'.repeat(60));
    console.log(`   Adrema: ${adrema}`);
    console.log('═'.repeat(60) + '\n');

    const resultado = { success: false, datos: {}, archivo: null };

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1366, height: 768 },
        args: ['--start-maximized', '--disable-web-security']
    });

    const page = await browser.newPage();

    // Configurar descargas
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.downloadPath
    });

    try {
        // ═══════════════════════════════════════════════════════════════════
        // PASO 1: Navegar a la página
        // ═══════════════════════════════════════════════════════════════════
        console.log('📍 PASO 1: Navegando a dgc.corrientes.gob.ar');
        await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
        log(1, '✓ Página cargada');
        await delay(2000);

        // ═══════════════════════════════════════════════════════════════════
        // PASO 2: Login
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n🔐 PASO 2: Ingresando credenciales');
        await page.type('input[type="text"]', CONFIG.user, { delay: 50 });
        log(2, `✓ Usuario: ${CONFIG.user}`);
        await page.type('input[type="password"]', CONFIG.pass, { delay: 50 });
        log(2, '✓ Contraseña: ********');

        await page.click('button');
        log(2, '✓ Click en INGRESAR');

        await delay(3000);
        await screenshot(page, '02_despues_login');

        // ═══════════════════════════════════════════════════════════════════
        // PASO 3: Modal "Cambia tu contraseña" - Buscar botón ACEPTAR por texto
        // NO usar coordenadas fijas
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n🔔 PASO 3: Modal "Cambia tu contraseña"');
        log(3, 'Buscando botón "Aceptar" por texto exacto...');

        const resultadoAceptar = await clickBotonPorTexto(page, 'Aceptar', 8000);

        if (resultadoAceptar.success) {
            log(3, `✓ Botón "Aceptar" encontrado (${resultadoAceptar.tag}.${resultadoAceptar.clase})`);
            log(3, `✓ Clic ejecutado en (${Math.round(resultadoAceptar.x)}, ${Math.round(resultadoAceptar.y)})`);
            await delay(1500);
        } else {
            log(3, '→ Modal "Cambia tu contraseña" no detectado o botón no encontrado');
        }

        await screenshot(page, '03_despues_aceptar');

        // ═══════════════════════════════════════════════════════════════════
        // PASO 4: Cerrar modal "Bienvenido" - Buscar X por selector
        // NO usar coordenadas fijas
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n🔔 PASO 4: Cerrar modal "Bienvenido"');
        log(4, 'Buscando botón X por clase .close o símbolo ×...');

        // Verificar si hay modal abierto
        const hayModalBienvenido = await page.evaluate(() => {
            return document.body.innerText.includes('Bienvenido') &&
                   document.body.innerText.includes('¡Atención!');
        });

        if (hayModalBienvenido) {
            const resultadoX = await cerrarModalPorX(page, 8000);

            if (resultadoX.success) {
                log(4, `✓ Botón X encontrado (${resultadoX.metodo})`);
                log(4, `✓ Clic ejecutado en (${Math.round(resultadoX.x)}, ${Math.round(resultadoX.y)})`);
                await delay(1500);
            } else {
                log(4, '⚠ Botón X no encontrado, intentando tecla Escape...');
                await page.keyboard.press('Escape');
                await delay(1000);
            }
        } else {
            log(4, '→ Modal "Bienvenido" no detectado');
        }

        await screenshot(page, '04_despues_cerrar_modal');
        await delay(2000);

        // ═══════════════════════════════════════════════════════════════════
        // PASO 5: Buscar Adrema
        // ═══════════════════════════════════════════════════════════════════
        console.log(`\n🔍 PASO 5: Buscando Adrema "${adrema}"`);

        // Buscar campo de búsqueda
        const inputBuscar = await page.$('input[placeholder*="uscar"], input[placeholder*="Buscar"], input[type="search"]');

        if (inputBuscar) {
            await inputBuscar.click({ clickCount: 3 });
            await delay(300);
            await inputBuscar.type(adrema, { delay: 100 });
            log(5, '✓ Adrema escrito en campo de búsqueda');
        } else {
            // Fallback: JavaScript directo
            await page.evaluate((valor) => {
                const inputs = document.querySelectorAll('input');
                for (const input of inputs) {
                    const placeholder = (input.placeholder || '').toLowerCase();
                    if (placeholder.includes('buscar') || placeholder.includes('search')) {
                        input.value = valor;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            }, adrema);
            log(5, '✓ Adrema escrito (método JavaScript)');
        }

        await delay(3000);
        await screenshot(page, '05_adrema_escrito');

        // Buscar y hacer clic en resultado del dropdown
        log(5, 'Buscando resultado en dropdown...');
        const dropdown = await page.evaluate((valor) => {
            const elementos = document.querySelectorAll('li, div, span, a');
            for (const el of elementos) {
                const texto = (el.innerText || '').trim();
                const rect = el.getBoundingClientRect();
                // Buscar elemento que contenga exactamente el adrema
                if (texto === valor && rect.width > 0 && rect.top > 40 && rect.height < 60) {
                    return { encontrado: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
                }
            }
            return { encontrado: false };
        }, adrema);

        if (dropdown.encontrado) {
            await page.mouse.click(dropdown.x, dropdown.y);
            log(5, '✓ Clic en resultado del dropdown');
        } else {
            await page.keyboard.press('Enter');
            log(5, '✓ Enter presionado (dropdown no encontrado)');
        }

        await delay(5000);
        await screenshot(page, '05_resultados');

        // ═══════════════════════════════════════════════════════════════════
        // PASO 6: Extraer datos estructurados de las 7 filas
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n📊 PASO 6: Extrayendo datos de las 7 filas');

        const datos = await extraerDatosEstructurados(page);
        resultado.datos = datos;

        log(6, '═══════════════════════════════════════════════════════');
        log(6, `Mensura ID: ${datos.mensuraId || '❌ No encontrado'}`);
        log(6, `Tipo: ${datos.tipoMensura || '-'}`);
        log(6, `Estado: ${datos.estadoMensura || '-'}`);
        log(6, `Nomenclatura: ${datos.nomenclatura || '-'}`);
        log(6, `Titulares: ${datos.titulares || '❌ No encontrado'}`);
        log(6, `Matrícula: ${datos.matricula || '-'}`);
        log(6, `Parcela: ${datos.parcela || '-'}`);
        log(6, `Superficie: ${datos.superficie || '-'}`);
        log(6, `Calle: ${datos.calle || '-'} Nro: ${datos.numero || '-'}`);
        log(6, `Manzana: ${datos.manzana || '-'} Lote: ${datos.lote || '-'}`);
        log(6, '═══════════════════════════════════════════════════════');

        // ═══════════════════════════════════════════════════════════════════
        // PASO 7-8: Hover sobre fila de mensura y buscar ícono "Ver Documento"
        // ═══════════════════════════════════════════════════════════════════
        if (datos.mensuraId) {
            console.log('\n🖱️ PASO 7: Hover sobre fila de mensura');
            log(7, `Buscando fila con ID "${datos.mensuraId}"...`);

            const resultadoHover = await hoverYBuscarIcono(page, datos.mensuraId, 'Ver Documento', 15000);

            if (resultadoHover.success) {
                log(7, '✓ Hover activado sobre la fila');
                log(7, `✓ Ícono "Ver Documento" encontrado (title: ${resultadoHover.icono.title})`);

                await screenshot(page, '07_hover_iconos');

                // ═══════════════════════════════════════════════════════════
                // PASO 8: Clic en "Ver Documento"
                // ═══════════════════════════════════════════════════════════
                console.log('\n📄 PASO 8: Clic en "Ver Documento"');

                await page.mouse.click(resultadoHover.icono.x, resultadoHover.icono.y);
                log(8, `✓ Clic en (${Math.round(resultadoHover.icono.x)}, ${Math.round(resultadoHover.icono.y)})`);

                await delay(5000);
                await screenshot(page, '08_visor_pdf');

                // ═══════════════════════════════════════════════════════════
                // PASO 9: Descargar PDF - Buscar botón por title="Descargar"
                // ═══════════════════════════════════════════════════════════
                console.log('\n⬇️ PASO 9: Descargar PDF');
                log(9, 'Buscando botón de descarga por title="Descargar"...');

                const botonDescarga = await page.evaluate(() => {
                    // Buscar por title exacto
                    const selectores = [
                        '*[title="Descargar"]',
                        '*[title="descargar"]',
                        '*[title="Download"]',
                        '*[title="download"]',
                        '*[title*="Descargar"]',
                        '*[title*="Download"]',
                        'button[class*="download"]',
                        'a[class*="download"]',
                        '*[class*="download"]'
                    ];

                    for (const sel of selectores) {
                        const elementos = document.querySelectorAll(sel);
                        for (const el of elementos) {
                            const rect = el.getBoundingClientRect();
                            // El botón de descarga está en la barra superior (top < 200)
                            if (rect.width > 0 && rect.height > 0 && rect.top < 200 && rect.top > 50) {
                                return {
                                    encontrado: true,
                                    x: rect.x + rect.width / 2,
                                    y: rect.y + rect.height / 2,
                                    selector: sel,
                                    title: el.title || el.className
                                };
                            }
                        }
                    }
                    return { encontrado: false };
                });

                if (botonDescarga.encontrado) {
                    log(9, `✓ Botón descarga encontrado (${botonDescarga.selector})`);
                    await page.mouse.click(botonDescarga.x, botonDescarga.y);
                    log(9, `✓ Clic en (${Math.round(botonDescarga.x)}, ${Math.round(botonDescarga.y)})`);
                } else {
                    log(9, '⚠ Botón no encontrado por selector, buscando en toolbar...');

                    // Buscar cualquier botón/ícono en la barra superior del visor
                    const toolbarBtn = await page.evaluate(() => {
                        const btns = document.querySelectorAll('button, a, svg, i, span');
                        for (const btn of btns) {
                            const rect = btn.getBoundingClientRect();
                            // Buscar en la barra azul superior (entre y=100 y y=160)
                            if (rect.top > 100 && rect.top < 160 && rect.width > 15 && rect.width < 60) {
                                // Verificar si parece un botón de descarga
                                const parent = btn.closest('button, a');
                                if (parent) {
                                    const pRect = parent.getBoundingClientRect();
                                    return { encontrado: true, x: pRect.x + pRect.width/2, y: pRect.y + pRect.height/2 };
                                }
                                return { encontrado: true, x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
                            }
                        }
                        return { encontrado: false };
                    });

                    if (toolbarBtn.encontrado) {
                        await page.mouse.click(toolbarBtn.x, toolbarBtn.y);
                        log(9, `✓ Clic en toolbar (${Math.round(toolbarBtn.x)}, ${Math.round(toolbarBtn.y)})`);
                    }
                }

                log(9, 'Esperando descarga (10 segundos)...');
                await delay(10000);
                await screenshot(page, '09_descarga');

                // Verificar descarga
                const archivos = fs.readdirSync(CONFIG.downloadPath)
                    .filter(f => f.endsWith('.pdf'))
                    .map(f => ({
                        nombre: f,
                        ruta: path.join(CONFIG.downloadPath, f),
                        tiempo: fs.statSync(path.join(CONFIG.downloadPath, f)).mtime.getTime()
                    }))
                    .sort((a, b) => b.tiempo - a.tiempo);

                if (archivos.length > 0 && Date.now() - archivos[0].tiempo < 60000) {
                    const rutaFinal = path.join(CONFIG.downloadPath, `${datos.mensuraId}.pdf`);
                    if (archivos[0].ruta !== rutaFinal) {
                        try {
                            fs.renameSync(archivos[0].ruta, rutaFinal);
                        } catch (e) {
                            // Si el archivo ya existe, usar el nombre original
                        }
                    }
                    resultado.archivo = rutaFinal;
                    log(9, `✓ ¡ARCHIVO DESCARGADO! ${datos.mensuraId}.pdf`);
                } else {
                    log(9, '⚠ No se detectó descarga reciente');
                }

            } else {
                log(7, `⚠ ${resultadoHover.error}`);
                if (resultadoHover.fila) {
                    log(7, `Fila encontrada en (${Math.round(resultadoHover.fila.x)}, ${Math.round(resultadoHover.fila.y)})`);
                }
                await screenshot(page, '07_error_hover');
            }
        } else {
            log(7, '⚠ No se puede hacer hover: ID de mensura no encontrado');
        }

        resultado.success = true;

    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        await screenshot(page, 'error');
        resultado.error = err.message;
    }

    await delay(3000);
    await browser.close();

    // Mostrar resultado final
    console.log('\n' + '═'.repeat(60));
    console.log('   RESULTADO FINAL');
    console.log('═'.repeat(60));
    console.log(JSON.stringify(resultado, null, 2));
    console.log('═'.repeat(60) + '\n');

    return resultado;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════════
const adrema = process.argv[2];

if (!adrema) {
    console.log('\nUso: node ejecucion/catastro_provincial_scraper.js <ADREMA>');
    console.log('Ejemplo: node ejecucion/catastro_provincial_scraper.js A10169791\n');
    process.exit(1);
}

scraper(adrema);
