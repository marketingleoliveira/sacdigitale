import dotenv from "dotenv";

dotenv.config({
  path:
    "/etc/sac-digitale/backend.env"
});


function required(
  name
) {

  const value =
    process.env[name];


  if (
    value === undefined
    ||
    value === ""
  ) {

    throw new Error(
      `Variável obrigatória ausente: ${name}`
    );
  }


  return value;
}


export const config = {

  apiHost:
    process.env.API_HOST
    ||
    "127.0.0.1",

  apiPort:
    Number(
      process.env.API_PORT
      ||
      8121
    ),


  database: {

    host:
      required(
        "DB_HOST"
      ),

    port:
      Number(
        process.env.DB_PORT
        ||
        3306
      ),

    database:
      required(
        "DB_NAME"
      ),

    user:
      required(
        "DB_USER"
      ),

    password:
      required(
        "DB_PASSWORD"
      ),
  },


  jwtSecret:
    required(
      "JWT_SECRET"
    ),


  uploadsPath:
    process.env.UPLOADS_PATH
    ||
    "/var/lib/sac-digitale/uploads",


  attachmentsPath:
    process.env.ATTACHMENTS_PATH
    ||
    "/var/lib/sac-digitale/uploads/sac-attachments",


  laudosPath:
    process.env.LAUDOS_PATH
    ||
    "/var/lib/sac-digitale/uploads/laudos",
};
