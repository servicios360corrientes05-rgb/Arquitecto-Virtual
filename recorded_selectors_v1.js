import { test, expect } from '@playwright/test';
import path from 'path';

test('Scrapeo Catastro Corrientes - Protocolo de Precisión', async ({ page }) => {
  // Configuración de variables (Capa 1: Datos)
  const adrema = 'A10169791';
  const downloadPath = 'D:\\DANIEL\\Downloads\\Antigravity\\Proyectos\\Integracion de APP\\descargas';

  // 1. LOGIN HUMANO: Evita saltar el User ID
  await page.goto('https://dgc.corrientes.gob.ar/webapp/Account/Login');
  const userField = page.getByRole('textbox', { name: 'User ID' });
  await userField.waitFor({ state: 'visible' });
  await userField.fill('arneaz90', { delay: 100 }); // Escritura lenta

  const passField = page.getByRole('textbox', { name: 'Password' });
  await passField.fill('dani1204', { delay: 100 });
  await page.getByRole('button', { name: 'INGRESAR' }).click();

  // 2. CAJA DE REPARACIÓN: Modal de Bienvenida
  const welcomeModal = page.locator('#modalInfoProvisoria');
  try {
    const closeX = welcomeModal.getByLabel('Cerrar');
    await closeX.waitFor({ state: 'visible', timeout: 5000 });
    await closeX.click();
  } catch (e) {
    console.log("El modal de bienvenida no apareció, procediendo...");
  }

  // 3. BÚSQUEDA DE ADREMA
  const searchInput = page.getByRole('textbox', { name: 'Buscar...' });
  await searchInput.waitFor({ state: 'visible' });
  await searchInput.fill(adrema);
  await searchInput.press('Enter');

  // 4. SECUENCIA FILA 3 (PASOS 7, 8 Y 9)
  // Seleccionamos la fila 3 y realizamos el hover para despertar el menú
  const fila3 = page.locator('table tbody tr').nth(2);
  await fila3.scrollIntoViewIfNeeded();
  await fila3.hover(); // Paso 7: Desplegar opciones

  // Paso 8: Clic en el icono de 'Ver Documento' (Lupa/Hoja)
  const btnVerDoc = fila3.locator('i.fa-file-pdf, i.fa-search').first();
  await btnVerDoc.click();

  // 5. PROTOCOLO DE PERSISTENCIA: Descarga desde el visor
  const downloadButton = page.locator('#btnDescargar'); // El icono del ordenador

  // Regla de Oro: Espera activa de 30 segundos
  await downloadButton.waitFor({ state: 'visible', timeout: 30000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'), // Captura el evento de descarga
    downloadButton.click(),        // Paso 9: Clic en el círculo rojo
  ]);

  // 6. GESTIÓN DE SALIDA: Guardar para "coser" al informe
  const fileName = `${adrema}_mensura.pdf`;
  await download.saveAs(path.join(downloadPath, fileName));
  console.log(`Archivo guardado con éxito: ${fileName}`);
});