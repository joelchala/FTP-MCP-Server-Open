/*
 * Archivo: oauth-credentials.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Generacion y verificacion de credenciales OAuth (Client ID + Secret)
 * Ruta: ftp-mcp-server-open/src/auth/oauth-credentials.ts
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const CLIENT_ID_PREFIX = "ftpmcp_";
const CLIENT_ID_HEX_LENGTH = 24; // 24 hex chars = 12 bytes
const CLIENT_SECRET_HEX_LENGTH = 48; // 48 hex chars = 24 bytes

// Genera un nuevo Client ID con formato ftpmcp_ + 24 hex chars
export function generateClientId(): string {
  const hex = randomBytes(CLIENT_ID_HEX_LENGTH / 2).toString("hex");
  return `${CLIENT_ID_PREFIX}${hex}`;
}

// Genera un nuevo Client Secret (48 hex chars)
export function generateClientSecret(): string {
  return randomBytes(CLIENT_SECRET_HEX_LENGTH / 2).toString("hex");
}

// Hashea un Client Secret con bcrypt para almacenamiento seguro
export async function hashClientSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

// Verifica un Client Secret contra su hash almacenado
export async function verifyClientSecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

// Genera un preview del secret (primeros 8 chars + ...)
export function getSecretPreview(secret: string): string {
  return `${secret.substring(0, 8)}...`;
}
