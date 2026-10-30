import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

import {
  config
} from "./src/config.js";


const sourceFile =
  process.argv[2];


if (!sourceFile) {

  console.error(
    "Arquivo data.sql não informado."
  );

  process.exit(1);
}


const pool =
  mysql.createPool({

    ...config.database,

    charset:
      "utf8mb4",

    connectionLimit:
      2,

    multipleStatements:
      true,
  });


function pgUnescape(
  value
) {

  if (
    value === "\\N"
  ) {

    return null;
  }


  let result = "";


  for (
    let i = 0;
    i < value.length;
    i++
  ) {

    if (
      value[i] !== "\\"
    ) {

      result +=
        value[i];

      continue;
    }


    i++;


    if (
      i >=
      value.length
    ) {

      result += "\\";

      break;
    }


    const char =
      value[i];


    if (char === "n") {

      result += "\n";

    } else if (
      char === "r"
    ) {

      result += "\r";

    } else if (
      char === "t"
    ) {

      result += "\t";

    } else if (
      char === "b"
    ) {

      result += "\b";

    } else if (
      char === "f"
    ) {

      result += "\f";

    } else if (
      char === "v"
    ) {

      result += "\v";

    } else if (
      char === "\\"
    ) {

      result += "\\";

    } else if (
      /[0-7]/.test(char)
    ) {

      let oct =
        char;


      for (
        let x = 0;
        x < 2;
        x++
      ) {

        if (
          i + 1 < value.length
          &&
          /[0-7]/.test(
            value[i + 1]
          )
        ) {

          oct +=
            value[++i];

        } else {

          break;
        }
      }


      result +=
        String.fromCharCode(
          parseInt(
            oct,
            8
          )
        );

    } else {

      result +=
        char;
    }
  }


  return result;
}


function pgArrayToArray(
  value
) {

  if (
    value === null
    ||
    value === ""
  ) {

    return null;
  }


  if (
    !value.startsWith("{")
    ||
    !value.endsWith("}")
  ) {

    return [
      value
    ];
  }


  const body =
    value.slice(
      1,
      -1
    );


  if (!body) {
    return [];
  }


  const result = [];

  let current = "";
  let quoted = false;
  let escaped = false;


  for (
    let i = 0;
    i < body.length;
    i++
  ) {

    const char =
      body[i];


    if (escaped) {

      current += char;
      escaped = false;

      continue;
    }


    if (
      char === "\\"
    ) {

      escaped = true;

      continue;
    }


    if (
      char === '"'
    ) {

      quoted =
        !quoted;

      continue;
    }


    if (
      char === ","
      &&
      !quoted
    ) {

      result.push(
        current === "NULL"
          ?
          null
          :
          current
      );

      current = "";

      continue;
    }


    current += char;
  }


  result.push(
    current === "NULL"
      ?
      null
      :
      current
  );


  return result;
}


function booleanValue(
  value
) {

  if (
    value === null
  ) {
    return null;
  }


  return (
    value === true
    ||
    value === 1
    ||
    value === "1"
    ||
    value === "t"
    ||
    value === "true"
  )
    ?
    1
    :
    0;
}


function mysqlDate(
  value
) {

  if (!value) {
    return null;
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    /*
     * PostgreSQL pode produzir
     * data sem timezone. MySQL
     * geralmente aceita diretamente.
     */
    return value
      .replace(
        "T",
        " "
      )
      .replace(
        /Z$/,
        ""
      );
  }


  const p =
    number =>
      String(number)
        .padStart(
          2,
          "0"
        );


  return (
    date.getUTCFullYear()
    +
    "-"
    +
    p(
      date.getUTCMonth()
      +
      1
    )
    +
    "-"
    +
    p(
      date.getUTCDate()
    )
    +
    " "
    +
    p(
      date.getUTCHours()
    )
    +
    ":"
    +
    p(
      date.getUTCMinutes()
    )
    +
    ":"
    +
    p(
      date.getUTCSeconds()
    )
  );
}


function jsonValue(
  value,
  fallback = null
) {

  if (
    value === null
  ) {

    return fallback;
  }


  if (
    typeof value
    !==
    "string"
  ) {

    return JSON.stringify(
      value
    );
  }


  try {

    return JSON.stringify(
      JSON.parse(value)
    );

  } catch {

    return JSON.stringify(
      value
    );
  }
}


