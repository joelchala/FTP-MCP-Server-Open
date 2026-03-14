/*
 * Archivo: connection.tools.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Herramientas MCP para conexión: ftp_connect, ftp_disconnect, ftp_status
 * Ruta: ftp-mcp-server-open/src/tools/connection.tools.ts
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectSchema, disconnectSchema, statusSchema } from "../schemas/connection.schema.js";
import { ConnectionManager, getSelectedSiteConfig, getConnectionForSite, loadEnvConfig } from "../services/connection.manager.js";
import { formatConnectSuccess, formatDisconnectSuccess, formatConnectionStatus } from "../helpers/format.helper.js";
import { formatConnectionError, getErrorMessage } from "../helpers/error.helper.js";
import { logToStderr } from "../services/file.utils.js";

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
    // Modo remoto: obtener sitio seleccionado
    const siteConfig = await getSelectedSiteConfig(userId);
    if (!siteConfig) return null;
    return getConnectionForSite(siteConfig.siteId, siteConfig.config);
  }
  // Modo local (stdio)
  return ConnectionManager.getLocalInstance();
}

// Mensaje de error cuando no hay sitio seleccionado
const NO_SITE_ERROR = "## ❌ No hay sitio FTP seleccionado\n- Usa `ftp_list_sites` para ver tus sitios configurados.\n- Luego usa `ftp_select_site` para seleccionar uno.";

// Registra todas las herramientas de conexion en el servidor MCP
// enabledTools: si se pasa, solo registra las herramientas incluidas en el Set
export function registerConnectionTools(server: McpServer, enabledTools?: Set<string>): void {
  const shouldRegister = (toolId: string) => !enabledTools || enabledTools.has(toolId);

  // Tool: ftp_connect — Conecta al servidor FTP/SFTP
  if (shouldRegister("ftp_connect")) server.tool(
    "ftp_connect",
    "Conecta al servidor FTP/SFTP. En modo remoto usa el sitio seleccionado; en modo local usa .env o parámetros.",
    connectSchema.shape,
    async (params, extra) => {
      try {
        const userId = getUserIdFromExtra(extra as unknown as Record<string, unknown>);

        if (userId) {
          // Modo remoto: conectar al sitio seleccionado
          const siteConfig = await getSelectedSiteConfig(userId);
          if (!siteConfig) {
            return { content: [{ type: "text" as const, text: NO_SITE_ERROR }], isError: true };
          }
          const manager = await getConnectionForSite(siteConfig.siteId, siteConfig.config);
          const status = manager.getStatus();
          return {
            content: [{ type: "text" as const, text: formatConnectSuccess(
              status.host ?? "", status.port ?? 0, status.protocol ?? "sftp", status.basePath ?? ""
            )}],
          };
        }

        // Modo local (stdio)
        const overrides: Record<string, unknown> = {};
        if (params.host) overrides.host = params.host;
        if (params.port) overrides.port = params.port;
        if (params.user) overrides.user = params.user;
        if (params.password) overrides.password = params.password;
        if (params.protocol) overrides.protocol = params.protocol;

        const manager = await ConnectionManager.connectLocal(overrides);
        const status = manager.getStatus();
        return {
          content: [{ type: "text" as const, text: formatConnectSuccess(
            status.host ?? "", status.port ?? 0, status.protocol ?? "sftp", status.basePath ?? ""
          )}],
        };
      } catch (error) {
        const env = loadEnvConfig();
        return {
          content: [{ type: "text" as const, text: formatConnectionError(error, params.host ?? env.host, params.protocol ?? env.protocol) }],
          isError: true,
        };
      }
    }
  );

  // Tool: ftp_disconnect — Cierra la conexion activa
  if (shouldRegister("ftp_disconnect")) server.tool(
    "ftp_disconnect",
    "Cierra la conexión activa al servidor FTP/SFTP",
    disconnectSchema.shape,
    async (_params, extra) => {
      try {
        const userId = getUserIdFromExtra(extra as unknown as Record<string, unknown>);
        if (userId) {
          // En modo remoto las conexiones se gestionan por cache, informar al usuario
          return {
            content: [{ type: "text" as const, text: formatDisconnectSuccess() }],
          };
        }
        await ConnectionManager.disconnectLocal();
        return { content: [{ type: "text" as const, text: formatDisconnectSuccess() }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `## ❌ Error al desconectar\n- ${getErrorMessage(error)}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: ftp_status — Muestra el estado actual de la conexion
  if (shouldRegister("ftp_status")) server.tool(
    "ftp_status",
    "Muestra el estado actual de la conexión (conectado/desconectado, host, protocolo, ruta base)",
    statusSchema.shape,
    async (_params, extra) => {
      try {
        const manager = await getManagerForContext(extra as unknown as Record<string, unknown>);
        if (manager) {
          return { content: [{ type: "text" as const, text: formatConnectionStatus(manager.getStatus()) }] };
        }
        // Sin conexión activa
        return { content: [{ type: "text" as const, text: formatConnectionStatus({ connected: false }) }] };
      } catch {
        return { content: [{ type: "text" as const, text: formatConnectionStatus({ connected: false }) }] };
      }
    }
  );
}
