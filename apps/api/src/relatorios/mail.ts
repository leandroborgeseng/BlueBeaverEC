import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

/**
 * Envia e-mail se SMTP_* estiver configurado.
 * Retorna { enviado: false } com motivo quando stub.
 */
export async function sendMail(opts: {
  to: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<{ enviado: boolean; stub: boolean; detalhe: string }> {
  const to = opts.to.map((e) => e.trim()).filter(Boolean);
  if (to.length === 0) {
    return { enviado: false, stub: true, detalhe: "sem destinatários" };
  }

  if (!smtpConfigured()) {
    return {
      enviado: false,
      stub: true,
      detalhe: "SMTP_HOST não configurado — envio simulado",
    };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "1" || process.env.SMTP_SECURE === "true" || port === 465;
  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
  };

  const transporter = nodemailer.createTransport(options);
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER || "aion@localhost";

  await transporter.sendMail({
    from,
    to: to.join(", "),
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  return { enviado: true, stub: false, detalhe: `enviado via ${process.env.SMTP_HOST}` };
}
