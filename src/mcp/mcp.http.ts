/*
 * Archivo: mcp.http.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Configura el endpoint MCP con Streamable HTTP transport y autenticacion JWT propia
 * Ruta: ftp-mcp-server-open/src/mcp/mcp.http.ts
 */

import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyMcpToken } from "../middleware/auth.mcp.js";
import { getDatabase, withDbRecovery } from "../config/database.js";
import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import { registerConnectionTools } from "../tools/connection.tools.js";
import { registerNavigationTools } from "../tools/navigation.tools.js";
import { registerFileOpsTools } from "../tools/fileops.tools.js";
import { registerSiteTools } from "../tools/site.tools.js";
import { logToStderr } from "../services/file.utils.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// Crea un servidor MCP con todas las tools registradas
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Registrar las 14 tools
  registerSiteTools(server);
  registerConnectionTools(server);
  registerNavigationTools(server);
  registerFileOpsTools(server);

  return server;
}

// Configura el endpoint MCP HTTP en la aplicacion Express
export function configureMcpEndpoint(app: Express): void {
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  // Handler para POST /mcp, GET /mcp, DELETE /mcp
  const handleMcpRequest = async (req: Request, res: Response): Promise<void> => {
    logToStderr(`[MCP] === Request entrante: ${req.method} /mcp ===`);

    // --- FASE 1: Autenticacion (errores aqui → 401) ---
    let user: { id: string; email: string };
    let token: string;
    let clientId: string;

    try {
      // Extraer Bearer token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        logToStderr(`[MCP] No Bearer token`);
        res.setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
        );
        res.status(401).json({ error: "Bearer token required" });
        return;
      }

      token = authHeader.slice(7);
      logToStderr(`[MCP] Bearer token recibido (longitud: ${token.length})`);

      // Verificar JWT con nuestra clave propia
      const payload = verifyMcpToken(token);
      clientId = payload.clientId;
      logToStderr(`[MCP] JWT verificado — userId: ${payload.sub}, clientId: ${clientId}`);

      // Verificar que el usuario y cliente OAuth existan (con auto-recovery ante Prisma panic)
      const oauthClient = await withDbRecovery(() => {
        const db = getDatabase();
        return db.oauthClient.findFirst({
          where: { clientId, isActive: true },
          include: { user: true },
        });
      });

      if (!oauthClient) {
        logToStderr(`[MCP] Cliente OAuth no encontrado o inactivo: ${clientId}`);
        res.status(401).json({ error: "Cliente OAuth invalido o inactivo" });
        return;
      }

      user = { id: oauthClient.user.id, email: oauthClient.user.email };
      logToStderr(`[MCP] Usuario DB — id: ${user.id}, email: ${user.email}`);

      // Actualizar lastUsedAt (con auto-recovery, no bloquear si falla)
      await withDbRecovery(() => {
        const db = getDatabase();
        return db.oauthClient.update({
          where: { id: oauthClient.id },
          data: { lastUsedAt: new Date() },
        });
      }).catch(() => {});

    } catch (authError) {
      // SOLO errores de autenticacion llegan aqui (JWT, DB lookup)
      const errMsg = authError instanceof Error ? authError.message : String(authError);
      logToStderr(`[MCP] AUTH ERROR: ${errMsg}`);

      if (!res.headersSent) {
        res.setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
        );
        res.status(401).json({
          error: "token_verification_failed",
          reason: errMsg,
        });
      }
      return;
    }

    // --- FASE 2: MCP Handler (errores aqui → 500, NUNCA 401) ---
    try {
      // Crear instancia MCP para esta request (stateless)
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless
      });

      // Conectar servidor al transport
      await server.connect(transport);

      // Adjuntar authInfo al request para que las tools la reciban
      const nodeReq = req as unknown as IncomingMessage & { auth?: { token: string; clientId: string; scopes: string[]; extra?: Record<string, unknown> } };
      nodeReq.auth = {
        token,
        clientId,
        scopes: ["mcp"],
        extra: {
          userId: user.id,
          email: user.email,
        },
      };

      // Manejar la request MCP
      await transport.handleRequest(
        nodeReq,
        res as unknown as ServerResponse,
        req.body
      );

      // Limpiar
      transport.onclose = () => {
        server.close().catch(() => {});
      };
    } catch (mcpError) {
      // Errores de herramientas MCP, FTP, transport — NUNCA devolver 401
      const errMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
      logToStderr(`[MCP] TOOL/TRANSPORT ERROR: ${errMsg}`);

      if (!res.headersSent) {
        const isProduction = process.env.NODE_ENV === "production";
        res.status(500).json({
          error: "Error interno del servidor MCP",
          ...(isProduction ? {} : { reason: errMsg }),
        });
      }
    }
  };

  // Registrar rutas MCP
  app.post("/mcp", handleMcpRequest);
  app.get("/mcp", handleMcpRequest);
  app.delete("/mcp", handleMcpRequest);

  logToStderr("Endpoint MCP HTTP configurado en /mcp");
}
