import { NextResponse } from 'next/server';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import { buildTicketESCPOS } from '@/lib/escpos-service';

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
    const data = await request.json();
    if (!data) {
      return NextResponse.json({ success: false, message: 'Datos incompletos' }, { status: 400 });
    }

    // Generar buffer binario ESC/POS
    const buffer = buildTicketESCPOS(data);

    // 1. Detección de dispositivos directos en Linux (/dev/usb/lp*)
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
          // Intentar escritura directa al dispositivo USB
          fs.writeFileSync(targetDevice, buffer);
          return NextResponse.json({
            success: true,
            method: 'direct_device',
            device: targetDevice,
            message: `Ticket impreso directamente en ${targetDevice}`
          });
        } catch (writeErr: any) {
          console.warn(`Error al escribir directo en ${targetDevice}:`, writeErr?.message);
          
          // Si es error de permisos (EACCES), intentar enviar mediante pipe/cat con permisos
          try {
            const tempFilePath = path.join(os.tmpdir(), `ticket_${Date.now()}.bin`);
            fs.writeFileSync(tempFilePath, buffer);
            await execAsync(`cat "${tempFilePath}" > "${targetDevice}"`);
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
            
            return NextResponse.json({
              success: true,
              method: 'cat_device',
              device: targetDevice,
              message: `Ticket enviado a ${targetDevice}`
            });
          } catch (catErr: any) {
            console.warn(`Fallo cat a ${targetDevice}, intentando CUPS raw...`, catErr?.message);
          }
        }
      }

      // 2. Intentar a través de CUPS en modo RAW (lp -o raw)
      try {
        const tempFilePath = path.join(os.tmpdir(), `ticket_cups_${Date.now()}.bin`);
        fs.writeFileSync(tempFilePath, buffer);
        
        // Ejecutar lp -o raw
        const { stdout } = await execAsync(`lp -o raw "${tempFilePath}"`);
        try { fs.unlinkSync(tempFilePath); } catch (e) {}

        return NextResponse.json({
          success: true,
          method: 'cups_raw',
          output: stdout.trim(),
          message: 'Ticket enviado a través de CUPS (modo raw)'
        });
      } catch (cupsErr: any) {
        console.warn('Fallo impresión por CUPS raw:', cupsErr?.message);
      }
    }

    // Si no es Linux o no se detectó el dispositivo físico
    return NextResponse.json({
      success: false,
      fallback: true,
      message: 'No se detectó impresora térmica en /dev/usb/lp* o no hay soporte en este entorno.'
    });

  } catch (error: any) {
    console.error('Error en /api/thermal-print:', error);
    return NextResponse.json({
      success: false,
      fallback: true,
      error: error?.message || 'Error interno al procesar impresión térmica'
    }, { status: 500 });
  }
}
