import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// ID de la Hoja Maestra (Del Plan de Bunker)
const SPREADSHEET_ID = '1OibSZv8dED4jPWUaP5NDAl4ubSDTdHPRBJSn9H7Dh5c';
const SHEET_TITLE = 'Clientes_Registrados Arq. Virtual';

export async function registrarClienteEnSheets(datos) {
    try {
        // 1. Autenticación (Prioridad: Archivo JSON local -> Variables de Entorno)
        let serviceAccountAuth;
        const keyFilePath = path.join(process.cwd(), 'service-account.json');

        if (fs.existsSync(keyFilePath)) {
            try {
                const creds = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
                console.log('[GoogleSheets] Usando credenciales locales:', keyFilePath);
                serviceAccountAuth = new JWT({
                    email: creds.client_email,
                    key: creds.private_key,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } catch (err) {
                console.error('[GoogleSheets] Error leyendo service-account.json:', err);
            }
        }

        if (!serviceAccountAuth) {
            console.log('[GoogleSheets] Buscando credenciales en ENV...');
            // Opción 1: JSON completo en base64 (más robusto)
            if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
                const creds = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8'));
                console.log('[GoogleSheets] Usando credenciales base64, email:', creds.client_email);
                serviceAccountAuth = new JWT({
                    email: creds.client_email,
                    key: creds.private_key,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else {
                // Opción 2: variables separadas
                let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
                privateKey = privateKey.replace(/\\n/g, '\n');
                if (privateKey.startsWith('"')) privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
                console.log('[GoogleSheets] Key starts with:', privateKey.substring(0, 27));
                serviceAccountAuth = new JWT({
                    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                    key: privateKey,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            }
        }

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

        // 2. Cargar info de la hoja
        await doc.loadInfo();

        // 3. Buscar o Crear Pestaña
        let sheet = doc.sheetsByTitle[SHEET_TITLE];
        if (!sheet) {
            console.log(`[GoogleSheets] Creando hoja: ${SHEET_TITLE}`);
            sheet = await doc.addSheet({ title: SHEET_TITLE, headerValues: ['Fecha', 'Teléfono', 'Nombre', 'Email', 'Adrema'] });
        }

        // 4. Validar Duplicados (Optional: Check last N rows or all)
        // Para simplificar y rendimiento, solo hacemos append. 
        // Si se requiere validación estricta, habría que leer filas.
        // Implementamos lectura básica de últimas 50 filas para evitar doble submit inmediato.
        const rows = await sheet.getRows({ limit: 50, offset: Math.max(0, sheet.rowCount - 50) });
        const isDuplicate = rows.some(row => row.get('Teléfono') == datos.telefono && row.get('Adrema') == datos.adrema);

        if (isDuplicate) {
            console.log('[GoogleSheets] Registro duplicado prevenido.');
            return { success: true, message: 'Ya registrado' };
        }

        // 5. Append Row
        // 5. Append Row
        // HEADERS DEL USUARIO: 'Nombre y Apellido', 'Numero de Celular', 'Email', 'Informe'
        const ahora = new Date();
        const fechaHora = ahora.toLocaleDateString() + ' ' + ahora.toLocaleTimeString();

        await sheet.addRow({
            'Nombre y Apellido': datos.nombre,
            'Numero de Celular': `'${datos.telefono}`,
            'Email': datos.email || 'No provisto',
            'Informe': datos.adrema + ` (${fechaHora})`
        });

        return { success: true };

    } catch (error) {
        console.error('[GoogleSheets] Error:', error);
        return { success: false, error: error.message };
    }
}
