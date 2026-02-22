/*
 * Archivo: password.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Funciones de hashing y verificacion de contrasenas con bcrypt
 * Ruta: ftp-mcp-server-open/src/auth/password.ts
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

// Hashea una contrasena con bcrypt (cost factor 12)
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verifica una contrasena contra su hash bcrypt
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
