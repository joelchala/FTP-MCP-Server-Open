/*
 * Archivo: oauth.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Rutas OAuth — Authorization Code + PKCE (para clientes MCP) y client_credentials
 * Ruta: ftp-mcp-server-open/src/routes/oauth.routes.ts
 */

import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { getDatabase, withDbRecovery } from "../config/database.js";
import {
  generateClientId, generateClientSecret,
  hashClientSecret, verifyClientSecret, getSecretPreview,
} from "../auth/oauth-credentials.js";
import { signMcpToken, ACCESS_TOKEN_LIFETIME_SECONDS } from "../middleware/auth.mcp.js";
import { validateSession } from "../auth/session.js";
import { logToStderr } from "../services/file.utils.js";

export const oauthRoutes = Router();

// Router separado para /oauth/* (publico, sin autenticacion web)
export const oauthTokenRouter = Router();

// ================================================================
// CRUD de credenciales OAuth (requiere sesion web via webAuthMiddleware)
// ================================================================

// POST /api/oauth/clients — Genera nuevas credenciales OAuth
oauthRoutes.post("/clients", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const name = (req.body?.name as string) || "MCP Client";
    const db = getDatabase();

    const clientId = generateClientId();
    const clientSecretRaw = generateClientSecret();
    const clientSecretHash = await hashClientSecret(clientSecretRaw);
    const preview = getSecretPreview(clientSecretRaw);

    const oauthClient = await withDbRecovery(() =>
      db.oauthClient.create({
        data: {
          userId,
          clientId,
          clientSecret: clientSecretHash,
          clientSecretPreview: preview,
          name,
        },
      })
    );

    logToStderr(`[OAUTH] Credenciales creadas para usuario ${userId}: ${clientId}`);

    res.status(201).json({
      clientId: oauthClient.clientId,
      clientSecret: clientSecretRaw,
      name: oauthClient.name,
      message: "Guarda el Client Secret ahora. No se podra ver de nuevo.",
    });
  } catch (error) {
    logToStderr(`[OAUTH] Error creando credenciales: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/oauth/clients — Lista credenciales OAuth del usuario
oauthRoutes.get("/clients", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const clients = await withDbRecovery(() =>
      db.oauthClient.findMany({
        where: { userId },
        select: {
          id: true, clientId: true, clientSecretPreview: true,
          name: true, isActive: true, lastUsedAt: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    );

    res.json({ clients });
  } catch (error) {
    logToStderr(`[OAUTH] Error listando credenciales: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/oauth/clients/:id — Revoca credenciales OAuth
oauthRoutes.delete("/clients/:id", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "No autenticado" }); return; }

    const db = getDatabase();
    const client = await withDbRecovery(() =>
      db.oauthClient.findFirst({
        where: { id: req.params.id, userId },
      })
    );
    if (!client) {
      res.status(404).json({ error: "Credenciales no encontradas" });
      return;
    }

    await withDbRecovery(() =>
      db.oauthClient.update({
        where: { id: client.id },
        data: { isActive: false },
      })
    );

    logToStderr(`[OAUTH] Credenciales revocadas: ${client.clientId}`);
    res.json({ message: "Credenciales revocadas correctamente" });
  } catch (error) {
    logToStderr(`[OAUTH] Error revocando credenciales: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ================================================================
// OAuth Authorization Code + PKCE (para clientes MCP compatibles)
// ================================================================

// POST /oauth/authorize — El usuario autoriza el acceso (requiere sesion web via cookie)
// Los clientes MCP redirigen al browser a GET /authorize (pagina HTML), el usuario hace login
// y la pagina hace POST a esta ruta con los parametros OAuth
oauthTokenRouter.post("/authorize", async (req, res) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope,
    } = req.body;

    logToStderr(`[OAUTH] POST /oauth/authorize — client_id: ${client_id}, redirect_uri: ${redirect_uri}`);

    // Validar response_type
    if (response_type !== "code") {
      res.status(400).json({
        error: "unsupported_response_type",
        error_description: "Solo se soporta response_type=code",
      });
      return;
    }

    // Validar parametros requeridos
    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "client_id, redirect_uri y code_challenge son requeridos",
      });
      return;
    }

    // Verificar sesion del usuario (via cookie)
    const sessionToken = req.cookies?.session_token as string | undefined;
    if (!sessionToken) {
      res.status(401).json({
        error: "login_required",
        error_description: "Debes iniciar sesion primero",
      });
      return;
    }

    const userId = await validateSession(sessionToken);
    if (!userId) {
      res.status(401).json({
        error: "login_required",
        error_description: "Sesion expirada, inicia sesion nuevamente",
      });
      return;
    }

    // Generar authorization code
    const code = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    const db = getDatabase();

    // Guardar en BD (con auto-recovery)
    await withDbRecovery(() =>
      db.authorizationCode.create({
        data: {
          code,
          clientId: client_id,
          userId,
          redirectUri: redirect_uri,
          codeChallenge: code_challenge,
          codeChallengeMethod: code_challenge_method || "S256",
          scope: scope || "mcp",
          expiresAt,
        },
      })
    );

    logToStderr(`[OAUTH] Authorization code generado para usuario ${userId}, client: ${client_id}`);

    // Construir URL de redireccion con code y state
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    res.json({ redirect_uri: redirectUrl.toString() });

  } catch (error) {
    logToStderr(`[OAUTH] Error en /oauth/authorize: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Error interno del servidor",
    });
  }
});