function rowObject(
  columns,
  values
) {

  const row = {};


  columns.forEach(
    (
      column,
      index
    ) => {

      row[column] =
        pgUnescape(
          values[index]
          ??
          "\\N"
        );
    }
  );


  return row;
}


function normalizeTable(
  raw
) {

  return raw
    .replace(
      /^"/,
      ""
    )
    .replace(
      /"$/,
      ""
    )
    .replaceAll(
      '"."',
      "."
    )
    .replaceAll(
      '"',
      ""
    );
}


const wanted =
  new Set([
    "public.complaint_types",
    "public.email_communications",
    "public.email_settings",
    "public.internal_ticket_logs",
    "public.sac_edit_logs",
    "public.sac_requests",
    "public.sac_updates",
    "public.tickets",
    "public.user_roles",
    "auth.users",
    "storage.objects",

    /*
     * alguns dumps omitem public.
     */
    "complaint_types",
    "email_communications",
    "email_settings",
    "internal_ticket_logs",
    "sac_edit_logs",
    "sac_requests",
    "sac_updates",
    "tickets",
    "user_roles",
  ]);


const imported = {};


async function insert(
  connection,
  table,
  object
) {

  const entries =
    Object.entries(
      object
    )
    .filter(
      ([
        ,
        value
      ]) =>
        value !== undefined
    );


  if (!entries.length) {
    return;
  }


  const columns =
    entries.map(
      ([
        column
      ]) =>
        `\`${column}\``
    );


  const values =
    entries.map(
      ([
        ,
        value
      ]) =>
        value
    );


  const placeholders =
    entries.map(
      () =>
        "?"
    );


  const updates =
    entries.map(
      ([
        column
      ]) =>
        `\`${column}\`=VALUES(\`${column}\`)`
    );


  await connection.execute(
    `
      INSERT INTO \`${table}\`
      (${columns.join(",")})
      VALUES
      (${placeholders.join(",")})
      ON DUPLICATE KEY UPDATE
      ${updates.join(",")}
    `,
    values
  );
}


