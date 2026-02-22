/*
 * Archivo: encryption.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Funciones AES-256-GCM para encriptar/desencriptar credenciales FTP
 * Ruta: ftp-mcp-server-open/src/config/encryption.ts
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Obtiene la clave de encriptación desde las variables de entorno
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "ENCRYPTION_KEY no configurada o inválida. Debe ser un hex valido de 64 caracteres (32 bytes)."
    );
  }
  return Buffer.from(key, "hex");
}

// Encripta un texto usando AES-256-GCM
// Retorna formato: iv:authTag:ciphertext (todo en base64)
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

// Desencripta un texto encriptado con AES-256-GCM
// Recibe formato: iv:authTag:ciphertext (todo en base64)
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");

  if (parts.length !== 3) {
    throw new Error("Formato de texto encriptado inválido");
  }

  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const ciphertext = parts[2]!;

  if (iv.length !== IV_LENGTH) {
    throw new Error("IV inválido");
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Auth tag inválido");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    throw new Error("Error al desencriptar: datos corruptos o clave incorrecta");
  }
}
