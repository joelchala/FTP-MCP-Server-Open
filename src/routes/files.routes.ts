/*
 * Archivo: files.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: API REST para operaciones de archivos en sitios FTP/SFTP
 * Ruta: ftp-mcp-server-open/src/routes/files.routes.ts
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { decrypt } from "../config/encryption.js";
import { getConnectionForSite } from "../services/connection.manager.js";
import { DEFAULT_READ_TIMEOUT, DEFAULT_MAX_FILE_SIZE, DEFAULT_ALLOWED_EXTENSIONS } from "../constants.js";
import { isExtensionAllowed } from "../services/file.utils.js";
import type { Protocol, ConnectionConfig } from "../types.js";

export const filesRoutes = Router();

// Helper: obtener site y config validando ownership
async function getSiteConfig(
  req: Request, res: Response
): Promise<{ siteId: string; config: ConnectionConfig } | null> {
  const siteId = req.params.siteId as string;
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "No autenticado" }); return null; }
  if (!siteId) { res.status(400).json({ error: "Se requiere siteId" }); return null; }

  const db = getDatabase();
  const site = await db.site.findFirst({
    where: { id: siteId, userId, isActive: true },
  });
  if (!site) { res.status(404).json({ error: "Sitio no encontrado" }); return null; }

  const password = decrypt(site.passwordEnc);
  return {
    siteId: site.id,
    config: {
      host: site.host,
      port: site.port,
      user: site.username,
      password,
      protocol: site.protocol as Protocol,
      basePath: site.basePath,
      timeout: Number(process.env.FTP_READ_TIMEOUT) || DEFAULT_READ_TIMEOUT,
    },
  };
}

// GET /:siteId/list?path=.
filesRoutes.get("/:siteId/list", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const remotePath = (req.query.path as string) || ".";
    const conn = await getConnectionForSite(sc.siteId, sc.config);
    const entries = await conn.list(remotePath);

    res.json({ entries, path: remotePath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al listar directorio" });
  }
});

// GET /:siteId/read?path=./file.txt
filesRoutes.get("/:siteId/read", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const remotePath = req.query.path as string;
    if (!remotePath) { res.status(400).json({ error: "Se requiere el parametro path" }); return; }

    const conn = await getConnectionForSite(sc.siteId, sc.config);

    // Verificar tamano
    const exists = await conn.exists(remotePath);
    if (!exists) { res.status(404).json({ error: "Archivo no encontrado" }); return; }

    const info = await conn.stat(remotePath);
    const maxSize = Number(process.env.FTP_MAX_FILE_SIZE) || DEFAULT_MAX_FILE_SIZE;
    if (info.size > maxSize) {
      res.status(413).json({ error: `Archivo demasiado grande (${info.size} bytes, max ${maxSize})` });
      return;
    }

    const buffer = await conn.read(remotePath);
    const content = buffer.toString("utf-8");
    const lines = content.split("\n");

    res.json({ content, size: info.size, totalLines: lines.length, path: remotePath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al leer archivo" });
  }
});

// POST /:siteId/write  body: { path, content, createBackup? }
filesRoutes.post("/:siteId/write", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const { path: remotePath, content, createBackup = true } = req.body;
    if (!remotePath || content === undefined) {
      res.status(400).json({ error: "Se requieren path y content" });
      return;
    }

    // Verificar extension
    const allowed = process.env.FTP_ALLOWED_EXTENSIONS
      ? process.env.FTP_ALLOWED_EXTENSIONS.split(",").map((e: string) => e.trim())
      : DEFAULT_ALLOWED_EXTENSIONS;
    if (!isExtensionAllowed(remotePath, allowed)) {
      res.status(403).json({ error: "Extension de archivo no permitida" });
      return;
    }

    const conn = await getConnectionForSite(sc.siteId, sc.config);

    // Backup
    let backupPath: string | null = null;
    if (createBackup) {
      const exists = await conn.exists(remotePath);
      if (exists) {
        const ts = Date.now();
        backupPath = `${remotePath}.${ts}.bak`;
        try {
          const original = await conn.read(remotePath);
          await conn.write(backupPath, original);
        } catch { backupPath = null; }
      }
    }

    const buf = Buffer.from(content, "utf-8");
    await conn.write(remotePath, buf);

    res.json({ path: remotePath, size: buf.length, backupCreated: !!backupPath, backupPath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al escribir archivo" });
  }
});

// GET /:siteId/stat?path=./file.txt
filesRoutes.get("/:siteId/stat", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const remotePath = req.query.path as string;
    if (!remotePath) { res.status(400).json({ error: "Se requiere el parametro path" }); return; }

    const conn = await getConnectionForSite(sc.siteId, sc.config);
    const info = await conn.stat(remotePath);

    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al obtener info" });
  }
});

// POST /:siteId/mkdir  body: { path, recursive? }
filesRoutes.post("/:siteId/mkdir", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const { path: remotePath, recursive = true } = req.body;
    if (!remotePath) { res.status(400).json({ error: "Se requiere path" }); return; }

    const conn = await getConnectionForSite(sc.siteId, sc.config);
    await conn.mkdir(remotePath, recursive);

    res.json({ success: true, path: remotePath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al crear directorio" });
  }
});

// Helper compartido para eliminar archivos/directorios
async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    // Soporta path via body (POST) o query param (DELETE)
    const remotePath = req.body?.path || (req.query.path as string);
    const type = req.body?.type || (req.query.type as string) || "file";
    const force = req.body?.force || req.query.force === "true" || false;

    if (!remotePath) { res.status(400).json({ error: "Se requiere path" }); return; }

    const conn = await getConnectionForSite(sc.siteId, sc.config);
    if (type === "directory") {
      await conn.deleteDir(remotePath, force);
    } else {
      await conn.deleteFile(remotePath);
    }

    res.json({ success: true, path: remotePath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al eliminar" });
  }
}

// POST /:siteId/delete  body: { path, type: "file"|"directory", force? }
filesRoutes.post("/:siteId/delete", handleDelete);

// DELETE /:siteId/delete?path=./file.txt&type=file  (alternativo, usado por el frontend)
filesRoutes.delete("/:siteId/delete", handleDelete);

// POST /:siteId/rename  body: { oldPath, newPath }
filesRoutes.post("/:siteId/rename", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      res.status(400).json({ error: "Se requieren oldPath y newPath" });
      return;
    }

    const conn = await getConnectionForSite(sc.siteId, sc.config);
    await conn.rename(oldPath, newPath);

    res.json({ success: true, oldPath, newPath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al renombrar" });
  }
});

// GET /:siteId/search?path=.&pattern=*.php&maxDepth=3
filesRoutes.get("/:siteId/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const sc = await getSiteConfig(req, res);
    if (!sc) return;

    const remotePath = (req.query.path as string) || ".";
    const pattern = (req.query.pattern as string) || "*";
    const maxDepth = Math.min(Number(req.query.maxDepth) || 3, 10);
    const maxResults = Math.min(Number(req.query.maxResults) || 50, 200);

    const conn = await getConnectionForSite(sc.siteId, sc.config);
    const results = await conn.search(remotePath, pattern, maxDepth, maxResults);

    res.json({ files: results, results, pattern, path: remotePath });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error en busqueda" });
  }
});