async function importRow(
  connection,
  sourceTable,
  row
) {

  const table =
    sourceTable.replace(
      /^public\./,
      ""
    );


  switch (
    sourceTable
  ) {

    case "auth.users":
    {

      const email =
        row.email
        ||
        `${row.id}@migrated.local`;


      let active = 1;


      if (
        row.deleted_at
      ) {

        active = 0;
      }


      if (
        row.banned_until
      ) {

        const bannedUntil =
          new Date(
            row.banned_until
          );

        if (
          !Number.isNaN(
            bannedUntil.getTime()
          )
          &&
          bannedUntil.getTime()
          >
          Date.now()
        ) {

          active = 0;
        }
      }


      await insert(
        connection,
        "app_users",
        {
          id:
            row.id,

          email,

          password_hash:
            row.encrypted_password
            ||
            null,

          email_confirmed_at:
            mysqlDate(
              row.email_confirmed_at
            ),

          last_sign_in_at:
            mysqlDate(
              row.last_sign_in_at
            ),

          is_active:
            active,

          created_at:
            mysqlDate(
              row.created_at
            ),

          updated_at:
            mysqlDate(
              row.updated_at
            )
            ||
            mysqlDate(
              row.created_at
            ),
        }
      );


      break;
    }


    case "storage.objects":
    {

      let metadata = {};


      try {

        metadata =
          row.metadata
            ?
            JSON.parse(
              row.metadata
            )
            :
            {};

      } catch {}


      const objectPath =
        row.name;


      if (!objectPath) {
        break;
      }


      await insert(
        connection,
        "storage_objects",
        {
          id:
            row.id,

          bucket:
            row.bucket_id,

          object_path:
            objectPath,

          original_name:
            path.basename(
              objectPath
            ),

          mime_type:
            metadata.mimetype
            ||
            metadata.contentType
            ||
            null,

          size_bytes:
            Number(
              metadata.size
              ||
              metadata.contentLength
              ||
              0
            )
            ||
            null,

          uploaded_by:
            row.owner
            ||
            row.owner_id
            ||
            null,

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );


      break;
    }


    case "public.sac_requests":
    case "sac_requests":
    {

      await insert(
        connection,
        "sac_requests",
        {
          id:
            row.id,

          contact_type:
            row.contact_type,

          complaint_type:
            row.complaint_type,

          name:
            row.name,

          email:
            row.email,

          phone:
            row.phone,

          order_number:
            row.order_number,

          subject:
            row.subject,

          message:
            row.message,

          attachments:
            row.attachments
              ?
              JSON.stringify(
                pgArrayToArray(
                  row.attachments
                )
              )
              :
              null,

          laudos:
            row.laudos
              ?
              JSON.stringify(
                pgArrayToArray(
                  row.laudos
                )
              )
              :
              null,

          procedencia:
            row.procedencia,

          protocol:
            row.protocol,

          status:
            row.status
            ||
            "pendente",

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }


    case "public.complaint_types":
    case "complaint_types":
    {

      await insert(
        connection,
        "complaint_types",
        {
          id:
            row.id,

          name:
            row.name,

          active:
            booleanValue(
              row.active
            ),

          created_at:
            mysqlDate(
              row.created_at
            ),

          updated_at:
            mysqlDate(
              row.updated_at
            ),
        }
      );

      break;
    }


    case "public.user_roles":
    case "user_roles":
    {

      await insert(
        connection,
        "user_roles",
        {
          id:
            row.id,

          user_id:
            row.user_id,

          role:
            row.role,

          display_name:
            row.display_name,

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }


    case "public.tickets":
    case "tickets":
    {

      await insert(
        connection,
        "tickets",
        {
          id:
            row.id,

          sac_request_id:
            row.sac_request_id,

          created_by:
            row.created_by,

          assigned_to:
            row.assigned_to,

          author_email:
            row.author_email,

          author_name:
            row.author_name,

          message:
            row.message,

          is_internal:
            booleanValue(
              row.is_internal
            ),

          created_at:
            mysqlDate(
              row.created_at
            ),

          updated_at:
            mysqlDate(
              row.updated_at
            ),
        }
      );

      break;
    }


    case "public.email_communications":
    case "email_communications":
    {

      await insert(
        connection,
        "email_communications",
        {
          id:
            row.id,

          sac_request_id:
            row.sac_request_id,

          direction:
            row.direction,

          from_email:
            row.from_email,

          to_email:
            row.to_email,

          bcc_email:
            row.bcc_email,

          subject:
            row.subject,

          body:
            row.body,

          email_body:
            row.email_body,

          resend_id:
            row.resend_id,

          sent_by:
            row.sent_by,

          sent_by_email:
            row.sent_by_email,

          status:
            row.status
            ||
            "sent",

          error_message:
            row.error_message,

          raw_payload:
            row.raw_payload
              ?
              jsonValue(
                row.raw_payload
              )
              :
              null,

          attachments:
            row.attachments
              ?
              jsonValue(
                row.attachments,
                "[]"
              )
              :
              null,

          read_at:
            mysqlDate(
              row.read_at
            ),

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }


    case "public.email_settings":
    case "email_settings":
    {

      await insert(
        connection,
        "email_settings",
        {
          id:
            row.id,

          bcc_enabled:
            booleanValue(
              row.bcc_enabled
            ),

          bcc_email:
            row.bcc_email,

          emails_enabled:
            booleanValue(
              row.emails_enabled
            ),

          self_copy_enabled:
            booleanValue(
              row.self_copy_enabled
            ),

          internal_notifications_enabled:
            booleanValue(
              row.internal_notifications_enabled
            ),

          internal_notification_emails:
            row.internal_notification_emails,

          updated_by:
            row.updated_by,

          created_at:
            mysqlDate(
              row.created_at
            ),

          updated_at:
            mysqlDate(
              row.updated_at
            ),
        }
      );

      break;
    }


    case "public.internal_ticket_logs":
    case "internal_ticket_logs":
    {

      await insert(
        connection,
        "internal_ticket_logs",
        {
          id:
            row.id,

          ticket_id:
            row.ticket_id,

          status:
            row.status,

          error_message:
            row.error_message,

          recipient_email:
            row.recipient_email,

          email_body:
            row.email_body,

          subject:
            row.subject,

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }


    case "public.sac_edit_logs":
    case "sac_edit_logs":
    {

      await insert(
        connection,
        "sac_edit_logs",
        {
          id:
            row.id,

          sac_request_id:
            row.sac_request_id,

          edited_by:
            row.edited_by,

          edited_by_email:
            row.edited_by_email,

          field_edited:
            row.field_edited,

          old_value:
            row.old_value,

          new_value:
            row.new_value,

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }


    case "public.sac_updates":
    case "sac_updates":
    {

      await insert(
        connection,
        "sac_updates",
        {
          id:
            row.id,

          sac_request_id:
            row.sac_request_id,

          message:
            row.message,

          created_by:
            row.created_by,

          author_email:
            row.author_email,

          created_at:
            mysqlDate(
              row.created_at
            ),
        }
      );

      break;
    }
  }


  imported[table] =
    (
      imported[table]
      ||
      0
    )
    +
    1;
}


const connection =
  await pool.getConnection();


try {

  await connection.query(
    "SET FOREIGN_KEY_CHECKS=0"
  );


  await connection.beginTransaction();


  /*
   * Banco foi recém-preparado.
   * Limpamos somente as tabelas
   * de dados para substituir os
   * registros iniciais pelos reais.
   */
  const clearTables = [
    "internal_ticket_logs",
    "sac_updates",
    "sac_edit_logs",
    "email_communications",
    "tickets",
    "user_roles",
    "auth_sessions",
    "password_reset_tokens",
    "storage_objects",
    "sac_requests",
    "complaint_types",
    "email_settings",
    "app_users",
  ];


  for (
    const table
    of clearTables
  ) {

    await connection.query(
      `DELETE FROM \`${table}\``
    );
  }


  const input =
    fs.readFileSync(
      sourceFile,
      "utf8"
    );


  const lines =
    input.split(
      /\r?\n/
    );


  let currentTable = null;
  let columns = [];


  for (
    const line
    of lines
  ) {

    if (!currentTable) {

      const match =
        line.match(
          /^COPY\s+(.+?)\s+\((.+)\)\s+FROM stdin;$/
        );


      if (!match) {
        continue;
      }


      const table =
        normalizeTable(
          match[1]
        );


      if (
        !wanted.has(
          table
        )
      ) {

        currentTable =
          "__IGNORE__";

        columns = [];

        continue;
      }


      currentTable =
        table;


      columns =
        match[2]
          .split(",")
          .map(
            column =>
              column
                .trim()
                .replaceAll(
                  '"',
                  ""
                )
          );


      console.log(
        `IMPORTANDO=${table}`
      );


      continue;
    }


    if (
      line === "\\."
    ) {

      currentTable =
        null;

      columns = [];

      continue;
    }


    if (
      currentTable
      ===
      "__IGNORE__"
    ) {

      continue;
    }


    const values =
      line.split(
        "\t"
      );


    const row =
      rowObject(
        columns,
        values
      );


    await importRow(
      connection,
      currentTable,
      row
    );
  }


  /*
   * Se o backup não tiver auth.users
   * mas possuir user_roles,
   * garantimos os UUIDs para preservar
   * as relações.
   */
  const [
    orphanRoles
  ] =
    await connection.query(`
      SELECT DISTINCT
        ur.user_id
      FROM user_roles ur
      LEFT JOIN app_users u
        ON u.id = ur.user_id
      WHERE u.id IS NULL
    `);


  for (
    const item
    of orphanRoles
  ) {

    await insert(
      connection,
      "app_users",
      {
        id:
          item.user_id,

        email:
          `${item.user_id}@migrated.local`,

        password_hash:
          null,

        is_active:
          1,

        created_at:
          mysqlDate(
            new Date()
              .toISOString()
          ),

        updated_at:
          mysqlDate(
            new Date()
              .toISOString()
          ),
      }
    );
  }


  await connection.commit();


  console.log(
    ""
  );

  console.log(
    "IMPORTACAO=COMMIT_OK"
  );


  for (
    const [
      table,
      count
    ]
    of Object.entries(
      imported
    )
  ) {

    console.log(
      `${table.toUpperCase()}_SOURCE_ROWS=${count}`
    );
  }


} catch (error) {

  await connection.rollback();


  console.error(
    "IMPORTACAO=ROLLBACK"
  );

  console.error(
    error
  );


  process.exitCode = 1;


} finally {

  try {

    await connection.query(
      "SET FOREIGN_KEY_CHECKS=1"
    );

  } catch {}


  connection.release();

  await pool.end();
}