// ================================================================
// POST /oauth/token — Soporta authorization_code (PKCE) y client_credentials
// ================================================================
oauthTokenRouter.post("/token", async (req, res) => {
  try {
    const grantType = req.body?.grant_type;
    const clientId = req.body?.client_id;

    logToStderr(`[OAUTH] POST /oauth/token — grant_type: ${grantType}, client_id: ${clientId}`);

    if (grantType === "authorization_code") {
      // ---- Authorization Code + PKCE ----
      await handleAuthorizationCodeGrant(req, res);
    } else if (grantType === "client_credentials") {
      // ---- Client Credentials (legacy/directo) ----
      await handleClientCredentialsGrant(req, res);
    } else {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Se soporta authorization_code y client_credentials",
      });
    }
  } catch (error) {
    logToStderr(`[OAUTH] Error en /oauth/token: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({
      error: "server_error",
      error_description: "Error interno del servidor",
    });
  }
});

// ================================================================
// Handler: Authorization Code + PKCE
// ================================================================
async function handleAuthorizationCodeGrant(
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  const code = req.body?.code;
  const codeVerifier = req.body?.code_verifier;
  const clientId = req.body?.client_id;
  const redirectUri = req.body?.redirect_uri;

  logToStderr(`[OAUTH] authorization_code — code: ${code?.slice(0, 8)}..., client_id: ${clientId}`);

  // Validar parametros requeridos
  if (!code || !codeVerifier || !clientId) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "code, code_verifier y client_id son requeridos",
    });
    return;
  }

  const db = getDatabase();

  // Buscar el authorization code (con auto-recovery)
  const authCode = await withDbRecovery(() =>
    db.authorizationCode.findUnique({
      where: { code },
      include: { user: true },
    })
  );

  if (!authCode) {
    logToStderr(`[OAUTH] Authorization code no encontrado`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code invalido",
    });
    return;
  }

  // Verificar que no este usado
  if (authCode.used) {
    logToStderr(`[OAUTH] Authorization code ya fue usado`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code ya fue utilizado",
    });
    return;
  }

  // Verificar expiracion
  if (new Date() > authCode.expiresAt) {
    logToStderr(`[OAUTH] Authorization code expirado`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code expirado",
    });
    return;
  }

  // Verificar client_id
  if (authCode.clientId !== clientId) {
    logToStderr(`[OAUTH] client_id no coincide: esperado ${authCode.clientId}, recibido ${clientId}`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "client_id no coincide",
    });
    return;
  }

  // Verificar redirect_uri si se proporciono
  if (redirectUri && authCode.redirectUri !== redirectUri) {
    logToStderr(`[OAUTH] redirect_uri no coincide`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "redirect_uri no coincide",
    });
    return;
  }

  // Verificar PKCE: SHA256(code_verifier) debe coincidir con code_challenge
  const challengeFromVerifier = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  if (challengeFromVerifier !== authCode.codeChallenge) {
    logToStderr(`[OAUTH] PKCE verification failed — expected: ${authCode.codeChallenge.slice(0, 10)}..., got: ${challengeFromVerifier.slice(0, 10)}...`);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "code_verifier no es valido (PKCE verification failed)",
    });
    return;
  }

  // Marcar code como usado (con auto-recovery)
  await withDbRecovery(() =>
    db.authorizationCode.update({
      where: { id: authCode.id },
      data: { used: true },
    })
  );

  // Emitir JWT de acceso
  const accessToken = signMcpToken(authCode.userId, authCode.clientId);

  logToStderr(`[OAUTH] Token emitido via authorization_code para usuario ${authCode.user.email}`);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: authCode.scope,
  });
}

// ================================================================
// Handler: Client Credentials (legacy)
// ================================================================
async function handleClientCredentialsGrant(
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  const clientId = req.body?.client_id;
  const clientSecret = req.body?.client_secret;

  if (!clientId || !clientSecret) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "client_id y client_secret son requeridos",
    });
    return;
  }

  const db = getDatabase();
  const oauthClient = await withDbRecovery(() =>
    db.oauthClient.findUnique({
      where: { clientId },
      include: { user: true },
    })
  );

  if (!oauthClient || !oauthClient.isActive) {
    logToStderr(`[OAUTH] Cliente no encontrado o inactivo: ${clientId}`);
    res.status(401).json({
      error: "invalid_client",
      error_description: "Client ID invalido o revocado",
    });
    return;
  }

  const isValid = await verifyClientSecret(clientSecret, oauthClient.clientSecret);
  if (!isValid) {
    logToStderr(`[OAUTH] Client secret invalido para: ${clientId}`);
    res.status(401).json({
      error: "invalid_client",
      error_description: "Client secret invalido",
    });
    return;
  }

  await withDbRecovery(() =>
    db.oauthClient.update({
      where: { id: oauthClient.id },
      data: { lastUsedAt: new Date() },
    })
  ).catch(() => {});

  const accessToken = signMcpToken(oauthClient.user.id, oauthClient.clientId);

  logToStderr(`[OAUTH] Token emitido via client_credentials para ${oauthClient.user.email}`);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
  });
}
