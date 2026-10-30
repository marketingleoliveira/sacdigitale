import express from "express";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { Resend } from "resend";
import {
  randomUUID,
} from "crypto";
import fs from "fs/promises";
import path from "path";

dotenv.config({
  path: "/etc/sac-digitale/backend.env",
  override: true,
});

const PORT =
  Number(
    process.env.RESEND_INBOUND_PORT
    || 8122
  );

const API_KEY =
  String(
    process.env.RESEND_API_KEY
    || ""
  ).trim();

const WEBHOOK_SECRET =
  String(
    process.env.RESEND_WEBHOOK_SECRET
    || ""
  ).trim();

const INBOUND_ADDRESS =
  String(
    process.env.RESEND_INBOUND_ADDRESS
    || "sac@untiofelzo.resend.app"
  ).trim();

const UPLOAD_ROOT =
  "/var/lib/sac-digitale/uploads/sac-attachments";

if (!API_KEY) {
  throw new Error(
    "RESEND_API_KEY ausente"
  );
}

if (!WEBHOOK_SECRET) {
  throw new Error(
    "RESEND_WEBHOOK_SECRET ausente"
  );
}

const resend =
  new Resend(API_KEY);

const pool =
  mysql.createPool({
    host:
      process.env.DB_HOST,

    port:
      Number(
        process.env.DB_PORT
        || 3306
      ),

    user:
      process.env.DB_USER,

    password:
      process.env.DB_PASSWORD,

    database:
      process.env.DB_NAME,

    connectionLimit:
      5,

    charset:
      "utf8mb4",
  });


function extractEmail(value) {

  const text =
    String(value || "");

  const bracket =
    text.match(
      /<([^<>@\s]+@[^<>@\s]+)>/
    );

  if (bracket) {
    return bracket[1]
      .trim()
      .toLowerCase();
  }

  const plain =
    text.match(
      /([^\s<>,]+@[^\s<>,]+)/
    );

  return plain
    ? plain[1]
        .trim()
        .toLowerCase()
    : text
        .trim()
        .toLowerCase();
}


function htmlToText(html) {

  return String(html || "")
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      ""
    )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      ""
    )
    .replace(
      /<br\s*\/?>/gi,
      "\n"
    )
    .replace(
      /<\/(p|div|li|tr|h[1-6])>/gi,
      "\n"
    )
    .replace(
      /<[^>]+>/g,
      ""
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\r/g,
      ""
    );
}


function stripQuotedReply(input) {

  const text =
    String(input || "");

  const markers = [
    /\n\s*Em\s[\s\S]{0,400}?escreveu\s*:?/i,
    /\n\s*On\s[\s\S]{0,400}?wrote\s*:?/i,
    /\n\s*Le\s[\s\S]{0,400}?a écrit\s*:?/i,
    /\n\s*-{2,}\s*Mensagem (original|encaminhada)\s*-{2,}/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*_{5,}\s*(\n|$)/,
    /\n\s*(De|From)\s*:\s*.+\n\s*(Enviad[ao]|Sent|Para|To)\s*:/i,
    /\n\s*Protocolo\s+SAC\d{8}-[A-Z0-9]+/i,
  ];

  let cut =
    text.length;

  for (const regex of markers) {

    const match =
      text.match(regex);

    if (
      match &&
      typeof match.index === "number"
    ) {
      cut =
        Math.min(
          cut,
          match.index
        );
    }
  }

  let result =
    text.slice(
      0,
      cut
    );

  result =
    result.replace(
      /\n(\s*>.*(\n|$))+\s*$/,
      ""
    );

  result =
    result
      .replace(
        /[\s\n]+$/,
        ""
      )
      .trim();

  return (
    result
    || text.trim()
  );
}


function findProtocol(...values) {

  for (const value of values) {

    const match =
      String(value || "")
        .match(
          /SAC\d{8}-[A-Z0-9]+/i
        );

    if (match) {
      return match[0]
        .toUpperCase();
    }
  }

  return null;
}


function safeFilename(name) {

  const cleaned =
    String(name || "arquivo")
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      )
      .slice(
        0,
        180
      );

  return (
    cleaned
    || "arquivo"
  );
}


