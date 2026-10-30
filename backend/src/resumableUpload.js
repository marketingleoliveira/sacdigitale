import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CHUNK = 8 * 1024 * 1024;
const MIN_FREE = 2 * 1024 * 1024 * 1024;
const EXPIRE = 24 * 60 * 60 * 1000;

export function registerResumableUpload(app, db, uploadRoot) {
  const base = path.join(uploadRoot, ".resumable");
  fs.mkdirSync(base, { recursive: true });


  // SAC_UPLOAD_GUARD_V3
  const MAX_FILE = 30 * 1024 ** 3;
  const MAX_ACTIVE_IP = 3;
  const MAX_ACTIVE_GLOBAL = 30;
  const rate = new Map();

  const clientIp = req =>
    String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");

  function cleanup() {
    for (const id of fs.readdirSync(base)) {
      const dir = path.join(base, id);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
        const meta = JSON.parse(
          fs.readFileSync(path.join(dir, "meta.json"), "utf8")
        );
        if (Date.now() - meta.created > EXPIRE)
          fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        const age = Date.now() - fs.statSync(dir).mtimeMs;
        if (age > EXPIRE)
          fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  cleanup();
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref();

  app.use("/api/uploads", (req, res, next) => {
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host"))
          return res.status(403).json({ error: "Origem não permitida" });
      } catch {
        return res.status(403).json({ error: "Origem inválida" });
      }
    }

    const ip = clientIp(req);
    const now = Date.now();
    const key = ip + ":" + (req.path === "/init" ? "init" : "parts");
    const entry = rate.get(key) || { start: now, count: 0 };
    const windowMs = req.path === "/init" ? 3600000 : 60000;
    const allowed = req.path === "/init" ? 30 : 400;

    if (now - entry.start > windowMs) {
      entry.start = now;
      entry.count = 0;
    }

    entry.count++;
    rate.set(key, entry);

    if (entry.count > allowed)
      return res.status(429).json({
        error: "Muitas solicitações. Tente novamente em instantes."
      });

    next();
  });

  const locate = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("ID inválido");
    return path.join(base, id);
  };

  const get = (req) => {
    const dir = locate(req.params.id);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    const token = req.headers["x-upload-token"];
    if (!token || token !== meta.token) throw Error("Sessão não autorizada");
    if (Date.now() - meta.created > EXPIRE) throw Error("Upload expirado");
    return { dir, meta };
  };

  const respond = (res, error) =>
    res.status(400).json({ error: String(error.message || error) });

  app.post("/api/uploads/init", (req, res) => {
    try {
      const name = String(req.body?.name || "").slice(0, 255);
      const size = Number(req.body?.size);
      const mime = String(req.body?.type || "application/octet-stream");

      if (!name || !Number.isSafeInteger(size) || size <= 0)
        throw Error("Arquivo inválido");

      const free = fs.statfsSync(uploadRoot);
      const available = Number(free.bavail) * Number(free.bsize);

      if (size > available - MIN_FREE)
        throw Error("Espaço insuficiente para este arquivo");


      if (size > MAX_FILE)
        throw Error("Arquivo acima da capacidade operacional de 30 GB");


      const allowedExtensions = new Set([
        ".jpg", ".jpeg", ".png", ".gif", ".webp",
        ".pdf", ".mp4", ".mov", ".webm", ".avi",
        ".doc", ".docx", ".xls", ".xlsx",
        ".txt", ".csv", ".zip"
      ]);

      const extension = path.extname(name).toLowerCase();

      if (!allowedExtensions.has(extension))
        throw Error("Formato de arquivo não permitido");


      const ip = clientIp(req);
      const active = fs.readdirSync(base).flatMap(id => {
        try {
          return [JSON.parse(
            fs.readFileSync(path.join(base, id, "meta.json"), "utf8")
          )];
        } catch {
          return [];
        }
      });

      if (active.length >= MAX_ACTIVE_GLOBAL ||
          active.filter(item => item.ip === ip).length >= MAX_ACTIVE_IP)
        throw Error("Limite de uploads simultâneos atingido");

      const id = crypto.randomUUID();
      const token = crypto.randomBytes(32).toString("hex");
      const dir = locate(id);
      fs.mkdirSync(dir);

      const meta = {
        id, token, name, size, mime,
        created: Date.now(), offset: 0, ip
      };

      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
      res.json({ id, token, chunkSize: CHUNK, offset: 0 });
    } catch (e) {
      respond(res, e);
    }
  });

  app.get("/api/uploads/:id", (req, res) => {
    try {
      const { meta } = get(req);
      res.json({ offset: meta.offset, size: meta.size });
    } catch (e) {
      respond(res, e);
    }
  });

  app.put(
    "/api/uploads/:id/chunk",
    express.raw({ type: "application/octet-stream", limit: "8mb" }),
    (req, res) => {
      try {
        const { dir, meta } = get(req);
        const offset = Number(req.headers["x-upload-offset"]);
        const data = req.body;

        if (!Buffer.isBuffer(data) || !data.length ||
            data.length > CHUNK || offset !== meta.offset ||
            offset + data.length > meta.size)
          throw Error("Parte inválida ou fora de sequência");


        const free = fs.statfsSync(uploadRoot);
        if (Number(free.bavail) * Number(free.bsize) <
            MIN_FREE + data.length)
          throw Error("Espaço disponível insuficiente");

        const fd = fs.openSync(path.join(dir, "data"), "a");
        try {
          fs.writeSync(fd, data);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }

        meta.offset += data.length;
        fs.writeFileSync(
          path.join(dir, "meta.json"),
          JSON.stringify(meta)
        );

        res.json({ offset: meta.offset, size: meta.size });
      } catch (e) {
        respond(res, e);
      }
    }
  );

  app.post("/api/uploads/:id/complete", async (req, res) => {
    try {
      const { dir, meta } = get(req);
      const source = path.join(dir, "data");

      if (meta.offset !== meta.size ||
          fs.statSync(source).size !== meta.size)
        throw Error("Upload ainda incompleto");

      const extension = path.extname(meta.name)
        .replace(/[^a-zA-Z0-9.]/g, "")
        .slice(0, 16);

      const objectPath = `attachments/${crypto.randomUUID()}${extension}`;
      const target = path.join(uploadRoot, "sac-attachments", objectPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });

      fs.renameSync(source, target);

      try {
        await db.execute(
          `INSERT INTO storage_objects
           (id,bucket,object_path,original_name,mime_type,size_bytes,uploaded_by)
           VALUES (?, 'sac-attachments', ?, ?, ?, ?, NULL)`,
          [crypto.randomUUID(), objectPath, meta.name, meta.mime, meta.size]
        );
      } catch (e) {
        fs.renameSync(target, source);
        throw e;
      }

      fs.rmSync(dir, { recursive: true, force: true });

      const url = `/api/storage/sac-attachments/download?path=${
        encodeURIComponent(objectPath)
      }`;

      res.json({ url, path: objectPath });
    } catch (e) {
      respond(res, e);
    }
  });

  app.delete("/api/uploads/:id", (req, res) => {
    try {
      const { dir } = get(req);
      fs.rmSync(dir, { recursive: true, force: true });
      res.json({ success: true });
    } catch (e) {
      respond(res, e);
    }
  });
}
