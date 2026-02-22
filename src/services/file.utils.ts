/*
 * Archivo: file.utils.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Utilidades para validación de rutas, truncado de contenido y detección de encoding
 * Ruta: ftp-mcp-server-open/src/services/file.utils.ts
 */

import path from "node:path";
import { MIME_MAP } from "../constants.js";

// Sanitiza y resuelve una ruta relativa contra la ruta base
export function sanitizePath(userPath: string, basePath: string): string {
  // Normalizar separadores a /
  const normalized = userPath.replace(/\\/g, "/");

  // Si es ruta absoluta, usarla directamente; si no, resolver contra basePath
  let resolved: string;
  if (normalized.startsWith("/")) {
    resolved = path.posix.normalize(normalized);
  } else {
    resolved = path.posix.normalize(path.posix.join(basePath, normalized));
  }

  return resolved;
}

// Verifica que una ruta resuelta esté dentro de la ruta base (sandbox)
export function isPathAllowed(resolvedPath: string, basePath: string): boolean {
  // Normalizar y remover trailing slash para consistencia
  const normalizedBase = path.posix.normalize(basePath).replace(/\/$/, "");
  const normalizedPath = path.posix.normalize(resolvedPath).replace(/\/$/, "");

  // La ruta debe comenzar con la ruta base o ser exactamente la ruta base
  return normalizedPath === normalizedBase || normalizedPath.startsWith(normalizedBase + "/");
}

// Verifica que la extensión del archivo esté en la lista de permitidas
export function isExtensionAllowed(filePath: string, allowed: string[]): boolean {
  const ext = path.posix.extname(filePath).toLowerCase();
  const baseName = path.posix.basename(filePath);

  // Rechazar "." y ".."
  if (baseName === "." || baseName === "..") return false;

  // Archivos sin extensión como .htaccess
  if (ext === "" && baseName.startsWith(".")) {
    return allowed.includes(baseName);
  }

  return allowed.includes(ext);
}

// Obtiene el tipo MIME estimado basado en la extensión
export function getMimeType(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

// Trunca contenido por rango de líneas
export function truncateByLines(
  content: string,
  lineStart?: number,
  lineEnd?: number
): { content: string; totalLines: number; truncated: boolean; actualStart: number; actualEnd: number } {
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (lineStart === undefined && lineEnd === undefined) {
    return { content, totalLines, truncated: false, actualStart: 1, actualEnd: totalLines };
  }

  const start = Math.max(1, lineStart ?? 1);
  const end = Math.min(totalLines, lineEnd ?? totalLines);

  if (start > totalLines) {
    return { content: "", totalLines, truncated: true, actualStart: start, actualEnd: end };
  }

  const sliced = lines.slice(start - 1, end).join("\n");
  return {
    content: sliced,
    totalLines,
    truncated: start > 1 || end < totalLines,
    actualStart: start,
    actualEnd: Math.min(end, totalLines),
  };
}

// Verifica si un patrón glob coincide con un nombre de archivo (simple)
export function matchesPattern(fileName: string, pattern: string): boolean {
  // Convertir patrón glob simple a regex
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(fileName);
}

// Genera un nombre de backup con timestamp
export function generateBackupName(filePath: string): string {
  const timestamp = Date.now();
  const dir = path.posix.dirname(filePath);
  const baseName = path.posix.basename(filePath);
  return path.posix.join(dir, `${baseName}.${timestamp}.bak`);
}

// Registra un mensaje en stderr (no stdout, para compatibilidad con stdio)
export function logToStderr(message: string): void {
  process.stderr.write(`[ftp-mcp-server] ${message}\n`);
}
