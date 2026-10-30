import { registerResumableUpload } from "./resumableUpload.js";
import { registerMigrationRoutes } from "./migrationRoutes.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

import {
  config
} from "./config.js";

import {
  db
} from "./database.js";


const app =
  express();


const STAFF_ROLES =
  [
    "admin",
    "desenvolvedor",
    "qualidade",
    "gerencia",
    "vendas",
  ];


const SUPER_ROLES =
  [
    "admin",
    "desenvolvedor",
  ];


const MANAGER_ROLES =
  [
    "admin",
    "desenvolvedor",
    "gerencia",
  ];


const TABLES =
  new Set([
    "user_roles",
    "complaint_types",
    "problem_origins",
    "sac_requests",
    "tickets",
    "email_communications",
    "email_settings",
    "internal_ticket_logs",
    "sac_edit_logs",
    "sac_updates",
    "storage_objects",
  ]);


const JSON_COLUMNS =
  new Set([
    "sac_requests.attachments",
    "sac_requests.laudos",
    "email_communications.raw_payload",
    "email_communications.attachments",
  ]);


const ID_TABLES =
  new Set([
    "user_roles",
    "complaint_types",
    "problem_origins",
    "sac_requests",
    "tickets",
    "email_communications",
    "email_settings",
    "internal_ticket_logs",
    "sac_edit_logs",
    "sac_updates",
    "storage_objects",
  ]);


const uploadRoot =
  path.resolve(
    config.uploadsPath
  );


const tempRoot =
  path.join(
    os.tmpdir(),
    "sac-digitale-upload-tmp"
  );


fs.mkdirSync(
  uploadRoot,
  {
    recursive:
      true,
  }
);


fs.mkdirSync(
  tempRoot,
  {
    recursive:
      true,
  }
);


app.disable(
  "x-powered-by"
);


app.use(
  helmet({
    crossOriginResourcePolicy:
      false,
  })
);


app.use(
  cors({
    origin:
      true,

    credentials:
      true,
  })
);


app.use(
  express.json({
    limit:
      "30mb",
  })
);


app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "30mb",
  })
);


function jsonError(
  res,
  status,
  message
) {

  return res
    .status(status)
    .json({
      error:
        message,
    });
}


function validIdentifier(
  value
) {

  return (
    typeof value
    ===
    "string"
    &&
    /^[a-z_][a-z0-9_]*$/i.test(
      value
    )
  );
}


