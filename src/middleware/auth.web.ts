/*
 * Archivo: auth.web.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Middleware Express para autenticar usuarios del panel web via cookie de sesion
 * Ruta: ftp-mcp-server-open/src/middleware/auth.web.ts
 */

import type { Request, Response, NextFunction } from "express";
import { validateSession } from "../auth/session.js";
import { getDatabase } from "../config/database.js";
import { logToStderr } from "../services/file.utils.js";

// Interfaz para usuario autenticado adjuntado al request
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

// Extiende el tipo Request de Express con el usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const SESSION_COOKIE_NAME = "session_token";

// Middleware de autenticacion para rutas del panel web
// Verifica la cookie de sesion y resuelve el usuario en la DB
export async function webAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "No autenticado. Inicia sesion." });
      return;
    }

    // Validar sesion
    const userId = await validateSession(token);
    if (!userId) {
      // Cookie invalida o expirada, limpiar
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(401).json({ error: "Sesion expirada. Inicia sesion nuevamente." });
      return;
    }

    // Obtener usuario de DB
    const db = getDatabase();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(401).json({ error: "Usuario no encontrado." });
      return;
    }

    // Adjuntar usuario al request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (error) {
    logToStderr(`[AUTH-WEB] Error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(401).json({ error: "Error de autenticacion." });
  }
}
