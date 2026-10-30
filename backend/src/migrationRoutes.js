import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

dotenv.config({
  path: "/etc/sac-digitale/backend.env",
  override: true,
});

const FROM_ADDRESS =
  "qualidade@digitaletextil.com.br";

const FROM_FORMATTED =
  `SAC Digitale <${FROM_ADDRESS}>`;

function env(name) {
  return String(
    process.env[name] || ""
  ).trim();
}

function bool(value, fallback = false) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return (
    Number(value) === 1 ||
    value === true ||
    String(value).toLowerCase() === "true"
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailMode() {
  if (env("RESEND_API_KEY")) {
    return "resend";
  }

  if (
    env("SMTP_HOST") &&
    env("SMTP_USER") &&
    env("SMTP_PASSWORD")
  ) {
    return "smtp";
  }

  return null;
}

function imapConfigured() {
  return Boolean(
    env("IMAP_HOST") &&
    env("IMAP_USER") &&
    env("IMAP_PASSWORD")
  );
}

function uniqueEmails(values) {
  return [
    ...new Set(
      values
        .map(v => String(v || "").trim())
        .filter(v => v.includes("@"))
    ),
  ];
}

async function sendMail({
  to,
  bcc = [],
  subject,
  html,
  text = "",
  attachments = [],
}) {
  const mode = emailMode();

  if (!mode) {
    throw new Error(
      "Nenhum provedor de envio configurado"
    );
  }

  const recipients =
    Array.isArray(to) ? to : [to];

  if (mode === "resend") {
    const payload = {
      from: FROM_FORMATTED,
      to: recipients,
      subject,
      html,
      reply_to: process.env.RESEND_INBOUND_ADDRESS || "sac@untiofelzo.resend.app",
    };

    if (bcc.length) {
      payload.bcc = bcc;
    }

    if (attachments.length) {
      payload.attachments =
        attachments.map(file => ({
          filename: file.filename,
          content: file.buffer.toString("base64"),
        }));
    }

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${env("RESEND_API_KEY")}`,

            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify(payload),
        }
      );

    const result =
      await response.json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.message ||
        result?.error?.message ||
        `Resend HTTP ${response.status}`
      );
    }

    return {
      provider: "resend",
      id: result.id || null,
    };
  }

  const port =
    Number(
      env("SMTP_PORT") || 587
    );

  const transporter =
    nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port,
      secure:
        String(
          env("SMTP_SECURE")
        ).toLowerCase() === "true"
        ||
        port === 465,

      auth: {
        user: env("SMTP_USER"),
        pass: env("SMTP_PASSWORD"),
      },
    });

  const result =
    await transporter.sendMail({
      from: FROM_FORMATTED,
      to: recipients,
      bcc,
      subject,
      text,
      html,
      replyTo: process.env.RESEND_INBOUND_ADDRESS || "sac@untiofelzo.resend.app",
      attachments:
        attachments.map(file => ({
          filename: file.filename,
          content: file.buffer,
          contentType:
            file.content_type || undefined,
        })),
    });

  return {
    provider: "smtp",
    id: result.messageId || null,
  };
}

async function settings(db) {
  const [rows] =
    await db.query(`
      SELECT *
      FROM email_settings
      ORDER BY created_at ASC
      LIMIT 1
    `);

  return rows[0] || {};
}

function objectPathFromUrl(value) {
  const source =
    String(value || "");

  const oldMarker =
    "/storage/v1/object/public/sac-attachments/";

  if (source.includes(oldMarker)) {
    return decodeURIComponent(
      source.split(oldMarker)[1]
    );
  }

  try {
    const url =
      new URL(source);

    if (
      url.pathname.includes(
        "/api/storage/sac-attachments/download"
      )
    ) {
      return url.searchParams.get("path");
    }
  } catch {}

  if (
    source.startsWith("attachments/") ||
    source.startsWith("email-attachments/")
  ) {
    return source;
  }

  return null;
}

function safeFile(
  uploadRoot,
  bucket,
  objectPath
) {
  const root =
    path.resolve(
      uploadRoot,
      bucket
    );

  const filename =
    path.resolve(
      root,
      objectPath
    );

  if (
    filename === root ||
    !filename.startsWith(root + path.sep)
  ) {
    throw new Error(
      "Caminho de arquivo inválido"
    );
  }

  return filename;
}

async function loadAttachments(
  items,
  uploadRoot
) {
  const result = [];

  for (const item of items || []) {
    try {
      const filename =
        item.filename ||
        "anexo";

      const objectPath =
        objectPathFromUrl(
          item.url
        );

      if (objectPath) {
        const localFile =
          safeFile(
            uploadRoot,
            "sac-attachments",
            objectPath
          );

        if (
          fs.existsSync(localFile)
        ) {
          result.push({
            filename,
            buffer:
              fs.readFileSync(localFile),

            content_type:
              item.content_type ||
              null,

            original:
              item,
          });

          continue;
        }
      }

      if (item.url) {
        const response =
          await fetch(item.url);

        if (response.ok) {
          result.push({
            filename,
            buffer:
              Buffer.from(
                await response.arrayBuffer()
              ),

            content_type:
              item.content_type ||
              response.headers.get(
                "content-type"
              ),

            original:
              item,
          });
        }
      }
    } catch (error) {
      console.error(
        "Falha ao carregar anexo:",
        error.message
      );
    }
  }

  return result;
}

function extractProtocol(...values) {
  for (const value of values) {
    const match =
      String(value || "")
        .match(
          /SAC\d{8}-[A-Z0-9]+/i
        );

    if (match) {
      return match[0].toUpperCase();
    }
  }

  return null;
}

function stripQuotedReply(value) {
  let text =
    String(value || "");

  const markers = [
    /\n\s*Em\s[\s\S]{0,400}?escreveu\s*:?/i,
    /\n\s*On\s[\s\S]{0,400}?wrote\s*:?/i,
    /\n\s*-{2,}\s*Mensagem original\s*-{2,}/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*Protocolo\s+SAC\d{8}-[A-Z0-9]+/i,
  ];

  let cut =
    text.length;

  for (const marker of markers) {
    const found =
      text.match(marker);

    if (
      found &&
      found.index !== undefined
    ) {
      cut =
        Math.min(
          cut,
          found.index
        );
    }
  }

  text =
    text.slice(0, cut)
      .trim();

  return text;
}

function requestBase(req) {
  const forwarded =
    req.headers[
      "x-forwarded-proto"
    ];

  const protocol =
    forwarded ||
    req.protocol ||
    "http";

  return `${protocol}://${req.get("host")}`;
}

function normalizeAttachment(
  req,
  uploadRoot,
  value
) {
  const objectPath =
    objectPathFromUrl(value);

  if (!objectPath) {
    return {
      path:
        value,

      url:
        value,
    };
  }

  const filename =
    safeFile(
      uploadRoot,
      "sac-attachments",
      objectPath
    );

  return {
    path:
      objectPath,

    url:
      fs.existsSync(filename)
        ?
        `${requestBase(req)}/api/storage/sac-attachments/download?path=${encodeURIComponent(objectPath)}`
        :
        null,
  };
}

export function registerMigrationRoutes(
  app,
  {
    db,
    authenticate,
    uploadRoot,
  }
) {
  let imapBusy =
    false;

  async function submitSac(
    req,
    res
  ) {
    const body =
      req.body || {};

    const required = [
      "contactType",
      "name",
      "email",
      "phone",
      "orderNumber",
      "subject",
      "message",
    ];

    for (const field of required) {
      if (
        !String(
          body[field] || ""
        ).trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              "Campos obrigatórios não preenchidos",
          });
      }
    }

    const id =
      crypto.randomUUID();

    const now =
      new Date();

    const date =
      [
        now.getFullYear(),
        String(
          now.getMonth() + 1
        ).padStart(2, "0"),
        String(
          now.getDate()
        ).padStart(2, "0"),
      ].join("");

    const protocol =
      `SAC${date}-${crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;

    await db.execute(
      `
        INSERT INTO sac_requests
        (
          id,
          contact_type,
          complaint_type,
          name,
          email,
          phone,
          order_number,
          subject,
          message,
          attachments,
          protocol,
          status
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
      `,
      [
        id,
        body.contactType,
        body.contactType === "reclamacao"
          ? body.complaintType || null
          : null,
        body.name,
        body.email,
        body.phone,
        body.orderNumber,
        body.subject,
        body.message,
        Array.isArray(body.attachments)
          ? JSON.stringify(body.attachments)
          : null,
        protocol,
      ]
    );

    if (emailMode()) {
      try {
        const subject =
          `[${protocol}] Recebemos sua solicitação — em análise`;

        const text =
          `Olá ${body.name},

Recebemos sua solicitação e ela está sendo analisada pela nossa equipe de qualidade.

Protocolo: ${protocol}
Assunto: ${body.subject}`;

        const html =
          `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
            <p>Olá <strong>${escapeHtml(body.name)}</strong>,</p>
            <p>Recebemos sua solicitação e ela <strong>está sendo analisada</strong> pela nossa equipe de qualidade.</p>
            <p><strong>Protocolo:</strong> ${escapeHtml(protocol)}<br>
            <strong>Assunto:</strong> ${escapeHtml(body.subject)}</p>
            <hr>
            <small>Digitale Têxtil — SAC Qualidade</small>
          </div>`;

        const sent =
          await sendMail({
            to:
              body.email,

            subject,
            text,
            html,
          });

        await db.execute(
          `
            INSERT INTO email_communications
            (
              id,
              sac_request_id,
              direction,
              from_email,
              to_email,
              subject,
              body,
              resend_id,
              sent_by_email,
              status,
              raw_payload,
              email_body
            )
            VALUES
            (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
          `,
          [
            crypto.randomUUID(),
            id,
            FROM_ADDRESS,
            body.email,
            subject,
            text,
            sent.id,
            "sistema@digitaletextil.com.br",
            JSON.stringify({
              type:
                "sac.confirmation",

              provider:
                sent.provider,
            }),
            html,
          ]
        );
      } catch (error) {
        console.error(
          "Confirmação SAC:",
          error.message
        );
      }
    }

    return res.json({
      success:
        true,

      protocol,

      message:
        "Solicitação enviada com sucesso",
    });
  }

  app.post(
    "/api/functions/v1/submit-sac",
    submitSac
  );

  app.post(
    "/api/functions/v1/send-customer-email",
    authenticate,
    async (
      req,
      res
    ) => {
      if (
        req.userRole?.role === "vendas"
      ) {
        return res
          .status(403)
          .json({
            error:
              "Sem permissão para comunicação externa",
          });
      }

      const {
        sac_request_id,
        to,
        subject,
        body,
        attachments = [],
      } = req.body || {};

      if (
        !sac_request_id ||
        !to ||
        !subject ||
        !body
      ) {
        return res
          .status(400)
          .json({
            error:
              "Campos obrigatórios ausentes",
          });
      }

      const config =
        await settings(db);

      if (
        !bool(
          config.emails_enabled,
          true
        )
      ) {
        return res
          .status(503)
          .json({
            error:
              "Envio de e-mails desativado",
          });
      }

      if (!emailMode()) {
        return res
          .status(503)
          .json({
            error:
              "Provedor de e-mail não configurado na VPS",
          });
      }

      const [sacs] =
        await db.query(
          `
            SELECT protocol
            FROM sac_requests
            WHERE id = ?
            LIMIT 1
          `,
          [
            sac_request_id,
          ]
        );

      if (!sacs[0]) {
        return res
          .status(404)
          .json({
            error:
              "SAC não encontrado",
          });
      }

      const protocol =
        sacs[0].protocol;

      const finalSubject =
        String(subject).includes(
          `[${protocol}]`
        )
          ? subject
          : `[${protocol}] ${subject}`;

      const bcc = [];

      if (
        bool(
          config.bcc_enabled,
          true
        )
        &&
        config.bcc_email
      ) {
        bcc.push(
          config.bcc_email
        );
      }

      if (
        bool(
          config.self_copy_enabled,
          true
        )
      ) {
        bcc.push(
          FROM_ADDRESS
        );
      }

      const files =
        await loadAttachments(
          attachments,
          uploadRoot
        );

      const html =
        `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(body)}</div>
         <br><hr>
         <small>Protocolo ${escapeHtml(protocol)} — Digitale Têxtil</small>`;

      try {
        const sent =
          await sendMail({
            to,
            bcc:
              uniqueEmails(bcc),

            subject:
              finalSubject,

            text:
              body,

            html,

            attachments:
              files,
          });

        await db.execute(
          `
            INSERT INTO email_communications
            (
              id,
              sac_request_id,
              direction,
              from_email,
              to_email,
              bcc_email,
              subject,
              body,
              resend_id,
              sent_by,
              sent_by_email,
              status,
              attachments,
              raw_payload,
              email_body
            )
            VALUES
            (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
          `,
          [
            crypto.randomUUID(),
            sac_request_id,
            FROM_ADDRESS,
            to,
            uniqueEmails(bcc).join(", ") || null,
            finalSubject,
            body,
            sent.id,
            req.user.id,
            req.user.email,
            JSON.stringify(
              files.map(file => ({
                filename:
                  file.filename,

                ...(file.original || {}),
              }))
            ),
            JSON.stringify({
              provider:
                sent.provider,
            }),
            html,
          ]
        );

        return res.json({
          success:
            true,

          id:
            sent.id,

          provider:
            sent.provider,
        });
      } catch (error) {
        await db.execute(
          `
            INSERT INTO email_communications
            (
              id,
              sac_request_id,
              direction,
              from_email,
              to_email,
              subject,
              body,
              sent_by,
              sent_by_email,
              status,
              error_message
            )
            VALUES
            (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, 'failed', ?)
          `,
          [
            crypto.randomUUID(),
            sac_request_id,
            FROM_ADDRESS,
            to,
            finalSubject,
            body,
            req.user.id,
            req.user.email,
            error.message,
          ]
        );

        return res
          .status(502)
          .json({
            error:
              "Falha no envio",

            details:
              error.message,
          });
      }
    }
  );

  app.post(
    "/api/functions/v1/notify-internal-ticket",
    authenticate,
    async (
      req,
      res
    ) => {
      const ticket =
        req.body?.ticket;

      if (!ticket) {
        return res
          .status(400)
          .json({
            error:
              "Ticket ausente",
          });
      }

      const config =
        await settings(db);

      if (
        !bool(
          config.internal_notifications_enabled,
          false
        )
      ) {
        return res.json({
          success:
            true,

          message:
            "Notificações desativadas",
        });
      }

      const recipients =
        uniqueEmails(
          String(
            config.internal_notification_emails ||
            ""
          ).split(",")
        );

      if (!recipients.length) {
        return res.json({
          success:
            true,

          message:
            "Sem destinatários configurados",
        });
      }

      const [sacs] =
        await db.query(
          `
            SELECT
              protocol,
              name,
              complaint_type
            FROM sac_requests
            WHERE id = ?
            LIMIT 1
          `,
          [
            ticket.sac_request_id,
          ]
        );

      const sac =
        sacs[0] || {};

      const subject =
        `[NOTIFICAÇÃO INTERNA] SAC ${sac.protocol || "N/A"} - ${sac.name || "Não informada"}`;

      const html =
        `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
          <h2>Nova Anotação Interna</h2>
          <p><strong>Empresa:</strong> ${escapeHtml(sac.name || "")}</p>
          <p><strong>Protocolo:</strong> ${escapeHtml(sac.protocol || "")}</p>
          <p><strong>Tipo:</strong> ${escapeHtml(sac.complaint_type || "Geral")}</p>
          <hr>
          <p><strong>Autor:</strong> ${escapeHtml(ticket.author_name || ticket.author_email || "Sistema")}</p>
          <div style="white-space:pre-wrap">${escapeHtml(ticket.message)}</div>
        </div>`;

      try {
        await sendMail({
          to:
            recipients,

          subject,
          html,

          text:
            ticket.message || "",
        });

        for (const recipient of recipients) {
          await db.execute(
            `
              INSERT INTO internal_ticket_logs
              (
                id,
                ticket_id,
                status,
                recipient_email,
                subject,
                email_body
              )
              VALUES (?, ?, 'success', ?, ?, ?)
            `,
            [
              crypto.randomUUID(),
              ticket.id || null,
              recipient,
              subject,
              html,
            ]
          );
        }

        return res.json({
          success:
            true,
        });
      } catch (error) {
        return res
          .status(502)
          .json({
            error:
              error.message,
          });
      }
    }
  );

  app.post(
    "/api/functions/v1/notify-sac-edit",
    authenticate,
    async (
      req,
      res
    ) => {
      if (!emailMode()) {
        return res.json({
          success:
            true,

          notification:
            "email-not-configured",
        });
      }

      const config =
        await settings(db);

      const recipients =
        uniqueEmails(
          String(
            config.internal_notification_emails ||
            "gerente@digitaletextil.com.br"
          ).split(",")
        );

      if (!recipients.length) {
        return res.json({
          success:
            true,
        });
      }

      const edit =
        req.body?.edit_data || {};

      const sac =
        req.body?.sac_request || {};

      const subject =
        `[EDIÇÃO SAC] SAC ${sac.protocol || "N/A"} - Alteração em ${edit.field_name || "dados"}`;

      const html =
        `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
          <h2>Edição Recente no SAC</h2>
          <p><strong>Empresa:</strong> ${escapeHtml(sac.name || "")}</p>
          <p><strong>Protocolo:</strong> ${escapeHtml(sac.protocol || "")}</p>
          <p><strong>Editado por:</strong> ${escapeHtml(edit.editor_email || req.user.email)}</p>
          <hr>
          <p><strong>Campo:</strong> ${escapeHtml(edit.field_name || "")}</p>
          <p><strong>Valor anterior:</strong> ${escapeHtml(edit.old_value || "")}</p>
          <p><strong>Novo valor:</strong> ${escapeHtml(edit.new_value || "")}</p>
        </div>`;

      try {
        await sendMail({
          to:
            recipients,

          subject,
          html,
        });

        return res.json({
          success:
            true,
        });
      } catch (error) {
        return res
          .status(502)
          .json({
            error:
              error.message,
          });
      }
    }
  );

  async function pollImap() {
    if (!imapConfigured()) {
      return {
        success:
          false,

        configured:
          false,
      };
    }

    if (imapBusy) {
      return {
        success:
          true,

        skipped:
          "already-running",
      };
    }

    imapBusy =
      true;

    const client =
      new ImapFlow({
        host:
          env("IMAP_HOST"),

        port:
          Number(
            env("IMAP_PORT") || 993
          ),

        secure:
          String(
            env("IMAP_SECURE") || "true"
          ).toLowerCase() !== "false",

        auth: {
          user:
            env("IMAP_USER"),

          pass:
            env("IMAP_PASSWORD"),
        },

        logger:
          false,
      });

    let processed = 0;
    let linked = 0;
    let unlinked = 0;
    let skipped = 0;
    let failed = 0;

    try {
      await client.connect();

      const lock =
        await client.getMailboxLock(
          "INBOX"
        );

      try {
        const uids =
          await client.search(
            {
              seen:
                false,
            },
            {
              uid:
                true,
            }
          );

        const batch =
          uids.slice(0, 35);

        for await (
          const message
          of client.fetch(
            batch,
            {
              uid:
                true,

              envelope:
                true,

              source:
                true,
            },
            {
              uid:
                true,
            }
          )
        ) {
          processed++;

          try {
            const parsed =
              await simpleParser(
                message.source
              );

            const subject =
              parsed.subject || "";

            const from =
              parsed.from?.value?.[0]?.address ||
              "";

            const to =
              parsed.to?.value?.[0]?.address ||
              env("IMAP_USER");

            const messageId =
              String(
                parsed.messageId || ""
              )
              .replace(/[<>]/g, "")
              .trim()
              ||
              null;

            if (messageId) {
              const [existing] =
                await db.query(
                  `
                    SELECT id
                    FROM email_communications
                    WHERE resend_id = ?
                    LIMIT 1
                  `,
                  [
                    messageId,
                  ]
                );

              if (existing.length) {
                await client.messageFlagsAdd(
                  message.uid,
                  ["\\Seen"],
                  {
                    uid:
                      true,
                  }
                );

                skipped++;
                continue;
              }
            }

            const readable =
              parsed.text ||
              (
                typeof parsed.html === "string"
                  ? parsed.html.replace(/<[^>]+>/g, " ")
                  : ""
              );

            const text =
              stripQuotedReply(
                readable
              )
              .slice(0, 20000)
              ||
              "(sem conteúdo)";

            const protocol =
              extractProtocol(
                subject,
                readable
              );

            let sacId =
              null;

            if (protocol) {
              const [sacs] =
                await db.query(
                  `
                    SELECT id
                    FROM sac_requests
                    WHERE protocol = ?
                    LIMIT 1
                  `,
                  [
                    protocol,
                  ]
                );

              sacId =
                sacs[0]?.id ||
                null;
            }

            const fromLower =
              from.toLowerCase();

            const toLower =
              to.toLowerCase();

            const isInternal =
              fromLower.endsWith(
                "@digitaletextil.com.br"
              )
              &&
              toLower.endsWith(
                "@digitaletextil.com.br"
              );

            const ownSender =
              [
                "qualidade@digitaletextil.com.br",
                "gerente@digitaletextil.com.br",
              ]
              .some(address =>
                fromLower.includes(
                  address
                )
              );

            if (
              isInternal &&
              !protocol
            ) {
              await client.messageFlagsAdd(
                message.uid,
                ["\\Seen"],
                {
                  uid:
                    true,
                }
              );

              skipped++;
              continue;
            }

            const direction =
              ownSender
                ? "outbound"
                : "inbound";

            await db.execute(
              `
                INSERT INTO email_communications
                (
                  id,
                  sac_request_id,
                  direction,
                  from_email,
                  to_email,
                  subject,
                  body,
                  status,
                  resend_id,
                  raw_payload,
                  email_body
                )
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                crypto.randomUUID(),
                sacId,
                direction,
                from ||
                  "desconhecido",
                to,
                subject,
                text,
                sacId
                  ? (
                      direction === "outbound"
                        ? "sent"
                        : "received"
                    )
                  : "unlinked",
                messageId,
                JSON.stringify({
                  source:
                    "imap-local",

                  uid:
                    message.uid,

                  date:
                    parsed.date ||
                    null,
                }),
                typeof parsed.html === "string"
                  ? parsed.html
                  : text,
              ]
            );

            await client.messageFlagsAdd(
              message.uid,
              ["\\Seen"],
              {
                uid:
                  true,
              }
            );

            if (sacId) {
              linked++;
            } else {
              unlinked++;
            }
          } catch (error) {
            failed++;

            console.error(
              "IMAP mensagem:",
              error.message
            );
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();

      return {
        success:
          true,

        processed,
        linked,
        unlinked,
        skipped,
        failed,
      };
    } catch (error) {
      try {
        await client.logout();
      } catch {}

      throw error;
    } finally {
      imapBusy =
        false;
    }
  }

  app.post(
    "/api/functions/v1/imap-poll-inbox",
    authenticate,
    async (
      _req,
      res
    ) => {
      try {
        const result =
          await pollImap();

        if (
          !result.configured &&
          result.configured === false
        ) {
          return res
            .status(503)
            .json({
              error:
                "IMAP não configurado na VPS",
            });
        }

        return res.json(
          result
        );
      } catch (error) {
        return res
          .status(502)
          .json({
            error:
              "Falha IMAP",

            details:
              error.message,
          });
      }
    }
  );

  app.get(
    "/api/functions/v1/list-sacs-portal",
    async (
      req,
      res
    ) => {
      const token =
        String(
          req.headers[
            "x-portal-token"
          ] || ""
        ).trim();

      if (
        !env("VENDAS_PORTAL_TOKEN") ||
        token !==
          env("VENDAS_PORTAL_TOKEN")
      ) {
        return res
          .status(401)
          .json({
            error:
              "unauthorized",
          });
      }

      const id =
        String(
          req.query.id || ""
        ).trim();

      if (id) {
        const [rows] =
          await db.query(
            `
              SELECT *
              FROM sac_requests
              WHERE id = ?
              LIMIT 1
            `,
            [
              id,
            ]
          );

        const sac =
          rows[0];

        if (!sac) {
          return res
            .status(404)
            .json({
              error:
                "not_found",
            });
        }

        let attachments = [];
        let laudos = [];

        try {
          attachments =
            JSON.parse(
              sac.attachments || "[]"
            );
        } catch {}

        try {
          laudos =
            JSON.parse(
              sac.laudos || "[]"
            );
        } catch {}

        const [tickets] =
          await db.query(
            `
              SELECT
                id,
                message,
                author_name,
                author_email,
                is_internal,
                created_at
              FROM tickets
              WHERE sac_request_id = ?
                AND is_internal = 1
              ORDER BY created_at ASC
            `,
            [
              id,
            ]
          );

        return res.json({
          sac: {
            ...sac,

            attachments:
              attachments.map(value =>
                normalizeAttachment(
                  req,
                  uploadRoot,
                  value
                )
              ),

            laudos:
              laudos.map(objectPath => {
                const filename =
                  safeFile(
                    uploadRoot,
                    "laudos",
                    objectPath
                  );

                return {
                  path:
                    objectPath,

                  url:
                    fs.existsSync(filename)
                      ?
                      `${requestBase(req)}/api/storage/laudos/download?path=${encodeURIComponent(objectPath)}`
                      :
                      null,
                };
              }),
          },

          tickets,
        });
      }

      const limit =
        Math.min(
          Math.max(
            Number(
              req.query.limit || 100
            ),
            1
          ),
          500
        );

      const status =
        String(
          req.query.status || ""
        ).trim();

      let sql =
        `
          SELECT
            id,
            protocol,
            name,
            email,
            status,
            contact_type,
            complaint_type,
            subject,
            created_at
          FROM sac_requests
        `;

      const params = [];

      if (status) {
        sql +=
          " WHERE status = ?";

        params.push(status);
      }

      sql +=
        " ORDER BY created_at DESC LIMIT ?";

      params.push(limit);

      const [items] =
        await db.query(
          sql,
          params
        );

      return res.json({
        items,
      });
    }
  );

  app.get(
    "/api/migration/status",
    (
      _req,
      res
    ) => {
      res.json({
        ok:
          true,

        database:
          "mysql",

        supabase:
          false,

        email: {
          configured:
            Boolean(emailMode()),

          mode:
            emailMode(),
        },

        imap: {
          configured:
            imapConfigured(),

          automatic:
            imapConfigured(),

          intervalMinutes:
            Number(
              env("IMAP_POLL_MINUTES") || 5
            ),
        },

        portal: {
          configured:
            Boolean(
              env(
                "VENDAS_PORTAL_TOKEN"
              )
            ),
        },
      });
    }
  );

  if (imapConfigured()) {
    const minutes =
      Math.max(
        Number(
          env("IMAP_POLL_MINUTES") || 5
        ),
        1
      );

    setTimeout(
      () => {
        pollImap()
          .catch(error => {
            console.error(
              "IMAP inicial:",
              error.message
            );
          });
      },
      15000
    );

    setInterval(
      () => {
        pollImap()
          .catch(error => {
            console.error(
              "IMAP automático:",
              error.message
            );
          });
      },
      minutes * 60 * 1000
    );
  }
}
