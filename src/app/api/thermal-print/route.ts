import { NextResponse } from 'next/server';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import { buildPlainTextTMU220, buildTicketTMU220Buffer } from '@/lib/escpos-service';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';

const POSSIBLE_LINUX_DEVICES = [
  '/dev/usb/lp0',
  '/dev/usb/lp1',
  '/dev/usb/lp2',
  '/dev/lp0',
  '/dev/ttyUSB0',
  '/dev/ttyACM0'
];

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    const data = await request.json();

    if (!data) {
      return NextResponse.json({ success: false, message: 'Datos requeridos' }, { status: 400 });
    }

    // 1. Si se solicita específicamente en text/plain (para Python, terminal, o pruebas)
    if (format === 'text' || request.headers.get('accept')?.includes('text/plain')) {
      const plainText = buildPlainTextTMU220(data);
      return new Response(plainText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'inline; filename="ticket_tmu220.txt"'
        }
      });
    }

    // 2. Generar buffer nativo para Epson TM-U220
    const buffer = buildTicketTMU220Buffer(data);
    const plainText = buildPlainTextTMU220(data);

    // 3. En Linux Debian / MiniOS: Intentar envío directo por USB o CUPS
    if (process.platform === 'linux') {
      let targetDevice = '';
      for (const dev of POSSIBLE_LINUX_DEVICES) {
        if (fs.existsSync(dev)) {
          targetDevice = dev;
          break;
        }
      }

      if (targetDevice) {
        try {
          // Escritura directa al puerto de la TM-U220
          fs.writeFileSync(targetDevice, buffer);
          return NextResponse.json({
            success: true,
            method: 'direct_device',
            device: targetDevice,
            message: `Ticket enviado en texto nativo a ${targetDevice} (Epson TM-U220)`
          });
        } catch (writeErr: any) {
          console.warn(`Error al escribir directo en ${targetDevice}:`, writeErr?.message);

          // Alternativa con cat / pipe
          try {
            const tempFile = path.join(os.tmpdir(), `tmu220_${Date.now()}.txt`);
            fs.writeFileSync(tempFile, buffer);
            await execAsync(`cat "${tempFile}" > "${targetDevice}"`);
            try { fs.unlinkSync(tempFile); } catch (e) {}

            return NextResponse.json({
              success: true,
              method: 'cat_device',
              device: targetDevice,
              message: `Ticket enviado a ${targetDevice}`
            });
          } catch (catErr: any) {
            console.warn(`Error con cat a ${targetDevice}:`, catErr?.message);
          }
        }
      }

      // Intentar vía comando lp en modo RAW
      try {
        const tempFile = path.join(os.tmpdir(), `tmu220_cups_${Date.now()}.txt`);
        fs.writeFileSync(tempFile, buffer);
        const { stdout } = await execAsync(`lp -o raw "${tempFile}"`);
        try { fs.unlinkSync(tempFile); } catch (e) {}

        return NextResponse.json({
          success: true,
          method: 'cups_raw',
          output: stdout.trim(),
          message: 'Ticket enviado a Epson TM-U220 vía CUPS (modo raw)'
        });
      } catch (cupsErr: any) {
        console.warn('Fallo impresión por lp raw:', cupsErr?.message);
      }
    }

    // Si no se pudo enviar directamente al dispositivo, devolver el texto plano para que el cliente lo use
    return NextResponse.json({
      success: false,
      fallback: true,
      plainText,
      message: 'No se detectó el puerto /dev/usb/lp*. Se proporciona texto plano para impresión alternativa.'
    });

  } catch (error: any) {
    console.error('Error en /api/thermal-print:', error);
    return NextResponse.json({
      success: false,
      fallback: true,
      error: error?.message || 'Error al procesar ticket para TM-U220'
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return new Response('Endpoint activo. Envía POST con los datos de la factura/nota para imprimir en Epson TM-U220.', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
