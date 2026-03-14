/*
 * Archivo: navigation.tools.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Herramientas MCP para navegacion: ftp_list_directory, ftp_search_files, ftp_get_file_info
 * Ruta: ftp-mcp-server-open/src/tools/navigation.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDirectorySchema, searchFilesSchema, getFileInfoSchema } from "../schemas/navigation.schema.js";
import { ConnectionManager, getSelectedSiteConfig, getConnectionForSite, invalidateSiteConnection } from "../services/connection.manager.js";
import { getMimeType, logToStderr } from "../services/file.utils.js";
import { formatDirectoryListing, formatSearchResults, formatFileInfo } from "../helpers/format.helper.js";
import { formatFileError, formatNotConnectedError, formatPathError } from "../helpers/error.helper.js";
import type { FileEntry, SortOption } from "../types.js";

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

// Obtiene un ConnectionManager para el contexto actual (remoto o local)
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

// Ordena entradas de directorio según criterio
function sortEntries(entries: FileEntry[], sortBy: SortOption): FileEntry[] {
  const sorted = [...entries];
  switch (sortBy) {
    case "name": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "size": sorted.sort((a, b) => b.size - a.size); break;
    case "date": sorted.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()); break;
  }
  sorted.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return 0;
  });
  return sorted;
}

// Detecta si un error es de conexion rota
function isConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg === "NOT_CONNECTED" ||
    msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") || msg.includes("EPIPE") ||
    msg.includes("socket") || msg.includes("closed") ||
    msg.includes("timeout") || msg.includes("No response") ||
    msg.includes("connection")
  );
}

// Maneja errores de navegacion con deteccion de tipo + invalidacion de conexion
async function handleNavError(operation: string, path: string, error: unknown, siteId: string | null): Promise<string> {
  const msg = error instanceof Error ? error.message : String(error);

  if (siteId && isConnectionError(error)) {
    await invalidateSiteConnection(siteId);
    logToStderr(`[NAV] Conexión invalidada tras error en ${operation}: ${msg}`);
    return `## ❌ Error de conexión FTP\n\nLa conexión se perdió durante **${operation}** en \`${path}\`.\n\n**Motivo:** ${msg}\n\n> La conexión se reconectará automáticamente en el próximo intento.`;
  }

  if (msg === "NOT_CONNECTED") return formatNotConnectedError();
  if (msg.startsWith("PATH_NOT_ALLOWED:")) {
    return formatPathError(msg.split(":")[1] ?? path, "La ruta está fuera del sandbox permitido");
  }
  return formatFileError(operation, path, error);
}

// Registra todas las herramientas de navegacion en el servidor MCP
// enabledTools: si se pasa, solo registra las herramientas incluidas en el Set
export function registerNavigationTools(server: McpServer, enabledTools?: Set<string>): void {
  const shouldRegister = (toolId: string) => !enabledTools || enabledTools.has(toolId);

  // Tool: ftp_list_directory — Lista archivos y directorios
  if (shouldRegister("ftp_list_directory")) server.tool(
    "ftp_list_directory",
    "Lista archivos y directorios en la ruta especificada. Muestra nombre, tipo, tamaño, fecha de modificación",
    listDirectorySchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const { manager } = ctx;
        siteId = ctx.siteId;

        const entries = await manager.list(params.path);
        let filtered = params.show_hidden ? entries : entries.filter((e) => !e.name.startsWith("."));
        filtered = sortEntries(filtered, params.sort_by);
        const resolvedPath = manager.resolvePath(params.path);

        return { content: [{ type: "text" as const, text: formatDirectoryListing(resolvedPath, filtered) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleNavError("Listar directorio", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_search_files — Busqueda recursiva por patron
  if (shouldRegister("ftp_search_files")) server.tool(
    "ftp_search_files",
    "Busca archivos recursivamente por patrón de nombre o extensión dentro del directorio especificado",
    searchFilesSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const { manager } = ctx;
        siteId = ctx.siteId;

        const results = await manager.search(params.path, params.pattern, params.max_depth, params.max_results);
        const resolvedPath = manager.resolvePath(params.path);

        return { content: [{ type: "text" as const, text: formatSearchResults(params.pattern, resolvedPath, results) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleNavError("Buscar archivos", params.path, error, siteId) }], isError: true };
      }
    }
  );

  // Tool: ftp_get_file_info — Informacion detallada de un archivo
  if (shouldRegister("ftp_get_file_info")) server.tool(
    "ftp_get_file_info",
    "Obtiene información detallada de un archivo: tamaño, permisos, fecha de modificación, tipo MIME estimado",
    getFileInfoSchema.shape,
    async (params, extra) => {
      let siteId: string | null = null;
      try {
        const ctx = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!ctx) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }
        const { manager } = ctx;
        siteId = ctx.siteId;

        const info = await manager.stat(params.path);
        info.mimeType = getMimeType(params.path);

        return { content: [{ type: "text" as const, text: formatFileInfo(info) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: await handleNavError("Obtener información", params.path, error, siteId) }], isError: true };
      }
    }
  );
}