async function getUserRole(
  userId
) {

  const [
    rows
  ] =
    await db.query(
      `
        SELECT
          role,
          display_name
        FROM user_roles
        WHERE user_id = ?
          AND role IN (
            'admin',
            'desenvolvedor',
            'qualidade',
            'gerencia',
            'vendas'
          )
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [
        userId,
      ]
    );


  return rows[0]
    ||
    null;
}


function makeSession(
  user,
  role
) {

  const expiresIn =
    8 * 60 * 60;


  const token =
    jwt.sign(
      {
        sub:
          user.id,

        email:
          user.email,

        role:
          role?.role
          ||
          null,
      },

      config.jwtSecret,

      {
        expiresIn,
      }
    );


  return {
    access_token:
      token,

    token_type:
      "bearer",

    expires_in:
      expiresIn,

    expires_at:
      Math.floor(
        Date.now() / 1000
      )
      +
      expiresIn,

    user: {
      id:
        user.id,

      email:
        user.email,

      aud:
        "authenticated",

      role:
        "authenticated",

      created_at:
        user.created_at,

      updated_at:
        user.updated_at,

      user_metadata:
        {},

      app_metadata: {
        provider:
          "email",
      },
    },
  };
}


async function authenticate(
  req,
  res,
  next
) {

  const header =
    String(
      req.headers.authorization
      ||
      ""
    );


  if (
    !header.startsWith(
      "Bearer "
    )
  ) {

    return jsonError(
      res,
      401,
      "Não autorizado"
    );
  }


  const token =
    header.slice(7)
      .trim();


  try {

    const payload =
      jwt.verify(
        token,
        config.jwtSecret
      );


    const [
      users
    ] =
      await db.query(
        `
          SELECT
            id,
            email,
            is_active,
            created_at,
            updated_at
          FROM app_users
          WHERE id = ?
          LIMIT 1
        `,
        [
          payload.sub,
        ]
      );


    const user =
      users[0];


    if (
      !user
      ||
      !user.is_active
    ) {

      return jsonError(
        res,
        401,
        "Usuário inválido"
      );
    }


    const role =
      await getUserRole(
        user.id
      );


    if (
      !role
      ||
      !STAFF_ROLES.includes(
        role.role
      )
    ) {

      return jsonError(
        res,
        403,
        "Usuário sem permissão"
      );
    }


    req.user =
      user;

    req.userRole =
      role;


    next();


  } catch {

    return jsonError(
      res,
      401,
      "Sessão expirada"
    );
  }
}


async function optionalAuthenticate(
  req,
  _res,
  next
) {

  const header =
    String(
      req.headers.authorization
      ||
      ""
    );


  if (
    !header.startsWith(
      "Bearer "
    )
  ) {

    return next();
  }


  try {

    const payload =
      jwt.verify(
        header.slice(7).trim(),
        config.jwtSecret
      );


    const [
      users
    ] =
      await db.query(
        `
          SELECT
            id,
            email,
            is_active,
            created_at,
            updated_at
          FROM app_users
          WHERE id = ?
          LIMIT 1
        `,
        [
          payload.sub,
        ]
      );


    if (
      users[0]
      &&
      users[0].is_active
    ) {

      req.user =
        users[0];

      req.userRole =
        await getUserRole(
          users[0].id
        );
    }


  } catch {}


  next();
}


function ensureManager(
  req,
  res,
  next
) {

  if (
    !req.userRole
    ||
    !MANAGER_ROLES.includes(
      req.userRole.role
    )
  ) {

    return jsonError(
      res,
      403,
      "Apenas Desenvolvedor ou Gerência"
    );
  }


  next();
}


function parseJson(
  value
) {

  if (
    value === null
    ||
    value === undefined
  ) {

    return value;
  }


  if (
    typeof value
    !==
    "string"
  ) {

    return value;
  }


  try {

    return JSON.parse(
      value
    );

  } catch {

    return value;
  }
}


function localAttachmentUrl(
  value
) {

  if (
    typeof value
    !==
    "string"
  ) {

    return value;
  }


  const marker =
    "/storage/v1/object/public/sac-attachments/";


  const index =
    value.indexOf(
      marker
    );


  if (
    index >= 0
  ) {

    const objectPath =
      decodeURIComponent(
        value.slice(
          index
          +
          marker.length
        )
      );


    return (
      "/api/storage/sac-attachments/download?path="
      +
      encodeURIComponent(
        objectPath
      )
    );
  }


  return value;
}


function normalizeRow(
  table,
  row
) {

  if (!row) {
    return row;
  }


  const output =
    {
      ...row,
    };


  if (
    table
    ===
    "sac_requests"
  ) {

    output.attachments =
      parseJson(
        output.attachments
      );


    output.laudos =
      parseJson(
        output.laudos
      );


    if (
      Array.isArray(
        output.attachments
      )
    ) {

      output.attachments =
        output.attachments.map(
          localAttachmentUrl
        );
    }
  }


  if (
    table
    ===
    "email_communications"
  ) {

    output.raw_payload =
      parseJson(
        output.raw_payload
      );


    output.attachments =
      parseJson(
        output.attachments
      );
  }


  return output;
}


function normalizeWriteValue(
  table,
  column,
  value
) {

  if (
    JSON_COLUMNS.has(
      `${table}.${column}`
    )
  ) {

    if (
      value === null
      ||
      value === undefined
    ) {

      return null;
    }


    return JSON.stringify(
      value
    );
  }


  if (
    typeof value
    ===
    "boolean"
  ) {

    return value
      ?
      1
      :
      0;
  }


  return value;
}


function splitSelect(
  select
) {

  if (
    !select
    ||
    select === "*"
  ) {

    return {
      sql:
        "*",

      relations:
        [],
    };
  }


  const pieces = [];

  let current =
    "";

  let depth =
    0;


  for (
    const char
    of select
  ) {

    if (
      char === "("
    ) {
      depth++;
    }


    if (
      char === ")"
    ) {
      depth--;
    }


    if (
      char === ","
      &&
      depth === 0
    ) {

      pieces.push(
        current.trim()
      );

      current =
        "";

      continue;
    }


    current +=
      char;
  }


  if (
    current.trim()
  ) {

    pieces.push(
      current.trim()
    );
  }


  const relations =
    pieces.filter(
      part =>
        part.includes("(")
    );


  if (
    pieces.includes("*")
  ) {

    return {
      sql:
        "*",

      relations,
    };
  }


  const columns =
    pieces
      .filter(
        part =>
          !part.includes("(")
      )
      .filter(
        validIdentifier
      );


  return {
    sql:
      columns.length
        ?
        columns.map(
          column =>
            `\`${column}\``
        ).join(",")
        :
        "*",

    relations,
  };
}


