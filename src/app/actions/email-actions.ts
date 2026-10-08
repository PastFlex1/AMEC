'use server';

import nodemailer from 'nodemailer';

export interface EmailData {
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
 * Servidor de transporte reutilizable o inicializado bajo demanda para Gmail SMTP.
 */
function createGmailTransporter() {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || 'apm.inox.cotocollao@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS || 'wjcnubfvhqgwffhe';

  if (!user || !pass) {
    throw new Error(
      'Configuración de Gmail SMTP incompleta. Asegúrate de configurar GMAIL_USER y GMAIL_APP_PASSWORD en las variables de entorno (.env).'
    );
  }

  // Limpiar espacios en caso de que el usuario haya copiado la contraseña con espacios (ej. "abcd efgh ijkl mnop")
  const cleanPass = pass.replace(/\s+/g, '');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user.trim(),
      pass: cleanPass,
    },
  });
}

/**
 * Acción de servidor para enviar correos electrónicos con comprobantes adjuntos (PDF + XML) mediante Gmail SMTP.
 */
export async function sendBillingEmail(data: EmailData) {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || 'apm.inox.cotocollao@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS || 'wjcnubfvhqgwffhe';

  if (!user || !pass) {
    console.error('[Email Action] Variables GMAIL_USER o GMAIL_APP_PASSWORD no detectadas.');
    return {
      success: false,
      error: 'Configuración de correo incompleta. Falta configurar GMAIL_USER o GMAIL_APP_PASSWORD en .env.',
    };
  }

  try {
    const { to, subject, clientName, docType, total, docNumber, pdfBase64, xmlContent, observations } = data;

    if (!to || !to.includes('@')) {
      return { success: false, error: 'La dirección de correo del destinatario es inválida.' };
    }

    const transporter = createGmailTransporter();

    const fromName = process.env.SMTP_FROM_NAME || 'Facturación Apm Inox';
    const fromAddress = process.env.SMTP_FROM_EMAIL || user.trim();

    const attachments: Array<{
      filename: string;
      content: Buffer | string;
      contentType?: string;
    }> = [];

    // Adjuntar PDF
    if (pdfBase64) {
      const cleanBase64 = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;
      attachments.push({
        filename: `${docType.replace(/\s/g, '_')}_${docNumber}.pdf`,
        content: Buffer.from(cleanBase64, 'base64'),
        contentType: 'application/pdf',
      });
    }

    // Si recibimos el XML, lo adjuntamos también
    if (xmlContent) {
      attachments.push({
        filename: `${docType.replace(/\s/g, '_')}_${docNumber}.xml`,
        content: xmlContent,
        contentType: 'application/xml',
      });
    }

    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to: to.trim(),
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
            
            ${
              observations
                ? `
              <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Observaciones:</p>
                <p style="margin: 5px 0 0 0; color: #334155; font-style: italic;">${observations}</p>
              </div>
            `
                : ''
            }
          </div>

          <p style="font-size: 14px; color: #64748b;">Este es un envío automático. Por favor no responda a este correo.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
          <p style="font-size: 10px; color: #94a3b8; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
            Potenciado por Palma Nexus Solutions
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Gmail SMTP] Correo enviado exitosamente:', info.messageId);

    return { success: true, id: info.messageId };
  } catch (err: any) {
    console.error('[Gmail SMTP Error]', err);

    let errorMessage = err.message || 'Error interno al procesar el envío del correo.';

    if (err.code === 'EAUTH' || err.responseCode === 535) {
      errorMessage =
        'Error de autenticación con Gmail. Verifica tu cuenta y asegúrate de usar una Contraseña de Aplicación (App Password) de 16 caracteres de Google.';
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Verifica si las credenciales de Gmail SMTP son válidas y si la conexión es exitosa.
 */
export async function verifyEmailConnection() {
  try {
    const transporter = createGmailTransporter();
    await transporter.verify();
    return { success: true, message: 'Conexión con Gmail SMTP establecida correctamente.' };
  } catch (err: any) {
    let errorMessage = err.message || 'Error al conectar con Gmail SMTP.';
    if (err.code === 'EAUTH' || err.responseCode === 535) {
      errorMessage =
        'Error de autenticación con Gmail. Verifica tu correo y contraseña de aplicación (App Password) de 16 caracteres.';
    }
    return { success: false, error: errorMessage };
  }
}
