import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req) {
    try {
        const { adrema } = await req.json();

        if (!adrema) {
            return NextResponse.json({ error: 'Adrema required' }, { status: 400 });
        }

        const directoryPath = path.join(process.cwd(), 'public', 'informes');

        if (!fs.existsSync(directoryPath)) {
            return NextResponse.json({ found: false });
        }

        const files = fs.readdirSync(directoryPath);

        // Find the LATEST file for this Adrema
        // Filename format: Informe_A10169791_2026-01-16T04-21-54-187Z.pdf
        const matchingFiles = files
            .filter(file =>
                (file.startsWith(`Informe_${adrema}_`) || file.startsWith(`Informe_Final_Adrema_${adrema}_`) || file === `Informe_Final_Adrema_${adrema}.pdf`)
                && file.endsWith('.pdf')
            )
            .map(file => {
                const filePath = path.join(directoryPath, file);
                const stats = fs.statSync(filePath);
                return { file, mtime: stats.mtime };
            })
            .sort((a, b) => b.mtime - a.mtime); // Newest first

        if (matchingFiles.length > 0) {
            return NextResponse.json({
                found: true,
                url: `/api/serve-pdf/${matchingFiles[0].file}`
            });
        } else {
            return NextResponse.json({ found: false });
        }

    } catch (error) {
        console.error('Error checking PDF:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