function buildWhere(
  filters = []
) {

  const clauses = [];

  const params = [];


  for (
    const filter
    of filters
  ) {

    const column =
      filter.column;


    if (
      !validIdentifier(
        column
      )
    ) {

      throw new Error(
        "Filtro inválido"
      );
    }


    const escaped =
      `\`${column}\``;


    switch (
      filter.op
    ) {

      case "eq":

        if (
          filter.value
          ===
          null
        ) {

          clauses.push(
            `${escaped} IS NULL`
          );

        } else {

          clauses.push(
            `${escaped} = ?`
          );

          params.push(
            filter.value
          );
        }

        break;


      case "neq":

        clauses.push(
          `${escaped} <> ?`
        );

        params.push(
          filter.value
        );

        break;


      case "is":

        if (
          filter.value
          ===
          null
        ) {

          clauses.push(
            `${escaped} IS NULL`
          );

        } else {

          clauses.push(
            `${escaped} IS ?`
          );

          params.push(
            filter.value
          );
        }

        break;


      case "not":

        if (
          filter.operator
          ===
          "is"
          &&
          filter.value
          ===
          null
        ) {

          clauses.push(
            `${escaped} IS NOT NULL`
          );

        } else {

          clauses.push(
            `${escaped} <> ?`
          );

          params.push(
            filter.value
          );
        }

        break;


      case "in":

      {

        const values =
          Array.isArray(
            filter.value
          )
            ?
            filter.value
            :
            [];


        if (
          !values.length
        ) {

          clauses.push(
            "1=0"
          );

          break;
        }


        clauses.push(
          `${escaped} IN (${values.map(() => "?").join(",")})`
        );


        params.push(
          ...values
        );

        break;
      }


      case "gte":

        clauses.push(
          `${escaped} >= ?`
        );

        params.push(
          filter.value
        );

        break;


      case "lte":

        clauses.push(
          `${escaped} <= ?`
        );

        params.push(
          filter.value
        );

        break;


      case "gt":

        clauses.push(
          `${escaped} > ?`
        );

        params.push(
          filter.value
        );

        break;


      case "lt":

        clauses.push(
          `${escaped} < ?`
        );

        params.push(
          filter.value
        );

        break;


      case "like":

        clauses.push(
          `${escaped} LIKE ?`
        );

        params.push(
          filter.value
        );

        break;


      case "ilike":

        clauses.push(
          `LOWER(${escaped}) LIKE LOWER(?)`
        );

        params.push(
          filter.value
        );

        break;


      default:

        throw new Error(
          `Operador inválido: ${filter.op}`
        );
    }
  }


  return {
    sql:
      clauses.length
        ?
        ` WHERE ${clauses.join(" AND ")}`
        :
        "",

    params,
  };
}


async function hydrateRelations(
  table,
  rows,
  relations
) {

  if (
    table
    ===
    "sac_edit_logs"
    &&
    relations.some(
      relation =>
        relation.includes(
          "sac_requests"
        )
    )
  ) {

    const ids =
      [
        ...new Set(
          rows
            .map(
              row =>
                row.sac_request_id
            )
            .filter(
              Boolean
            )
        ),
      ];


    if (
      ids.length
    ) {

      const [
        sacs
      ] =
        await db.query(
          `
            SELECT
              id,
              protocol,
              name
            FROM sac_requests
            WHERE id IN (
              ${ids.map(() => "?").join(",")}
            )
          `,
          ids
        );


      const map =
        new Map(
          sacs.map(
            sac =>
              [
                sac.id,
                sac,
              ]
          )
        );


      for (
        const row
        of rows
      ) {

        row.sac_requests =
          map.get(
            row.sac_request_id
          )
          ||
          null;
      }
    }
  }


  return rows;
}


async function assertWritePermission(
  req,
  table,
  operation,
  values
) {

  const role =
    req.userRole?.role;


  if (
    !role
  ) {

    throw Object.assign(
      new Error(
        "Não autorizado"
      ),
      {
        status:
          401,
      }
    );
  }


  if (
    table
    ===
    "user_roles"
    &&
    !MANAGER_ROLES.includes(
      role
    )
  ) {

    throw Object.assign(
      new Error(
        "Sem permissão para usuários"
      ),
      {
        status:
          403,
      }
    );
  }


  if (
    operation
    ===
    "delete"
    &&
    (
      table === "sac_requests"
      ||
      table === "tickets"
    )
    &&
    !SUPER_ROLES.includes(
      role
    )
  ) {

    throw Object.assign(
      new Error(
        "Apenas Desenvolvedor pode excluir"
      ),
      {
        status:
          403,
      }
    );
  }


  if (
    role === "vendas"
  ) {

    if (
      table === "tickets"
      &&
      operation === "insert"
    ) {
      return;
    }


    if (
      table === "sac_requests"
      &&
      operation === "update"
    ) {

      const objects =
        Array.isArray(values)
          ?
          values
          :
          [
            values,
          ];


      const allowed =
        new Set([
          "order_number",
          "complaint_type",
        ]);


      for (
        const object
        of objects
      ) {

        for (
          const key
          of Object.keys(
            object
            ||
            {}
          )
        ) {

          if (
            !allowed.has(
              key
            )
          ) {

            throw Object.assign(
              new Error(
                "Vendas não pode alterar este campo"
              ),
              {
                status:
                  403,
              }
            );
          }
        }
      }


      return;
    }


    throw Object.assign(
      new Error(
        "Operação não permitida para Vendas"
      ),
      {
        status:
          403,
      }
    );
  }
}


