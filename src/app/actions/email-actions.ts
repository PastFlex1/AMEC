'use server';

import { Resend } from 'resend';

interface EmailData {
  to: string;
  subject: string;
  clientName: string;
  docType: string;
  total: number;
  docNumber: string;
  pdfBase64: string;
  xmlContent?: string;
  observations?: string;
}

/**
 * Acción de servidor para enviar correos electrónicos con comprobantes adjuntos (PDF + XML).
 */
export async function sendBillingEmail(data: EmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.error('[Email Action] RESEND_API_KEY no detectada.');
    return { 
      success: false, 
      error: 'Configuración del servidor incompleta (API Key).' 
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { to, subject, clientName, docType, total, docNumber, pdfBase64, xmlContent, observations } = data;

    if (!to || !to.includes('@')) {
      return { success: false, error: 'La dirección de correo es inválida.' };
    }

    const fromEmail = 'facturacion@amec.space'; 
    const fromName = 'Facturación Apm Inox';

    const attachments: any[] = [
      {
        filename: `${docType.replace(/\s/g, '_')}_${docNumber}.pdf`,
        content: pdfBase64,
      }
    ];

    // Si recibimos el XML, lo adjuntamos también
    if (xmlContent) {
      attachments.push({
        filename: `${docType.replace(/\s/g, '_')}_${docNumber}.xml`,
        content: xmlContent,
      });
    }

    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: subject,
      attachments,
      html: `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #2988a3;">${docType} Electrónica</h2>
          <p>Estimado(a) <strong>${clientName}</strong>,</p>
          <p>Se ha generado un nuevo documento electrónico a su nombre. Adjunto encontrará los archivos correspondientes.</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 5px 0;"><strong>Tipo:</strong> ${docType}</p>
            <p style="margin: 5px 0;"><strong>Número:</strong> ${docNumber}</p>
            <p style="margin: 5px 0;"><strong>Monto Total:</strong> $${total.toFixed(2)}</p>
            
            ${observations ? `
              <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Observaciones:</p>
                <p style="margin: 5px 0 0 0; color: #334155; font-style: italic;">${observations}</p>
              </div>
            ` : ''}
          </div>

          <p style="font-size: 14px; color: #64748b;">Este es un envío automático. Por favor no responda a este correo.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
          <p style="font-size: 10px; color: #94a3b8; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
            Potenciado por Palma Nexus Solutions
          </p>
        </div>
      `,
    });

    if (result.error) {
      console.error('[Resend Error]', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };

  } catch (err: any) {
    console.error('[Critical Email Error]', err);
    return { success: false, error: 'Error interno al procesar el envío del correo.' };
  }
}
