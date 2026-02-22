/*
 * Archivo: session.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Gestion de sesiones web con tokens aleatorios y expiracion 24h
 * Ruta: ftp-mcp-server-open/src/auth/session.ts
 */

import { randomBytes } from "node:crypto";
import { getDatabase } from "../config/database.js";
import { logToStderr } from "../services/file.utils.js";

const SESSION_TOKEN_BYTES = 32;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas

// Crea una nueva sesion para un usuario y retorna el token
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  const db = getDatabase();
  await db.session.create({
    data: { userId, token, expiresAt },
  });

  logToStderr(`[SESSION] Sesion creada para usuario ${userId}`);
  return token;
}

// Valida un token de sesion y retorna el userId si es valido
export async function validateSession(token: string): Promise<string | null> {
  if (!token || typeof token !== "string" || token.trim().length === 0) return null;

  const db = getDatabase();
  const session = await db.session.findUnique({ where: { token } });

  if (!session) return null;

  // Verificar expiracion
  if (new Date() > session.expiresAt) {
    await db.session.delete({ where: { id: session.id } }).catch((err) => {
      logToStderr(`[SESSION] Error eliminando sesion expirada: ${err instanceof Error ? err.message : String(err)}`);
    });
    logToStderr(`[SESSION] Sesion expirada eliminada para usuario ${session.userId}`);
    return null;
  }

  return session.userId;
}

// Elimina una sesion por token (logout)
export async function destroySession(token: string): Promise<void> {
  const db = getDatabase();
  await db.session.delete({ where: { token } }).catch((err) => {
    logToStderr(`[SESSION] Error eliminando sesion: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// Elimina todas las sesiones de un usuario
export async function destroyAllSessions(userId: string): Promise<void> {
  const db = getDatabase();
  await db.session.deleteMany({ where: { userId } });
}

// Limpia sesiones expiradas (para uso periodico)
export async function cleanExpiredSessions(): Promise<number> {
  const db = getDatabase();
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (result.count > 0) {
    logToStderr(`[SESSION] ${result.count} sesiones expiradas limpiadas`);
  }
  return result.count;
}