async function auditSacUpdate(
  req,
  before,
  values
) {

  if (
    !before?.length
    ||
    !values
  ) {
    return;
  }


  for (
    const oldRow
    of before
  ) {

    for (
      const [
        field,
        newValue
      ]
      of Object.entries(
        values
      )
    ) {

      const oldValue =
        oldRow[field];


      if (
        String(
          oldValue
          ??
          ""
        )
        ===
        String(
          newValue
          ??
          ""
        )
      ) {

        continue;
      }


      await db.execute(
        `
          INSERT INTO sac_edit_logs
          (
            id,
            sac_request_id,
            edited_by,
            edited_by_email,
            field_edited,
            old_value,
            new_value
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          crypto.randomUUID(),
          oldRow.id,
          req.user.id,
          req.user.email,
          field,
          oldValue === null
            ?
            null
            :
            String(oldValue),
          newValue === null
            ?
            null
            :
            String(newValue),
        ]
      );
    }
  }
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/",
  (
    _req,
    res
  ) => {

    res.json({
      ok:
        true,

      application:
        "SAC Digitale",

      backend:
        "Node.js + MySQL",

      supabase:
        false,
    });
  }
);


app.get(
  "/health",
  async (
    _req,
    res
  ) => {

    try {

      const [
        rows
      ] =
        await db.query(
          "SELECT DATABASE() database_name, NOW() server_time"
        );


      res.json({
        ok:
          true,

        application:
          "SAC Digitale",

        database:
          rows[0].database_name,

        serverTime:
          rows[0].server_time,

        supabase:
          false,
      });


    } catch {

      res
        .status(500)
        .json({
          ok:
            false,
        });
    }
  }
);


app.get(
  "/health/schema",
  async (
    _req,
    res
  ) => {

    const expected =
      [
        "app_users",
        "user_roles",
        "complaint_types",
        "problem_origins",
        "sac_requests",
        "tickets",
        "email_communications",
        "email_settings",
        "internal_ticket_logs",
        "sac_edit_logs",
        "sac_updates",
        "storage_objects",
      ];


    const [
      rows
    ] =
      await db.query(
        `
          SELECT TABLE_NAME
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
        `
      );


    const found =
      new Set(
        rows.map(
          row =>
            row.TABLE_NAME
        )
      );


    const missing =
      expected.filter(
        table =>
          !found.has(
            table
          )
      );


    res
      .status(
        missing.length
          ?
          500
          :
          200
      )
      .json({
        ok:
          missing.length === 0,

        expected:
          expected.length,

        found:
          expected.length
          -
          missing.length,

        missing,
      });
  }
);


/* =========================================================
   AUTH LOCAL
   ========================================================= */

app.post(
  "/api/auth/signin",
  async (
    req,
    res
  ) => {

    const email =
      String(
        req.body?.email
        ||
        ""
      )
      .trim()
      .toLowerCase();


    const password =
      String(
        req.body?.password
        ||
        ""
      );


    if (
      !email
      ||
      !password
    ) {

      return jsonError(
        res,
        400,
        "E-mail e senha são obrigatórios"
      );
    }


    const [
      users
    ] =
      await db.query(
        `
          SELECT *
          FROM app_users
          WHERE LOWER(email) = ?
          LIMIT 1
        `,
        [
          email,
        ]
      );


    const user =
      users[0];


    if (
      !user
      ||
      !user.is_active
      ||
      !user.password_hash
    ) {

      return jsonError(
        res,
        400,
        "E-mail ou senha inválidos"
      );
    }


    const valid =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (
      !valid
    ) {

      return jsonError(
        res,
        400,
        "E-mail ou senha inválidos"
      );
    }


    const role =
      await getUserRole(
        user.id
      );


    if (
      !role
    ) {

      return jsonError(
        res,
        403,
        "Usuário sem cargo de acesso"
      );
    }


    await db.execute(
      `
        UPDATE app_users
        SET last_sign_in_at = NOW()
        WHERE id = ?
      `,
      [
        user.id,
      ]
    );


    return res.json({
      session:
        makeSession(
          user,
          role
        ),
    });
  }
);


app.post(
  "/api/auth/refresh",
  authenticate,
  async (
    req,
    res
  ) => {

    return res.json({
      session:
        makeSession(
          req.user,
          req.userRole
        ),
    });
  }
);


app.get(
  "/api/auth/session",
  authenticate,
  async (
    req,
    res
  ) => {

    return res.json({
      session:
        makeSession(
          req.user,
          req.userRole
        ),
    });
  }
);


app.post(
  "/api/auth/signout",
  (
    _req,
    res
  ) => {

    return res.json({
      success:
        true,
    });
  }
);


app.post(
  "/api/auth/signup",
  (
    _req,
    res
  ) => {

    return jsonError(
      res,
      403,
      "Cadastro público desativado"
    );
  }
);


/* =========================================================
   DB COMPATÍVEL COM FRONTEND ATUAL
   ========================================================= */

app.post(
  "/api/db/:table/query",
  optionalAuthenticate,
  async (
    req,
    res
  ) => {

    const table =
      req.params.table;


    if (
      !TABLES.has(
        table
      )
    ) {

      return jsonError(
        res,
        400,
        "Tabela inválida"
      );
    }


    const operation =
      req.body?.operation
      ||
      "select";


    if (
      operation === "select"
    ) {

      if (
        !req.user
        &&
        table !== "complaint_types" && table !== "problem_origins"
      ) {

        return jsonError(
          res,
          401,
          "Não autorizado"
        );
      }


    } else {

      if (
        !req.user
      ) {

        return jsonError(
          res,
          401,
          "Não autorizado"
        );
      }


      try {

        await assertWritePermission(
          req,
          table,
          operation,
          req.body?.values
        );

      } catch (
        error
      ) {

        return jsonError(
          res,
          error.status
          ||
          403,
          error.message
        );
      }
    }


    try {

      const filters =
        Array.isArray(
          req.body?.filters
        )
          ?
          req.body.filters
          :
          [];


      const where =
        buildWhere(
          filters
        );


      const selectInfo =
        splitSelect(
          req.body?.select
          ||
          "*"
        );


      let data =
        null;


      if (
        operation === "select"
      ) {

        let sql =
          `
            SELECT
              ${selectInfo.sql}
            FROM \`${table}\`
            ${where.sql}
          `;


        const params =
          [
            ...where.params,
          ];


        const order =
          req.body?.order;


        if (
          order?.column
          &&
          validIdentifier(
            order.column
          )
        ) {

          sql +=
            ` ORDER BY \`${order.column}\` ${
              order.ascending
                ?
                "ASC"
                :
                "DESC"
            }`;
        }


        if (
          Number.isInteger(
            req.body?.limit
          )
          &&
          req.body.limit > 0
        ) {

          sql +=
            " LIMIT ?";

          params.push(
            Math.min(
              req.body.limit,
              5000
            )
          );
        }


        const [
          rows
        ] =
          await db.query(
            sql,
            params
          );


        data =
          rows.map(
            row =>
              normalizeRow(
                table,
                row
              )
          );


        data =
          await hydrateRelations(
            table,
            data,
            selectInfo.relations
          );


      } else if (
        operation === "insert"
      ) {

        const objects =
          Array.isArray(
            req.body.values
          )
            ?
            req.body.values
            :
            [
              req.body.values,
            ];


        const insertedIds =
          [];


        for (
          const source
          of objects
        ) {

          const object =
            {
              ...source,
            };


          if (
            ID_TABLES.has(
              table
            )
            &&
            !object.id
          ) {

            object.id =
              crypto.randomUUID();
          }


          const columns =
            Object.keys(
              object
            );


          if (
            !columns.length
            ||
            !columns.every(
              validIdentifier
            )
          ) {

            throw new Error(
              "Dados inválidos"
            );
          }


          const values =
            columns.map(
              column =>
                normalizeWriteValue(
                  table,
                  column,
                  object[column]
                )
            );


          await db.execute(
            `
              INSERT INTO \`${table}\`
              (
                ${columns.map(column => `\`${column}\``).join(",")}
              )
              VALUES
              (
                ${columns.map(() => "?").join(",")}
              )
            `,
            values
          );


          if (
            object.id
          ) {

            insertedIds.push(
              object.id
            );
          }
        }


        if (
          req.body.select
          &&
          insertedIds.length
        ) {

          const [
            rows
          ] =
            await db.query(
              `
                SELECT
                  ${selectInfo.sql}
                FROM \`${table}\`
                WHERE id IN (
                  ${insertedIds.map(() => "?").join(",")}
                )
              `,
              insertedIds
            );


          data =
            rows.map(
              row =>
                normalizeRow(
                  table,
                  row
                )
            );
        }


      } else if (
        operation === "update"
      ) {

        const valuesObject =
          req.body.values
          ||
          {};


        const columns =
          Object.keys(
            valuesObject
          );


        if (
          !columns.length
          ||
          !columns.every(
            validIdentifier
          )
        ) {

          throw new Error(
            "Atualização inválida"
          );
        }


        let before =
          [];


        if (
          table
          ===
          "sac_requests"
        ) {

          const [
            previous
          ] =
            await db.query(
              `
                SELECT *
                FROM sac_requests
                ${where.sql}
              `,
              where.params
            );


          before =
            previous;
        }


        const updateValues =
          columns.map(
            column =>
              normalizeWriteValue(
                table,
                column,
                valuesObject[column]
              )
          );


        await db.execute(
          `
            UPDATE \`${table}\`
            SET
              ${columns.map(column => `\`${column}\` = ?`).join(",")}
            ${where.sql}
          `,
          [
            ...updateValues,
            ...where.params,
          ]
        );


        if (
          table
          ===
          "sac_requests"
        ) {

          await auditSacUpdate(
            req,
            before,
            valuesObject
          );
        }


        if (
          req.body.select
        ) {

          const [
            rows
          ] =
            await db.query(
              `
                SELECT
                  ${selectInfo.sql}
                FROM \`${table}\`
                ${where.sql}
              `,
              where.params
            );


          data =
            rows.map(
              row =>
                normalizeRow(
                  table,
                  row
                )
            );
        }


      } else if (
        operation === "delete"
      ) {

        let rowsBefore =
          [];


        if (
          req.body.select
        ) {

          [
            rowsBefore
          ] =
            await db.query(
              `
                SELECT
                  ${selectInfo.sql}
                FROM \`${table}\`
                ${where.sql}
              `,
              where.params
            );
        }


        await db.execute(
          `
            DELETE FROM \`${table}\`
            ${where.sql}
          `,
          where.params
        );


        if (
          req.body.select
        ) {

          data =
            rowsBefore.map(
              row =>
                normalizeRow(
                  table,
                  row
                )
            );
        }


      } else {

        return jsonError(
          res,
          400,
          "Operação inválida"
        );
      }


      return res.json({
        data,
        error:
          null,
      });


    } catch (
      error
    ) {

      console.error(
        "DB API:",
        error
      );


      return res
        .status(400)
        .json({
          data:
            null,

          error: {
            message:
              error.message,
          },
        });
    }
  }
);


