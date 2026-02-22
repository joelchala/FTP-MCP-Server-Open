/*
 * Archivo: sites.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Rutas REST API para CRUD de sitios FTP del usuario autenticado
 * Ruta: ftp-mcp-server-open/src/routes/sites.routes.ts
 */

import { Router } from "express";
import { getDatabase } from "../config/database.js";
import { encrypt, decrypt } from "../config/encryption.js";
import { createSiteSchema, updateSiteSchema } from "../schemas/site.schema.js";
import { MAX_SITES_PER_USER } from "../constants.js";
import { logToStderr } from "../services/file.utils.js";
import { FtpClient } from "../services/ftp.client.js";
import { SftpFileClient } from "../services/sftp.client.js";
import type { ConnectionConfig, Protocol } from "../types.js";

export const sitesRoutes = Router();

// GET /api/sites — Lista sitios FTP del usuario autenticado
sitesRoutes.get("/", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const sites = await db.site.findMany({
      where: { userId },
      select: {
        id: true, name: true, host: true, port: true, protocol: true,
        username: true, basePath: true, isActive: true,
        lastTestedAt: true, testStatus: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ sites });
  } catch (error) {
    logToStderr(`Error listando sitios: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/sites — Agrega un nuevo sitio FTP
sitesRoutes.post("/", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const parsed = createSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const db = getDatabase();

    // Verificar limite de sitios
    const count = await db.site.count({ where: { userId } });
    if (count >= MAX_SITES_PER_USER) {
      res.status(400).json({ error: `Maximo ${MAX_SITES_PER_USER} sitios permitidos` });
      return;
    }

    // Encriptar contrasena antes de guardar
    const passwordEnc = encrypt(parsed.data.password);

    const site = await db.site.create({
      data: {
        userId,
        name: parsed.data.name,
        host: parsed.data.host,
        port: parsed.data.port,
        protocol: parsed.data.protocol,
        username: parsed.data.username,
        passwordEnc,
        basePath: parsed.data.basePath,
      },
      select: {
        id: true, name: true, host: true, port: true, protocol: true,
        username: true, basePath: true, isActive: true, createdAt: true,
      },
    });

    res.status(201).json({ site });
  } catch (error) {
    logToStderr(`Error creando sitio: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /api/sites/:id — Actualiza un sitio FTP
sitesRoutes.put("/:id", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const parsed = updateSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const db = getDatabase();

    const existing = await db.site.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Sitio no encontrado" });
      return;
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.password) {
      updateData.passwordEnc = encrypt(parsed.data.password);
      delete updateData.password;
    }

    const site = await db.site.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true, name: true, host: true, port: true, protocol: true,
        username: true, basePath: true, isActive: true, createdAt: true,
      },
    });

    res.json({ site });
  } catch (error) {
    logToStderr(`Error actualizando sitio: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/sites/:id — Elimina un sitio FTP
sitesRoutes.delete("/:id", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const existing = await db.site.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Sitio no encontrado" });
      return;
    }

    await db.site.delete({ where: { id: req.params.id } });
    res.json({ message: "Sitio eliminado correctamente" });
  } catch (error) {
    logToStderr(`Error eliminando sitio: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/sites/:id/test — Prueba conexion FTP del sitio
sitesRoutes.post("/:id/test", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const site = await db.site.findFirst({ where: { id: req.params.id, userId } });
    if (!site) {
      res.status(404).json({ error: "Sitio no encontrado" });
      return;
    }

    const password = decrypt(site.passwordEnc);
    const config: ConnectionConfig = {
      host: site.host, port: site.port, user: site.username, password,
      protocol: site.protocol as Protocol, basePath: site.basePath, timeout: 15000,
    };

    const client = site.protocol === "sftp" ? new SftpFileClient() : new FtpClient();

    try {
      await client.connect(config);
      const exists = await client.exists(site.basePath);

      // Actualizar estado del test
      await db.site.update({
        where: { id: site.id },
        data: { lastTestedAt: new Date(), testStatus: "success" },
      });

      res.json({ success: true, message: "Conexion exitosa", basePathExists: exists });
    } catch (connError) {
      // Actualizar estado del test
      await db.site.update({
        where: { id: site.id },
        data: { lastTestedAt: new Date(), testStatus: "failed" },
      });

      res.json({
        success: false,
        message: `Error de conexion: ${connError instanceof Error ? connError.message : String(connError)}`,
      });
    } finally {
      // Siempre cerrar la conexion de prueba para evitar resource leaks
      await client.disconnect().catch(() => {});
    }
  } catch (error) {
    logToStderr(`Error probando sitio: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
