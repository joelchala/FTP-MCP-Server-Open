/*
 * Archivo: fileops.tools.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Herramientas MCP para operaciones de archivos: read, write, create_dir, delete, rename
 * Ruta: ftp-mcp-server-open/src/tools/fileops.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readFileSchema, writeFileSchema, createDirectorySchema,
  deleteFileSchema, deleteDirectorySchema, renameSchema,
} from "../schemas/fileops.schema.js";
import { ConnectionManager, getSelectedSiteConfig, getConnectionForSite, loadEnvConfig } from "../services/connection.manager.js";
import { isExtensionAllowed, truncateByLines, generateBackupName } from "../services/file.utils.js";
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

// Obtiene un ConnectionManager para el contexto actual
async function getManagerForContext(extra: Record<string, unknown>): Promise<ConnectionManager | null> {
  const userId = getUserIdFromExtra(extra);
  if (userId) {
    const siteConfig = await getSelectedSiteConfig(userId);
    if (!siteConfig) return null;
    return getConnectionForSite(siteConfig.siteId, siteConfig.config);
  }
  return ConnectionManager.getLocalInstance();
}

const NO_SITE_MSG = "## ❌ No hay sitio FTP seleccionado\n- Usa `ftp_list_sites` y `ftp_select_site` primero.";

// Maneja errores comunes de operaciones de archivo
function handleFileError(operation: string, path: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === "NOT_CONNECTED") return formatNotConnectedError();
  if (msg.startsWith("PATH_NOT_ALLOWED:")) {
    return formatPathError(msg.split(":")[1] ?? path, "La ruta está fuera del sandbox permitido");
  }
  return formatFileError(operation, path, error);
}

// Registra todas las herramientas de operaciones de archivos
export function registerFileOpsTools(server: McpServer): void {

  // Tool: ftp_read_file — Lee contenido de un archivo de texto
  server.tool(
    "ftp_read_file",
    "Lee y retorna el contenido de un archivo de texto. Trunca si excede el límite configurado",
    readFileSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }

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
        return { content: [{ type: "text" as const, text: handleFileError("Leer archivo", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_write_file — Escribe contenido en un archivo
  server.tool(
    "ftp_write_file",
    "Escribe contenido en un archivo (crea nuevo o sobrescribe existente). Crea backup automático antes de sobrescribir",
    writeFileSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }

        const env = manager.getEnvConfig();
        if (!isExtensionAllowed(params.path, env.allowedExtensions)) {
          return { content: [{ type: "text" as const, text: formatExtensionError(params.path, env.allowedExtensions) }], isError: true };
        }

        const resolvedPath = manager.resolvePath(params.path);
        let backupCreated = false;
        let backupPath: string | undefined;

        if (params.create_backup) {
          const fileExists = await manager.exists(params.path);
          if (fileExists) {
            const existingContent = await manager.read(params.path);
            backupPath = generateBackupName(resolvedPath);
            await manager.write(backupPath, existingContent);
            backupCreated = true;
          }
        }

        const contentBuffer = Buffer.from(params.content, "utf-8");
        await manager.write(params.path, contentBuffer);

        return {
          content: [{
            type: "text" as const,
            text: formatFileWrite({ path: resolvedPath, size: contentBuffer.length, backupCreated, backupPath }),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleFileError("Escribir archivo", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_create_directory — Crea un nuevo directorio
  server.tool(
    "ftp_create_directory",
    "Crea un nuevo directorio (soporta creación recursiva)",
    createDirectorySchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        await manager.mkdir(params.path, params.recursive);
        return { content: [{ type: "text" as const, text: formatDirCreated(manager.resolvePath(params.path)) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleFileError("Crear directorio", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_delete_file — Elimina un archivo
  server.tool(
    "ftp_delete_file",
    "Elimina un archivo del servidor",
    deleteFileSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const resolvedPath = manager.resolvePath(params.path);
        await manager.deleteFile(params.path);
        return { content: [{ type: "text" as const, text: formatDeleted(resolvedPath, "archivo") }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleFileError("Eliminar archivo", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_delete_directory — Elimina un directorio
  server.tool(
    "ftp_delete_directory",
    "Elimina un directorio (debe estar vacío a menos que se especifique force)",
    deleteDirectorySchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const resolvedPath = manager.resolvePath(params.path);
        await manager.deleteDir(params.path, params.force);
        return { content: [{ type: "text" as const, text: formatDeleted(resolvedPath, "directorio") }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleFileError("Eliminar directorio", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_rename — Renombra o mueve un archivo/directorio
  server.tool(
    "ftp_rename",
    "Renombra o mueve un archivo/directorio",
    renameSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const oldResolved = manager.resolvePath(params.old_path);
        const newResolved = manager.resolvePath(params.new_path);
        await manager.rename(params.old_path, params.new_path);
        return { content: [{ type: "text" as const, text: formatRenamed(oldResolved, newResolved) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleFileError("Renombrar/Mover", params.old_path, error) }], isError: true };
      }
    }
  );
}