registerResumableUpload(app, db, uploadRoot);

/* =========================================================
   STORAGE LOCAL
   ========================================================= */

const upload =
  multer({
    dest:
      tempRoot,

    limits: {
      fileSize:
        1024
        *
        1024
        *
        1024,

      files:
        1,
    },
  });


function safeStoragePath(
  bucket,
  objectPath
) {

  if (
    ![
      "sac-attachments",
      "laudos",
    ].includes(
      bucket
    )
  ) {

    throw new Error(
      "Bucket inválido"
    );
  }


  const bucketRoot =
    path.resolve(
      uploadRoot,
      bucket
    );


  const destination =
    path.resolve(
      bucketRoot,
      String(
        objectPath
        ||
        ""
      )
    );


  if (
    destination === bucketRoot
    ||
    !destination.startsWith(
      bucketRoot
      +
      path.sep
    )
  ) {

    throw new Error(
      "Caminho inválido"
    );
  }


  return destination;
}


app.post(
  "/api/storage/:bucket/upload",
  optionalAuthenticate,
  upload.single(
    "file"
  ),
  async (
    req,
    res
  ) => {

    const bucket =
      req.params.bucket;


    if (
      bucket === "laudos"
      &&
      !req.user
    ) {

      if (
        req.file?.path
      ) {

        fs.rmSync(
          req.file.path,
          {
            force:
              true,
          }
        );
      }


      return jsonError(
        res,
        401,
        "Não autorizado"
      );
    }


    if (
      bucket !== "sac-attachments"
      &&
      bucket !== "laudos"
    ) {

      return jsonError(
        res,
        400,
        "Bucket inválido"
      );
    }


    if (
      !req.file
    ) {

      return jsonError(
        res,
        400,
        "Arquivo ausente"
      );
    }


    try {

      const objectPath =
        String(
          req.body?.path
          ||
          ""
        );


      const destination =
        safeStoragePath(
          bucket,
          objectPath
        );


      fs.mkdirSync(
        path.dirname(
          destination
        ),
        {
          recursive:
            true,
        }
      );


      try {

        fs.renameSync(
          req.file.path,
          destination
        );

      } catch (
        error
      ) {

        if (
          error.code
          !==
          "EXDEV"
        ) {

          throw error;
        }


        fs.copyFileSync(
          req.file.path,
          destination
        );


        fs.rmSync(
          req.file.path,
          {
            force:
              true,
          }
        );
      }


      await db.execute(
        `
          INSERT INTO storage_objects
          (
            id,
            bucket,
            object_path,
            original_name,
            mime_type,
            size_bytes,
            uploaded_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            original_name = VALUES(original_name),
            mime_type = VALUES(mime_type),
            size_bytes = VALUES(size_bytes),
            uploaded_by = VALUES(uploaded_by)
        `,
        [
          crypto.randomUUID(),
          bucket,
          objectPath,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.user?.id
          ||
          null,
        ]
      );


      return res.json({
        data: {
          path:
            objectPath,

          fullPath:
            `${bucket}/${objectPath}`,
        },

        error:
          null,
      });


    } catch (
      error
    ) {

      if (
        req.file?.path
        &&
        fs.existsSync(
          req.file.path
        )
      ) {

        fs.rmSync(
          req.file.path,
          {
            force:
              true,
          }
        );
      }


      return jsonError(
        res,
        400,
        error.message
      );
    }
  }
);


