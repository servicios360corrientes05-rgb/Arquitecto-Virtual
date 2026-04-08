import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req, { params }) {
    const { filename } = await params;

    // Validar que solo sea un nombre de archivo (sin path traversal)
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return new NextResponse('Invalid filename', { status: 400 });
    }

    if (!filename.endsWith('.pdf')) {
        return new NextResponse('Not found', { status: 404 });
    }

    const filePath = path.join(process.cwd(), 'public', 'informes', filename);

    if (!fs.existsSync(filePath)) {
        return new NextResponse('Not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': fileBuffer.length.toString(),
        }
    });
}
