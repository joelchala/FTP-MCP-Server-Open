/*
 * Archivo: site.tools.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Herramientas MCP para listar y seleccionar sitios FTP del usuario
 * Ruta: ftp-mcp-server-open/src/tools/site.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listSitesSchema, selectSiteSchema } from "../schemas/site.schema.js";
import { getDatabase } from "../config/database.js";
import { siteSelectionStore } from "../services/connection.manager.js";
import { logToStderr } from "../services/file.utils.js";

// Extrae el userId del extra.authInfo del SDK MCP
function getUserIdFromExtra(extra: Record<string, unknown>): string | null {
  const authInfo = extra.authInfo as Record<string, unknown> | undefined;
  if (!authInfo) return null;
  const extraData = authInfo.extra as Record<string, unknown> | undefined;
  return (extraData?.userId as string) ?? null;
}

// Registra las herramientas de gestión de sitios en el servidor MCP
export function registerSiteTools(server: McpServer): void {

  // Tool: ftp_list_sites — Lista los sitios FTP del usuario
  server.tool(
    "ftp_list_sites",
    "Lista los sitios FTP configurados por el usuario. Muestra ID, nombre, host y protocolo de cada sitio.",
    listSitesSchema.shape,
    async (_params, extra) => {
      try {
        const userId = getUserIdFromExtra(extra as unknown as Record<string, unknown>);
        if (!userId) {
          return {
            content: [{ type: "text" as const, text: "## ❌ Error: No autenticado\n- Debes estar autenticado para listar tus sitios FTP." }],
            isError: true,
          };
        }

        const db = getDatabase();
        const sites = await db.site.findMany({
          where: { userId, isActive: true },
          select: { id: true, name: true, host: true, port: true, protocol: true, basePath: true },
          orderBy: { createdAt: "desc" },
        });

        if (sites.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "## 📋 No hay sitios FTP configurados\n\nNo tienes sitios FTP registrados. Ve al panel web para agregar uno.",
            }],
          };
        }

        // Obtener el sitio actualmente seleccionado
        const selection = siteSelectionStore.get(userId);
        const selectedId = selection?.siteId;

        const lines = ["## 📋 Tus sitios FTP", ""];
        for (const site of sites) {
          const selected = site.id === selectedId ? " ✅ (seleccionado)" : "";
          lines.push(`- **${site.name}**${selected}`);
          lines.push(`  - ID: \`${site.id}\``);
          lines.push(`  - Host: ${site.host}:${site.port}`);
          lines.push(`  - Protocolo: ${site.protocol.toUpperCase()}`);
          lines.push(`  - Ruta base: ${site.basePath}`);
          lines.push("");
        }

        lines.push("Usa `ftp_select_site` con el ID del sitio para seleccionarlo.");
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        logToStderr(`Error listando sitios: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [{ type: "text" as const, text: "## ❌ Error al listar sitios\n- Error interno del servidor." }],
          isError: true,
        };
      }
    }
  );

  // Tool: ftp_select_site — Selecciona un sitio FTP para trabajar
  server.tool(
    "ftp_select_site",
    "Selecciona un sitio FTP para las operaciones posteriores. Usa ftp_list_sites para ver los IDs disponibles.",
    selectSiteSchema.shape,
    async (params, extra) => {
      try {
        const userId = getUserIdFromExtra(extra as unknown as Record<string, unknown>);
        if (!userId) {
          return {
            content: [{ type: "text" as const, text: "## ❌ Error: No autenticado\n- Debes estar autenticado." }],
            isError: true,
          };
        }

        const db = getDatabase();
        const site = await db.site.findFirst({
          where: { id: params.site_id, userId, isActive: true },
          select: { id: true, name: true, host: true, port: true, protocol: true, basePath: true },
        });

        if (!site) {
          return {
            content: [{
              type: "text" as const,
              text: "## ❌ Sitio no encontrado\n- El ID proporcionado no corresponde a ningún sitio tuyo.\n- Usa `ftp_list_sites` para ver los sitios disponibles.",
            }],
            isError: true,
          };
        }

        // Guardar selección
        siteSelectionStore.set(userId, { siteId: site.id, selectedAt: Date.now() });

        return {
          content: [{
            type: "text" as const,
            text: [
              "## ✅ Sitio seleccionado",
              `- **Nombre**: ${site.name}`,
              `- **Host**: ${site.host}:${site.port}`,
              `- **Protocolo**: ${site.protocol.toUpperCase()}`,
              `- **Ruta base**: ${site.basePath}`,
              "",
              "Ya puedes usar las herramientas FTP (ftp_connect, ftp_list_directory, etc.)",
            ].join("\n"),
          }],
        };
      } catch (error) {
        logToStderr(`Error seleccionando sitio: ${error instanceof Error ? error.message : String(error)}`);
        return {
          content: [{ type: "text" as const, text: "## ❌ Error al seleccionar sitio\n- Error interno del servidor." }],
          isError: true,
        };
      }
    }
  );
}
