/*
 * Archivo: database.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Inicialización y exportación del cliente Prisma para MySQL
 * Ruta: ftp-mcp-server-open/src/config/database.ts
 */

import { PrismaClient } from "@prisma/client";
import { logToStderr } from "../services/file.utils.js";

// Instancia singleton de Prisma Client
let prisma: PrismaClient;

// Obtiene o crea la instancia de Prisma Client
export function getDatabase(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { emit: "event", level: "error" },
      ],
    });

    // Registrar errores en stderr
    prisma.$on("error" as never, (e: unknown) => {
      logToStderr(`[Prisma Error] ${String(e)}`);
    });

    logToStderr("Prisma Client inicializado");
  }
  return prisma;
}

// Cierra la conexión a la base de datos
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logToStderr("Prisma Client desconectado");
  }
}
