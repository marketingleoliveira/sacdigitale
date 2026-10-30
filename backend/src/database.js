import mysql from "mysql2/promise";

import {
  config
} from "./config.js";


export const db =
  mysql.createPool({

    host:
      config.database.host,

    port:
      config.database.port,

    user:
      config.database.user,

    password:
      config.database.password,

    database:
      config.database.database,

    charset:
      "utf8mb4",

    waitForConnections:
      true,

    connectionLimit:
      10,

    queueLimit:
      0,

    enableKeepAlive:
      true,

    keepAliveInitialDelay:
      0,
  });
