/*
 * Archivo: navigation.tools.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Herramientas MCP para navegación: ftp_list_directory, ftp_search_files, ftp_get_file_info
 * Ruta: ftp-mcp-server-open/src/tools/navigation.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDirectorySchema, searchFilesSchema, getFileInfoSchema } from "../schemas/navigation.schema.js";
import { ConnectionManager, getSelectedSiteConfig, getConnectionForSite } from "../services/connection.manager.js";
import { getMimeType } from "../services/file.utils.js";
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

// Obtiene un ConnectionManager para el contexto actual (remoto o local)
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

// Maneja errores de navegación con detección de tipo
function handleNavError(operation: string, path: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === "NOT_CONNECTED") return formatNotConnectedError();
  if (msg.startsWith("PATH_NOT_ALLOWED:")) {
    return formatPathError(msg.split(":")[1] ?? path, "La ruta está fuera del sandbox permitido");
  }
  return formatFileError(operation, path, error);
}

// Registra todas las herramientas de navegación en el servidor MCP
export function registerNavigationTools(server: McpServer): void {

  // Tool: ftp_list_directory — Lista archivos y directorios
  server.tool(
    "ftp_list_directory",
    "Lista archivos y directorios en la ruta especificada. Muestra nombre, tipo, tamaño, fecha de modificación",
    listDirectorySchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }

        const entries = await manager.list(params.path);
        let filtered = params.show_hidden ? entries : entries.filter((e) => !e.name.startsWith("."));
        filtered = sortEntries(filtered, params.sort_by);
        const resolvedPath = manager.resolvePath(params.path);

        return { content: [{ type: "text" as const, text: formatDirectoryListing(resolvedPath, filtered) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleNavError("Listar directorio", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_search_files — Búsqueda recursiva por patrón
  server.tool(
    "ftp_search_files",
    "Busca archivos recursivamente por patrón de nombre o extensión dentro del directorio especificado",
    searchFilesSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }

        const results = await manager.search(params.path, params.pattern, params.max_depth, params.max_results);
        const resolvedPath = manager.resolvePath(params.path);

        return { content: [{ type: "text" as const, text: formatSearchResults(params.pattern, resolvedPath, results) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleNavError("Buscar archivos", params.path, error) }], isError: true };
      }
    }
  );

  // Tool: ftp_get_file_info — Información detallada de un archivo
  server.tool(
    "ftp_get_file_info",
    "Obtiene información detallada de un archivo: tamaño, permisos, fecha de modificación, tipo MIME estimado",
    getFileInfoSchema.shape,
    async (params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (!manager) {
          return { content: [{ type: "text" as const, text: NO_SITE_MSG }], isError: true };
        }

        const info = await manager.stat(params.path);
        info.mimeType = getMimeType(params.path);

        return { content: [{ type: "text" as const, text: formatFileInfo(info) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleNavError("Obtener información", params.path, error) }], isError: true };
      }
    }
  );
}