async function resendApi(apiPath) {

  const response =
    await fetch(
      "https://api.resend.com"
      + apiPath,
      {
        headers: {
          Authorization:
            `Bearer ${API_KEY}`,
        },
      }
    );

  const text =
    await response.text();

  let body = {};

  try {
    body =
      JSON.parse(text);
  } catch {
    body = {
      message: text,
    };
  }

  if (!response.ok) {

    throw new Error(
      `Resend API ${response.status}: `
      +
      (
        body?.message
        || body?.error?.message
        || "erro desconhecido"
      )
    );
  }

  return (
    body?.data
    ?? body
  );
}


async function downloadAttachments(
  emailId,
  sacRequestId
) {

  let list;

  try {

    list =
      await resendApi(
        `/emails/receiving/${encodeURIComponent(emailId)}/attachments`
      );

  } catch (error) {

    console.error(
      "Falha ao listar anexos:",
      error
    );

    return [];
  }

  const attachments =
    Array.isArray(list)
      ? list
      : Array.isArray(list?.data)
        ? list.data
        : [];

  const saved = [];

  for (
    const attachment
    of attachments
  ) {

    const attachmentId =
      attachment?.id;

    const filename =
      safeFilename(
        attachment?.filename
      );

    const contentType =
      attachment?.content_type
      || "application/octet-stream";

    let detail =
      attachment;

    if (attachmentId) {

      try {

        const retrieved =
          await resendApi(
            `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`
          );

        detail = {
          ...attachment,
          ...retrieved,
        };

      } catch (error) {

        console.error(
          "Falha ao obter anexo:",
          attachmentId,
          error
        );
      }
    }

    const folder =
      path.join(
        UPLOAD_ROOT,
        "email-inbound",
        sacRequestId
          || "unlinked",
        emailId
      );

    await fs.mkdir(
      folder,
      {
        recursive:
          true,
      }
    );

    const diskPath =
      path.join(
        folder,
        filename
      );

    let stored =
      false;

    let size =
      Number(
        detail?.size
        || 0
      );

    try {

      if (
        detail?.download_url
      ) {

        const response =
          await fetch(
            detail.download_url
          );

        if (!response.ok) {
          throw new Error(
            `download HTTP ${response.status}`
          );
        }

        const buffer =
          Buffer.from(
            await response.arrayBuffer()
          );

        /*
         * Limite local de segurança:
         * 50 MB por anexo.
         */
        if (
          buffer.length
          > 50 * 1024 * 1024
        ) {
          throw new Error(
            "anexo acima de 50 MB"
          );
        }

        await fs.writeFile(
          diskPath,
          buffer
        );

        size =
          buffer.length;

        stored =
          true;

      } else if (
        typeof detail?.content
        === "string"
      ) {

        const buffer =
          Buffer.from(
            detail.content,
            "base64"
          );

        if (
          buffer.length
          > 50 * 1024 * 1024
        ) {
          throw new Error(
            "anexo acima de 50 MB"
          );
        }

        await fs.writeFile(
          diskPath,
          buffer
        );

        size =
          buffer.length;

        stored =
          true;
      }

    } catch (error) {

      console.error(
        "Falha ao salvar anexo:",
        filename,
        error
      );
    }


    const objectPath =
      [
        "email-inbound",
        sacRequestId
          || "unlinked",
        emailId,
        filename,
      ].join("/");

    saved.push({
      filename,
      content_type:
        contentType,

      size,

      resend_attachment_id:
        attachmentId
        || null,

      object_path:
        stored
          ? objectPath
          : null,

      url:
        stored
          ? `/api/storage/sac-attachments/download?path=${encodeURIComponent(objectPath)}`
          : (
              detail?.download_url
              || ""
            ),
    });
  }

  return saved;
}


const app =
  express();


