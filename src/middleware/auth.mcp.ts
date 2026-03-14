/*
 * Archivo: auth.mcp.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Middleware para autenticar requests MCP via Bearer token JWT (client_credentials)
 * Ruta: ftp-mcp-server-open/src/middleware/auth.mcp.ts
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getDatabase, withDbRecovery } from "../config/database.js";
import { verifyClientSecret } from "../auth/oauth-credentials.js";
import { logToStderr } from "../services/file.utils.js";

// Interfaz del payload JWT emitido por nuestro /oauth/token
export interface McpTokenPayload {
  sub: string;      // userId
  clientId: string;  // OAuth client ID
  type: string;      // "mcp_access"
}

// Obtiene la clave JWT desde env
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("JWT_SECRET o ENCRYPTION_KEY no configurada");
  }
  return secret;
}

// Verifica un Bearer token JWT emitido por nuestro servidor
export function verifyMcpToken(token: string): McpTokenPayload {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  }) as McpTokenPayload;

  if (payload.type !== "mcp_access" || !payload.sub || !payload.clientId) {
    throw new Error("Token payload invalido");
  }

  return payload;
}

// Lifetime del token de acceso MCP (8 horas — suficiente para sesiones largas de trabajo)
export const ACCESS_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

// Emite un JWT de acceso MCP para un cliente OAuth autenticado
export function signMcpToken(userId: string, clientId: string): string {
  const secret = getJwtSecret();
  const token = jwt.sign(
    {
      sub: userId,
      clientId,
      type: "mcp_access",
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    }
  );
  return token;
}

// Middleware que verifica el Bearer token en requests al endpoint MCP
export async function mcpAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logToStderr(`[AUTH-MCP] No Bearer token`);
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
      );
      res.status(401).json({ error: "Bearer token required" });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyMcpToken(token);
    logToStderr(`[AUTH-MCP] Token verificado — userId: ${payload.sub}, clientId: ${payload.clientId}`);

    // Verificar que el usuario y cliente OAuth existan y esten activos (con auto-recovery)
    const oauthClient = await withDbRecovery(() => {
      const db = getDatabase();
      return db.oauthClient.findFirst({
        where: { clientId: payload.clientId, isActive: true },
        include: { user: true },
      });
    });

    if (!oauthClient || !oauthClient.user) {
      logToStderr(`[AUTH-MCP] Cliente OAuth no encontrado o inactivo: ${payload.clientId}`);
      res.status(401).json({ error: "Cliente OAuth invalido o inactivo" });
      return;
    }

    // Actualizar lastUsedAt (con auto-recovery, no bloquear si falla)
    await withDbRecovery(() => {
      const db = getDatabase();
      return db.oauthClient.update({
        where: { id: oauthClient.id },
        data: { lastUsedAt: new Date() },
      });
    }).catch((err) => {
      logToStderr(`[AUTH-MCP] Error actualizando lastUsedAt: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Adjuntar info de auth al request para las tools MCP
    req.user = {
      id: oauthClient.user.id,
      email: oauthClient.user.email,
      name: oauthClient.user.name,
    };

    next();
  } catch (error) {
    logToStderr(`[AUTH-MCP] Error: ${error instanceof Error ? error.message : String(error)}`);
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );
    const isProduction = process.env.NODE_ENV === "production";
    res.status(401).json({
      error: "token_verification_failed",
      ...(isProduction ? {} : { reason: error instanceof Error ? error.message : String(error) }),
    });
  }
}
