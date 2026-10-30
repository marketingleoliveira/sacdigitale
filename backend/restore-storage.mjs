import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import mysql from "mysql2/promise";
import dotenv from "dotenv";


dotenv.config({
  path:
    "/etc/sac-digitale/backend.env",
});


function parseEnvFile(
  filename
) {

  const result = {};

  const text =
    fs.readFileSync(
      filename,
      "utf8"
    );


  for (
    const line
    of text.split(
      /\r?\n/
    )
  ) {

    if (
      !line.trim()
      ||
      line.trim()
        .startsWith("#")
    ) {
      continue;
    }


    const match =
      line.match(
        /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/
      );


    if (!match) {
      continue;
    }


    let value =
      match[2].trim();


    if (
      (
        value.startsWith('"')
        &&
        value.endsWith('"')
      )
      ||
      (
        value.startsWith("'")
        &&
        value.endsWith("'")
      )
    ) {

      value =
        value.slice(
          1,
          -1
        );
    }


    result[
      match[1]
    ] =
      value;
  }


  return result;
}


const originalEnv =
  parseEnvFile(
    "/var/www/SAC-Digitale/.env"
  );


const supabaseUrl =
  (
    originalEnv.VITE_SUPABASE_URL
    ||
    ""
  )
  .replace(
    /\/+$/,
    ""
  );


const anonKey =
  originalEnv.VITE_SUPABASE_PUBLISHABLE_KEY
  ||
  originalEnv.VITE_SUPABASE_ANON_KEY
  ||
  "";


if (!supabaseUrl) {

  console.error(
    "ERRO=SUPABASE_URL_AUSENTE"
  );

  process.exit(1);
}


const uploadsRoot =
  path.resolve(
    "/var/lib/sac-digitale/uploads"
  );


const db =
  mysql.createPool({

    host:
      process.env.DB_HOST,

    port:
      Number(
        process.env.DB_PORT
        ||
        3306
      ),

    user:
      process.env.DB_USER,

    password:
      process.env.DB_PASSWORD,

    database:
      process.env.DB_NAME,

    charset:
      "utf8mb4",

    connectionLimit:
      2,
  });


function encodePath(
  value
) {

  return String(
    value
  )
    .split("/")
    .map(
      part =>
        encodeURIComponent(
          part
        )
    )
    .join("/");
}


function safeDestination(
  bucket,
  objectPath
) {

  const bucketRoot =
    path.resolve(
      uploadsRoot,
      bucket
    );


  const destination =
    path.resolve(
      bucketRoot,
      objectPath
    );


  if (
    destination
    !==
    bucketRoot
    &&
    !destination.startsWith(
      bucketRoot
      +
      path.sep
    )
  ) {

    throw new Error(
      "unsafe_storage_path"
    );
  }


  return destination;
}


async function download(
  url,
  destination,
  headers = {}
) {

  const response =
    await fetch(
      url,
      {
        headers,
        redirect:
          "follow",
      }
    );


  if (!response.ok) {

    return {
      ok:
        false,

      status:
        response.status,
    };
  }


  if (!response.body) {

    return {
      ok:
        false,

      status:
        response.status,
    };
  }


  await fsp.mkdir(
    path.dirname(
      destination
    ),
    {
      recursive:
        true,
    }
  );


  const temporary =
    `${destination}.part`;


  await pipeline(
    Readable.fromWeb(
      response.body
    ),
    fs.createWriteStream(
      temporary
    )
  );


  await fsp.rename(
    temporary,
    destination
  );


  const stat =
    await fsp.stat(
      destination
    );


  return {
    ok:
      true,

    status:
      response.status,

    size:
      stat.size,
  };
}


async function recoverObject(
  object
) {

  const bucket =
    object.bucket;

  const objectPath =
    object.object_path;


  const destination =
    safeDestination(
      bucket,
      objectPath
    );


  /*
   * Se já existir e o tamanho bater,
   * não baixa novamente.
   */
  try {

    const current =
      await fsp.stat(
        destination
      );


    if (
      current.isFile()
      &&
      (
        !object.size_bytes
        ||
        Number(
          object.size_bytes
        )
        ===
        current.size
      )
    ) {

      return {
        status:
          "existing",

        bucket,
        objectPath,
        size:
          current.size,
      };
    }

  } catch {}


  const encodedBucket =
    encodeURIComponent(
      bucket
    );


  const encodedPath =
    encodePath(
      objectPath
    );


  /*
   * 1) Tenta URL pública.
   */
  const publicUrl =
    `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;


  let result =
    await download(
      publicUrl,
      destination
    );


  if (result.ok) {

    return {
      status:
        "downloaded_public",

      bucket,
      objectPath,

      size:
        result.size,
    };
  }


  /*
   * 2) Caso o bucket não seja público,
   * tenta endpoint autenticado usando
   * a chave anon já existente no projeto.
   *
   * Isso continua respeitando as policies
   * do Supabase.
   */
  if (anonKey) {

    const authenticatedUrl =
      `${supabaseUrl}/storage/v1/object/authenticated/${encodedBucket}/${encodedPath}`;


    result =
      await download(
        authenticatedUrl,
        destination,
        {
          apikey:
            anonKey,

          Authorization:
            `Bearer ${anonKey}`,
        }
      );


    if (result.ok) {

      return {
        status:
          "downloaded_authenticated",

        bucket,
        objectPath,

        size:
          result.size,
      };
    }
  }


  return {
    status:
      "failed",

    bucket,
    objectPath,

    http:
      result.status,
  };
}


try {

  const [
    objects
  ] =
    await db.query(`
      SELECT
        bucket,
        object_path,
        size_bytes
      FROM storage_objects
      ORDER BY
        bucket,
        object_path
    `);


  console.log(
    `STORAGE_REGISTRADO=${objects.length}`
  );


  const counters = {
    existing:
      0,

    downloaded_public:
      0,

    downloaded_authenticated:
      0,

    failed:
      0,
  };


  const failures = [];


  for (
    const object
    of objects
  ) {

    try {

      const result =
        await recoverObject(
          object
        );


      counters[
        result.status
      ]++;


      if (
        result.status
        ===
        "failed"
      ) {

        failures.push(
          result
        );


        console.log(
          `FALHOU=${result.bucket}/${result.objectPath} HTTP=${result.http}`
        );

      } else {

        console.log(
          `OK=${result.bucket}/${result.objectPath} SIZE=${result.size}`
        );
      }


    } catch (
      error
    ) {

      counters.failed++;


      failures.push({
        bucket:
          object.bucket,

        objectPath:
          object.object_path,

        error:
          String(
            error?.message
            ||
            error
          ),
      });


      console.log(
        `FALHOU=${object.bucket}/${object.object_path}`
      );
    }
  }


  fs.writeFileSync(
    "/var/backups/sac-digitale/storage-last-failures.json",
    JSON.stringify(
      failures,
      null,
      2
    )
  );


  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " RESULTADO STORAGE"
  );
  console.log(
    "=============================================="
  );

  console.log(
    `JA_EXISTIAM=${counters.existing}`
  );

  console.log(
    `BAIXADOS_PUBLICOS=${counters.downloaded_public}`
  );

  console.log(
    `BAIXADOS_AUTENTICADOS=${counters.downloaded_authenticated}`
  );

  console.log(
    `FALHAS=${counters.failed}`
  );


} finally {

  await db.end();
}