app.get(
  "/api/webhooks/resend/health",
  async (_req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      return res.json({
        ok:
          true,

        service:
          "resend-inbound",

        database:
          "mysql",

        inbound:
          INBOUND_ADDRESS,

        webhookSecret:
          true,

        supabase:
          false,
      });

    } catch (error) {

      return res
        .status(500)
        .json({
          ok:
            false,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
    }
  }
);


app.post(
  "/api/webhooks/resend/inbound",

  express.raw({
    type:
      "application/json",

    limit:
      "10mb",
  }),

  async (req, res) => {

    let event;
    let emailId = null;
    let svixId = null;

    try {

      svixId =
        String(
          req.headers["svix-id"]
          || ""
        );

      const svixTimestamp =
        String(
          req.headers["svix-timestamp"]
          || ""
        );

      const svixSignature =
        String(
          req.headers["svix-signature"]
          || ""
        );

      if (
        !svixId
        || !svixTimestamp
        || !svixSignature
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "missing_webhook_signature",
          });
      }

      if (
        !Buffer.isBuffer(
          req.body
        )
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "raw_body_required",
          });
      }


      /*
       * Validação oficial da assinatura
       * Resend/Svix usando o corpo bruto.
       */
      event =
        await resend.webhooks.verify({
          payload:
            req.body.toString(
              "utf8"
            ),

          headers: {
            id:
              svixId,

            timestamp:
              svixTimestamp,

            signature:
              svixSignature,
          },

          webhookSecret:
            WEBHOOK_SECRET,
        });


      if (
        event?.type
        !== "email.received"
      ) {

        return res.json({
          ok:
            true,

          ignored:
            true,

          type:
            event?.type
            || null,
        });
      }


      emailId =
        String(
          event?.data?.email_id
          || ""
        );

      if (!emailId) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "email_id_missing",
          });
      }


      /*
       * Idempotência.
       */
      const [
        existingRows,
      ] =
        await pool.execute(
          `
          SELECT
            id,
            status,
            updated_at
          FROM resend_inbound_events
          WHERE
            svix_id = ?
            OR email_id = ?
          LIMIT 1
          `,
          [
            svixId,
            emailId,
          ]
        );

      const existing =
        existingRows?.[0];

      if (
        existing?.status
        === "processed"
      ) {

        return res.json({
          ok:
            true,

          duplicate:
            true,

          email_id:
            emailId,
        });
      }


      if (!existing) {

        await pool.execute(
          `
          INSERT INTO resend_inbound_events
          (
            id,
            svix_id,
            email_id,
            event_type,
            status,
            attempts
          )
          VALUES
          (?, ?, ?, ?, 'processing', 1)
          `,
          [
            randomUUID(),
            svixId,
            emailId,
            event.type,
          ]
        );

      } else {

        await pool.execute(
          `
          UPDATE resend_inbound_events
          SET
            status = 'processing',
            attempts = attempts + 1,
            error_message = NULL
          WHERE id = ?
          `,
          [
            existing.id,
          ]
        );
      }


      /*
       * Busca o conteúdo completo do
       * e-mail recebido.
       */
      const full =
        await resendApi(
          `/emails/receiving/${encodeURIComponent(emailId)}`
        );


      const subject =
        String(
          full?.subject
          ?? event?.data?.subject
          ?? ""
        );


      const fromRaw =
        String(
          full?.from
          ?? event?.data?.from
          ?? ""
        );

      const fromEmail =
        extractEmail(
          fromRaw
        );


      const toRaw =
        full?.to
        ?? event?.data?.to
        ?? [
          INBOUND_ADDRESS,
        ];

      const toEmail =
        Array.isArray(toRaw)
          ? toRaw.join(", ")
          : String(toRaw);


      const html =
        String(
          full?.html
          ?? ""
        );

      const plain =
        String(
          full?.text
          ?? ""
        );


      const readable =
        plain.trim()
          ? plain
          : htmlToText(
              html
            );


      const cleanBody =
        stripQuotedReply(
          readable
        )
          .slice(
            0,
            20000
          )
          .trim();


      const protocol =
        findProtocol(
          subject,
          plain,
          html,
          readable
        );


      let sacRequestId =
        null;


      if (protocol) {

        const [
          sacs,
        ] =
          await pool.execute(
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

        sacRequestId =
          sacs?.[0]?.id
          || null;
      }


      /*
       * Evita duplicação também na
       * tabela de comunicações.
       */
      const messageId =
        String(
          full?.message_id
          ?? event?.data?.message_id
          ?? emailId
        )
          .replace(
            /^<|>$/g,
            ""
          )
          .trim();


      const [
        communicationRows,
      ] =
        await pool.execute(
          `
          SELECT id
          FROM email_communications
          WHERE resend_id = ?
          LIMIT 1
          `,
          [
            emailId,
          ]
        );


      if (
        communicationRows.length
        > 0
      ) {

        await pool.execute(
          `
          UPDATE resend_inbound_events
          SET
            status = 'processed',
            sac_request_id = ?,
            protocol = ?
          WHERE email_id = ?
          `,
          [
            sacRequestId,
            protocol,
            emailId,
          ]
        );

        return res.json({
          ok:
            true,

          duplicate:
            true,

          communication:
            true,

          linked:
            Boolean(
              sacRequestId
            ),

          protocol,
        });
      }


      const attachments =
        await downloadAttachments(
          emailId,
          sacRequestId
        );


      const rawPayload = {
        source:
          "resend-inbound",

        email_id:
          emailId,

        svix_id:
          svixId,

        message_id:
          messageId,

        event_created_at:
          event?.created_at
          || null,

        email_created_at:
          event?.data?.created_at
          || full?.created_at
          || null,

        from:
          fromRaw,

        to:
          toRaw,

        cc:
          event?.data?.cc
          || full?.cc
          || [],

        bcc:
          event?.data?.bcc
          || full?.bcc
          || [],

        protocol,
      };


      await pool.execute(
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
          email_body,
          attachments,
          created_at
        )
        VALUES
        (
          ?, ?, 'inbound',
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, NOW(6)
        )
        `,
        [
          randomUUID(),

          sacRequestId,

          fromEmail
            || "desconhecido",

          toEmail
            || INBOUND_ADDRESS,

          subject
            || null,

          cleanBody
            || "(sem conteúdo)",

          sacRequestId
            ? "received"
            : "unlinked",

          emailId,

          JSON.stringify(
            rawPayload
          ),

          html
            || plain
            || cleanBody
            || null,

          attachments.length
            ? JSON.stringify(
                attachments
              )
            : null,
        ]
      );


      await pool.execute(
        `
        UPDATE resend_inbound_events
        SET
          status = 'processed',
          sac_request_id = ?,
          protocol = ?,
          error_message = NULL
        WHERE email_id = ?
        `,
        [
          sacRequestId,
          protocol,
          emailId,
        ]
      );


      console.log(
        JSON.stringify({
          event:
            "email.received",

          email_id:
            emailId,

          protocol,

          linked:
            Boolean(
              sacRequestId
            ),

          attachments:
            attachments.length,
        })
      );


      return res.json({
        ok:
          true,

        processed:
          true,

        linked:
          Boolean(
            sacRequestId
          ),

        protocol,

        attachments:
          attachments.length,
      });


    } catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : String(error);


      console.error(
        "RESEND_INBOUND_ERROR",
        message
      );


      if (emailId) {

        try {

          await pool.execute(
            `
            UPDATE resend_inbound_events
            SET
              status = 'failed',
              error_message = ?
            WHERE email_id = ?
            `,
            [
              message.slice(
                0,
                4000
              ),
              emailId,
            ]
          );

        } catch {}
      }


      /*
       * Assinatura inválida:
       * não solicitar retry.
       */
      if (
        /signature|webhook/i
          .test(message)
      ) {

        return res
          .status(400)
          .json({
            ok:
              false,

            error:
              "invalid_signature",
          });
      }


      /*
       * Erro operacional:
       * 500 permite retry do Resend.
       */
      return res
        .status(500)
        .json({
          ok:
            false,

          error:
            "processing_failed",
        });
    }
  }
);


app.use(
  (_req, res) => {

    res
      .status(404)
      .json({
        ok:
          false,

        error:
          "not_found",
      });
  }
);


app.listen(
  PORT,
  "127.0.0.1",
  () => {

    console.log(
      `SAC Resend Inbound ativo em 127.0.0.1:${PORT}`
    );
  }
);