app.get(
  "/api/storage/:bucket/download",
  optionalAuthenticate,
  (
    req,
    res
  ) => {

    const bucket =
      req.params.bucket;


    if (
      bucket === "laudos"
      &&
      !req.user
    ) {

      return jsonError(
        res,
        401,
        "Não autorizado"
      );
    }


    try {

      const filename =
        safeStoragePath(
          bucket,
          req.query.path
        );


      if (
        !fs.existsSync(
          filename
        )
      ) {

        return jsonError(
          res,
          404,
          "Arquivo não encontrado"
        );
      }


      return res.sendFile(
        filename
      );


    } catch (
      error
    ) {

      return jsonError(
        res,
        400,
        error.message
      );
    }
  }
);


app.post(
  "/api/storage/:bucket/remove",
  authenticate,
  async (
    req,
    res
  ) => {

    const bucket =
      req.params.bucket;


    const paths =
      Array.isArray(
        req.body?.paths
      )
        ?
        req.body.paths
        :
        [];


    for (
      const objectPath
      of paths
    ) {

      try {

        const filename =
          safeStoragePath(
            bucket,
            objectPath
          );


        fs.rmSync(
          filename,
          {
            force:
              true,
          }
        );


        await db.execute(
          `
            DELETE FROM storage_objects
            WHERE bucket = ?
              AND object_path = ?
          `,
          [
            bucket,
            objectPath,
          ]
        );

      } catch {}
    }


    return res.json({
      data: [],
      error:
        null,
    });
  }
);


