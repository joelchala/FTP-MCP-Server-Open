/*
 * Archivo: settings.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: API REST para configuracion de perfil y contrasena
 * Ruta: ftp-mcp-server-open/src/routes/settings.routes.ts
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { destroyAllSessions } from "../auth/session.js";

export const settingsRoutes = Router();

// GET /profile — Datos del usuario
settingsRoutes.get("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error" });
  }
});

// PUT /profile — Actualizar nombre
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

settingsRoutes.put("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const db = getDatabase();
    const user = await db.user.update({
      where: { id: userId },
      data: { name: parsed.data.name },
      select: { id: true, email: true, name: true },
    });

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al actualizar" });
  }
});

// PUT /password — Cambiar contrasena
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

settingsRoutes.put("/password", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const db = getDatabase();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

    // Verificar contrasena actual
    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Contrasena actual incorrecta" });
      return;
    }

    // Hashear nueva contrasena
    const newHash = await hashPassword(parsed.data.newPassword);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    res.json({ message: "Contrasena actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error al cambiar contrasena" });
  }
});

// DELETE /sessions — Cerrar todas las sesiones
settingsRoutes.delete("/sessions", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    await destroyAllSessions(userId);
    res.json({ message: "Todas las sesiones han sido cerradas" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Error" });
  }
});
