/*
 * Archivo: env-loader.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Carga variables de entorno desde .env
 * Ruta: ftp-mcp-server-open/src/env-loader.ts
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const __file = fileURLToPath(import.meta.url);
  const rootDir = join(dirname(__file), "..");
  const envPath = join(rootDir, ".env");
  const envProdPath = join(rootDir, ".env.production");

  if (existsSync(envPath)) {
    config({ path: envPath });
  } else if (existsSync(envProdPath)) {
    config({ path: envProdPath });
  }
  // Si no existe ninguno, no hacer nada — las env vars pueden estar en process.env
} catch {
  // Silenciar errores — las env vars pueden estar definidas en el entorno
}