registerMigrationRoutes(
  app,
  {
    db,
    authenticate,
    uploadRoot,
  }
);

/* =========================================================
   PUBLIC SUBMIT SAC
   ========================================================= */

function generateProtocol() {

  const date =
    new Date();


  const yyyy =
    date.getFullYear();


  const mm =
    String(
      date.getMonth()
      +
      1
    )
    .padStart(
      2,
      "0"
    );


  const dd =
    String(
      date.getDate()
    )
    .padStart(
      2,
      "0"
    );


  const random =
    crypto.randomBytes(
      4
    )
    .toString(
      "hex"
    )
    .slice(
      0,
      6
    )
    .toUpperCase();


  return `SAC${yyyy}${mm}${dd}-${random}`;
}


app.post(
  "/api/functions/v1/submit-sac",
  async (
    req,
    res
  ) => {

    const body =
      req.body
      ||
      {};


    const required =
      [
        "contactType",
        "name",
        "email",
        "phone",
        "orderNumber",
        "subject",
        "message",
      ];


    for (
      const field
      of required
    ) {

      if (
        !String(
          body[field]
          ||
          ""
        ).trim()
      ) {

        return jsonError(
          res,
          400,
          "Campos obrigatórios não preenchidos"
        );
      }
    }


    const id =
      crypto.randomUUID();


    let protocol =
      generateProtocol();


    for (
      let attempt = 0;
      attempt < 5;
      attempt++
    ) {

      const [
        existing
      ] =
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


      if (
        !existing.length
      ) {
        break;
      }


      protocol =
        generateProtocol();
    }


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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
      `,
      [
        id,
        body.contactType,
        body.contactType === "reclamacao"
          ?
          (
            body.complaintType
            ||
            null
          )
          :
          null,
        body.name,
        body.email,
        body.phone,
        body.orderNumber,
        body.subject,
        body.message,
        Array.isArray(
          body.attachments
        )
          ?
          JSON.stringify(
            body.attachments
          )
          :
          null,
        protocol,
      ]
    );


    return res.json({
      success:
        true,

      protocol,

      message:
        "Solicitação enviada com sucesso",
    });
  }
);


/* =========================================================
   USER MANAGEMENT
   ========================================================= */

app.post(
  "/api/functions/v1/create-admin-user",
  authenticate,
  ensureManager,
  async (
    req,
    res
  ) => {

    const email =
      String(
        req.body?.email
        ||
        ""
      )
      .trim()
      .toLowerCase();


    const password =
      String(
        req.body?.password
        ||
        ""
      );


    const role =
      String(
        req.body?.role
        ||
        "qualidade"
      );


    const displayName =
      String(
        req.body?.display_name
        ||
        ""
      )
      .trim()
      ||
      null;


    if (
      !email
      ||
      password.length < 6
    ) {

      return jsonError(
        res,
        400,
        "E-mail ou senha inválidos"
      );
    }


    if (
      ![
        "desenvolvedor",
        "qualidade",
        "gerencia",
        "vendas",
      ].includes(
        role
      )
    ) {

      return jsonError(
        res,
        400,
        "Cargo inválido"
      );
    }


    if (
      role === "vendas"
      &&
      !displayName
    ) {

      return jsonError(
        res,
        400,
        "Nome do vendedor é obrigatório"
      );
    }


    const [
      existing
    ] =
      await db.query(
        `
          SELECT id
          FROM app_users
          WHERE LOWER(email) = ?
          LIMIT 1
        `,
        [
          email,
        ]
      );


    if (
      existing.length
    ) {

      return jsonError(
        res,
        400,
        "Este e-mail já está cadastrado"
      );
    }


    const userId =
      crypto.randomUUID();


    const roleId =
      crypto.randomUUID();


    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );


    const connection =
      await db.getConnection();


    try {

      await connection.beginTransaction();


      await connection.execute(
        `
          INSERT INTO app_users
          (
            id,
            email,
            password_hash,
            email_confirmed_at,
            is_active
          )
          VALUES (?, ?, ?, NOW(), 1)
        `,
        [
          userId,
          email,
          passwordHash,
        ]
      );


      await connection.execute(
        `
          INSERT INTO user_roles
          (
            id,
            user_id,
            role,
            display_name
          )
          VALUES (?, ?, ?, ?)
        `,
        [
          roleId,
          userId,
          role,
          displayName,
        ]
      );


      await connection.commit();


    } catch (
      error
    ) {

      await connection.rollback();

      throw error;


    } finally {

      connection.release();
    }


    return res.json({
      success:
        true,

      user: {
        id:
          userId,

        email,
      },
    });
  }
);


app.post(
  "/api/functions/v1/manage-admin-users",
  authenticate,
  ensureManager,
  async (
    req,
    res
  ) => {

    const action =
      req.body?.action;


    if (
      action === "list"
    ) {

      const [
        rows
      ] =
        await db.query(
          `
            SELECT
              ur.id,
              ur.user_id,
              ur.role,
              ur.display_name,
              ur.created_at,
              u.email
            FROM user_roles ur
            LEFT JOIN app_users u
              ON u.id = ur.user_id
            WHERE ur.role IN (
              'admin',
              'desenvolvedor',
              'qualidade',
              'gerencia',
              'vendas'
            )
            ORDER BY ur.created_at DESC
          `
        );


      return res.json({
        users:
          rows,
      });
    }


    if (
      action === "update_password"
    ) {

      const userId =
        String(
          req.body?.user_id
          ||
          ""
        );


      const password =
        String(
          req.body?.password
          ||
          ""
        );


      if (
        !userId
        ||
        password.length < 6
      ) {

        return jsonError(
          res,
          400,
          "Senha inválida (mínimo 6 caracteres)"
        );
      }


      const hash =
        await bcrypt.hash(
          password,
          12
        );


      await db.execute(
        `
          UPDATE app_users
          SET password_hash = ?,
              updated_at = NOW()
          WHERE id = ?
        `,
        [
          hash,
          userId,
        ]
      );


      return res.json({
        success:
          true,
      });
    }


    if (
      action === "update_role"
    ) {

      const userId =
        String(
          req.body?.user_id
          ||
          ""
        );


      const role =
        String(
          req.body?.role
          ||
          ""
        );


      const displayName =
        String(
          req.body?.display_name
          ||
          ""
        )
        .trim()
        ||
        null;


      if (
        !userId
        ||
        ![
          "desenvolvedor",
          "qualidade",
          "gerencia",
          "vendas",
        ].includes(
          role
        )
      ) {

        return jsonError(
          res,
          400,
          "Cargo inválido"
        );
      }


      if (
        role === "vendas"
        &&
        !displayName
      ) {

        return jsonError(
          res,
          400,
          "Nome do vendedor é obrigatório"
        );
      }


      const connection =
        await db.getConnection();


      try {

        await connection.beginTransaction();


        await connection.execute(
          `
            DELETE FROM user_roles
            WHERE user_id = ?
              AND role IN (
                'admin',
                'desenvolvedor',
                'qualidade',
                'gerencia',
                'vendas'
              )
          `,
          [
            userId,
          ]
        );


        await connection.execute(
          `
            INSERT INTO user_roles
            (
              id,
              user_id,
              role,
              display_name
            )
            VALUES (?, ?, ?, ?)
          `,
          [
            crypto.randomUUID(),
            userId,
            role,
            displayName,
          ]
        );


        await connection.commit();


      } catch (
        error
      ) {

        await connection.rollback();

        throw error;


      } finally {

        connection.release();
      }


      return res.json({
        success:
          true,
      });
    }


    if (
      action === "update_display_name"
    ) {

      await db.execute(
        `
          UPDATE user_roles
          SET display_name = ?
          WHERE user_id = ?
        `,
        [
          String(
            req.body?.display_name
            ||
            ""
          ).trim()
          ||
          null,

          req.body?.user_id,
        ]
      );


      return res.json({
        success:
          true,
      });
    }


    return jsonError(
      res,
      400,
      "Ação inválida"
    );
  }
);


/* =========================================================
   FUNÇÕES AINDA EXTERNAS - FASE SEGUINTE
   ========================================================= */

for (
  const functionName
  of [
    "notify-sac-edit",
    "notify-internal-ticket",
  ]
) {

  app.post(
    `/api/functions/v1/${functionName}`,
    authenticate,
    (
      _req,
      res
    ) => {

      return res.json({
        success:
          true,

        local:
          true,

        notification:
          "pending-email-cutover",
      });
    }
  );
}


app.post(
  "/api/functions/v1/send-customer-email",
  authenticate,
  (
    _req,
    res
  ) => {

    return res
      .status(503)
      .json({
        error:
          "Módulo de e-mail será ativado na próxima etapa da migração",
      });
  }
);


app.post(
  "/api/functions/v1/imap-poll-inbox",
  authenticate,
  (
    _req,
    res
  ) => {

    return res
      .status(503)
      .json({
        error:
          "Módulo IMAP será ativado na próxima etapa da migração",
      });
  }
);


/* =========================================================
   FALLBACK
   ========================================================= */

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({
        ok:
          false,

        error:
          "route_not_found",

        path:
          req.path,
      });
  }
);


app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {

    console.error(
      "SAC BACKEND ERROR:",
      error
    );


    if (
      error?.code
      ===
      "LIMIT_FILE_SIZE"
    ) {

      return res
        .status(413)
        .json({
          error:
            "Arquivo excede 1 GB",
        });
    }


    return res
      .status(500)
      .json({
        error:
          error?.message
          ||
          "Erro interno",
      });
  }
);


app.listen(
  config.apiPort,
  config.apiHost,
  () => {

    console.log(
      `SAC Digitale local API online em ${config.apiHost}:${config.apiPort}`
    );
  }
);
