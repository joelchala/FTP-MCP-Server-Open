/*
 * Archivo: database.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Inicializacion y exportacion del cliente Prisma con auto-recuperacion ante panics
 * Ruta: ftp-mcp-server-open/src/config/database.ts
 */

import { PrismaClient } from "@prisma/client";
import { logToStderr } from "../services/file.utils.js";

// Instancia singleton de Prisma Client
let prisma: PrismaClient;

// Flag para evitar recrear en loop
let isRecreating = false;

/**
 * Obtiene o crea la instancia de Prisma Client.
 * Si el engine anterior sufrio un panic, crea una instancia nueva automaticamente.
 */
export function getDatabase(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

/**
 * Crea una nueva instancia de PrismaClient con manejo de errores.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
    ],
  });

  // Registrar errores en stderr
  client.$on("error" as never, (e: unknown) => {
    logToStderr(`[Prisma Error] ${String(e)}`);
  });

  logToStderr("Prisma Client inicializado");
  return client;
}

/**
 * Recrea el Prisma Client tras un panic del query engine.
 * Esto permite recuperar la conexion sin necesidad de reiniciar el servidor.
 */
export async function recreatePrismaClient(): Promise<void> {
  if (isRecreating) return;
  isRecreating = true;

  try {
    logToStderr("[DB RECOVERY] Recreando Prisma Client tras error fatal...");

    // Intentar desconectar la instancia rota (puede fallar, esta bien)
    if (prisma) {
      try { await prisma.$disconnect(); } catch { /* ignorar */ }
    }

    // Crear nueva instancia
    prisma = createPrismaClient();

    // Verificar que funcione
    await prisma.$connect();
    logToStderr("[DB RECOVERY] Prisma Client recreado exitosamente");
  } catch (err) {
    logToStderr(`[DB RECOVERY] Error recreando: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    isRecreating = false;
  }
}

/**
 * Wrapper que ejecuta una query con auto-recuperacion ante panics.
 * Si detecta un PrismaClientRustPanicError, recrea el client y reintenta.
 */
export async function withDbRecovery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errName = (error as { name?: string })?.name ?? "";
    const errMsg = error instanceof Error ? error.message : String(error);

    // Detectar panic del query engine de Prisma
    if (
      errName === "PrismaClientRustPanicError" ||
      errMsg.includes("PANIC") ||
      errMsg.includes("timer has gone away") ||
      errMsg.includes("non-recoverable error")
    ) {
      logToStderr(`[DB RECOVERY] Panic detectado: ${errMsg}`);
      await recreatePrismaClient();

      // Reintentar la operacion con el nuevo client
      try {
        return await fn();
      } catch (retryErr) {
        logToStderr(`[DB RECOVERY] Reintento fallido: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        throw retryErr;
      }
    }

    throw error;
  }
}

// Cierra la conexion a la base de datos
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logToStderr("Prisma Client desconectado");
  }
}
