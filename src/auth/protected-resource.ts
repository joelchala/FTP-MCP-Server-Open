/*
 * Archivo: protected-resource.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Endpoints de descubrimiento OAuth (RFC 9728) para nuestro propio servidor
 * Ruta: ftp-mcp-server-open/src/auth/protected-resource.ts
 */

import type { Express } from "express";

// Configura los endpoints de descubrimiento OAuth para que cualquier cliente MCP
// (Claude.ai, ChatGPT, Gemini, etc.) pueda descubrir nuestro servidor de autorizacion propio
export function configureOAuthDiscovery(app: Express): void {
  const port = Number(process.env.PORT) || 3000;
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

  // GET /.well-known/oauth-protected-resource (RFC 9728)
  // Los clientes MCP usan esto para descubrir donde autenticarse
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp"],
    });
  });

  // GET /.well-known/oauth-authorization-server
  // Metadata del servidor OAuth propio (RFC 8414)
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      token_endpoint_auth_methods_supported: ["none"],
      grant_types_supported: ["authorization_code"],
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp"],
    });
  });
}
