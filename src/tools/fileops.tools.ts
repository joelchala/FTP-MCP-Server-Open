/*
 * Archivo: fileops.tools.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Herramientas MCP para operaciones de archivos: read, write, create_dir, delete, rename
 * Ruta: ftp-mcp-server-open/src/tools/fileops.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readFileSchema, writeFileSchema, createDirectorySchema,
  deleteFileSchema, deleteDirectorySchema, renameSchema,
} from "../schemas/fileops.schema.js";
import { ConnectionManager, getSelectedSiteConfig, getConnectionForSite, loadEnvConfig, invalidateSiteConnection } from "../services/connection.manager.js";
import { isExtensionAllowed, truncateByLines, generateBackupName, logToStderr } from "../services/file.utils.js";
import { formatFileRead, formatFileWrite, formatDirCreated, formatDeleted, formatRenamed } from "../helpers/format.helper.js";
import {
  formatFileError, formatNotConnectedError, formatPathError,
  formatExtensionError, formatSizeError,
} from "../helpers/error.helper.js";

// Extrae el userId del extra.authInfo del SDK MCP
function getUserIdFromExtra(extra: Record<string, unknown>): string | null {
  const authInfo = extra.authInfo as Record<string, unknown> | undefined;
  if (!authInfo) return null;
  const extraData = authInfo.extra as Record<string, unknown> | undefined;
  return (extraData?.userId as string) ?? null;
}

// Resultado de obtener manager + siteId
interface ManagerContext {
  manager: ConnectionManager;
  siteId: string | null;
}

// Obtiene un ConnectionManager para el contexto actual (devuelve tambien siteId para invalidacion)
async function getManagerForContext(extra: Record<string, unknown>): Promise<ManagerContext | null> {
  const userId = getUserIdFromExtra(extra);
  if (userId) {
    const siteConfig = await getSelectedSiteConfig(userId);
    if (!siteConfig) return null;
    const manager = await getConnectionForSite(siteConfig.siteId, siteConfig.config);
    return { manager, siteId: siteConfig.siteId };
  }
  const localManager = ConnectionManager.getLocalInstance();
  return localManager ? { manager: localManager, siteId: null } : null;
}

const NO_SITE_MSG = "## ❌ No hay sitio FTP seleccionado\n- Usa `ftp_list_sites` y `ftp_select_site` primero.";

// Detecta si un error es de conexion rota (para invalidar cache)
function isConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg === "NOT_CONNECTED" ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("EPIPE") ||
    msg.includes("socket") ||
    msg.includes("closed") ||
    msg.includes("timeout") ||
    msg.includes("No response") ||
    msg.includes("connection")
  );
}

// Maneja errores comunes de operaciones de archivo + invalida cache si es error de conexion
async function handleFileError(operation: string, path: string, error: unknown, siteId: string | null): Promise<string> {
  const msg = error instanceof Error ? error.message : String(error);

  // Si es error de conexion, invalidar cache para forzar reconexion en siguiente request
  if (siteId && isConnectionError(error)) {
    await invalidateSiteConnection(siteId);
    logToStderr(`[FILEOPS] Conexión invalidada tras error en ${operation}: ${msg}`);
    return `## ❌ Error de conexión FTP\n\nLa conexión se perdió durante la operación **${operation}** en \`${path}\`.\n\n**Motivo:** ${msg}\n\n> La conexión se reconectará automáticamente en el próximo intento. Vuelve a ejecutar la operación.`;
  }

  if (msg === "NOT_CONNECTED") return formatNotConnectedError();
  if (msg.startsWith("PATH_NOT_ALLOWED:")) {
    return formatPathError(msg.split(":")[1] ?? path, "La ruta está fuera del sandbox permitido");
  }
  return formatFileError(operation, path, error);
}

// Registra todas las herramientas de operaciones de archivos
// enabledTools: si se pasa, solo registra las herramientas incluidas en el Set
export function registerFileOpsTools(server: McpServer, enabledTools?: Set<string>): void {
  const shouldRegister = (toolId: string) => !enabledTools || enabledTools.has(toolId);

  // Tool: ftp_read_file — Lee contenido de un archivo de texto
  if (shouldRegister("ftp_read_file")) server.tool(
    "ftp_read_file",
    "Lee y retorna el contenido de un archivo de texto. Trunca si excede el límite configurado",
    readFileSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const { manager } = ctx;
        siteId = ctx.siteId;

        const env = manager.getEnvConfig();
        const info = await manager.stat(params.path);
        if (info.size > env.maxFileSize) {
          return { content: [{ type: "text" as const, text: formatSizeError(params.path, info.size, env.maxFileSize) }], isError: true };
        }

        const buffer = await manager.read(params.path);
        const encoding = params.encoding as BufferEncoding;
        const rawContent = buffer.toString(encoding);
        const result = truncateByLines(rawContent, params.line_start, params.line_end);
        const resolvedPath = manager.resolvePath(params.path);

        return {
          content: [{
            type: "text" as const,
            text: formatFileRead(resolvedPath, {
              content: result.content, totalLines: result.totalLines, truncated: result.truncated,
              encoding: params.encoding, size: info.size, lineStart: result.actualStart, lineEnd: result.actualEnd,
            }),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Leer archivo", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_write_file — Escribe contenido en un archivo
  if (shouldRegister("ftp_write_file")) server.tool(
    "ftp_write_file",
    "Escribe contenido en un archivo (crea nuevo o sobrescribe existente). Crea backup automático antes de sobrescribir.",
    writeFileSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const { manager } = ctx;
        siteId = ctx.siteId;

        const env = manager.getEnvConfig();
        if (!isExtensionAllowed(params.path, env.allowedExtensions)) {
          return { content: [{ type: "text" as const, text: formatExtensionError(params.path, env.allowedExtensions) }], isError: true };
        }

        // Convertir el contenido a buffer sin limites adicionales.
        // El unico limite real viene del servidor FTP/SFTP.
        const contentBuffer = Buffer.from(params.content, "utf-8");
        const resolvedPath = manager.resolvePath(params.path);
        let backupCreated = false;
        let backupPath: string | undefined;

        if (params.create_backup) {
          const fileExists = await manager.exists(params.path);
          if (fileExists) {
            // Verificar talla antes de leer para el backup
            const info = await manager.stat(params.path);
            if (info.size <= env.maxFileSize) {
              const existingContent = await manager.read(params.path);
              backupPath = generateBackupName(resolvedPath);
              await manager.write(backupPath, existingContent);
              backupCreated = true;
            } else {
              // Si el archivo es demasiado grande, saltar backup con aviso
              backupPath = generateBackupName(resolvedPath);
              const warning = Buffer.from("<backup skipped – file too large>\n", "utf-8");
              await manager.write(backupPath, warning);
              backupCreated = true;
            }
          }
        }

        await manager.write(params.path, contentBuffer);

        return {
          content: [{
            type: "text" as const,
            text: formatFileWrite({ path: resolvedPath, size: contentBuffer.length, backupCreated, backupPath }),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Escribir archivo", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_create_directory — Crea un nuevo directorio
  if (shouldRegister("ftp_create_directory")) server.tool(
    "ftp_create_directory",
    "Crea un nuevo directorio (soporta creación recursiva)",
    createDirectorySchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        siteId = ctx.siteId;
        await ctx.manager.mkdir(params.path, params.recursive);
        return { content: [{ type: "text" as const, text: formatDirCreated(ctx.manager.resolvePath(params.path)) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Crear directorio", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_delete_file — Elimina un archivo
  if (shouldRegister("ftp_delete_file")) server.tool(
    "ftp_delete_file",
    "Elimina un archivo del servidor",
    deleteFileSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        siteId = ctx.siteId;
        const resolvedPath = ctx.manager.resolvePath(params.path);
        await ctx.manager.deleteFile(params.path);
        return { content: [{ type: "text" as const, text: formatDeleted(resolvedPath, "archivo") }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Eliminar archivo", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_delete_directory — Elimina un directorio
  if (shouldRegister("ftp_delete_directory")) server.tool(
    "ftp_delete_directory",
    "Elimina un directorio (debe estar vacío a menos que se especifique force)",
    deleteDirectorySchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        siteId = ctx.siteId;
        const resolvedPath = ctx.manager.resolvePath(params.path);
        await ctx.manager.deleteDir(params.path, params.force);
        return { content: [{ type: "text" as const, text: formatDeleted(resolvedPath, "directorio") }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Eliminar directorio", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_rename — Renombra o mueve un archivo/directorio
  if (shouldRegister("ftp_rename")) server.tool(
    "ftp_rename",
    "Renombra o mueve un archivo/directorio",
    renameSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        siteId = ctx.siteId;
        const oldResolved = ctx.manager.resolvePath(params.old_path);
        const newResolved = ctx.manager.resolvePath(params.new_path);
        await ctx.manager.rename(params.old_path, params.new_path);
        return { content: [{ type: "text" as const, text: formatRenamed(oldResolved, newResolved) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleFileError("Renombrar/Mover", params.old_path, error, siteId) }], isError: true };
      }
    }
  );
}
