#!/usr/bin/env node
/*
 * Archivo: index.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Entrada principal — Express server con MCP HTTP, API REST, OAuth y panel web
 * Ruta: ftp-mcp-server-open/src/index.ts
 */

// IMPORTANTE: env-loader debe ser el primer import — carga .env o .env.production
import "./env-loader.js";

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { loadEnvConfig } from "./services/connection.manager.js";
import { configureOAuthDiscovery } from "./auth/protected-resource.js";
import { configureMcpEndpoint } from "./mcp/mcp.http.js";
import { authRoutes } from "./routes/auth.routes.js";
import { sitesRoutes } from "./routes/sites.routes.js";
import { oauthRoutes } from "./routes/oauth.routes.js";
import { pagesRoutes } from "./routes/pages.routes.js";
import { filesRoutes } from "./routes/files.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { webAuthMiddleware } from "./middleware/auth.web.js";
import { logToStderr } from "./services/file.utils.js";
import { cleanExpiredSessions } from "./auth/session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Funcion principal de inicio del servidor
async function main(): Promise<void> {
  const env = loadEnvConfig();

  logToStderr(`Servidor ${SERVER_NAME} v${SERVER_VERSION} iniciando...`);
  logToStderr(`Transporte: ${env.transport}`);

  if (env.transport === "stdio") {
    // Modo stdio: para uso local con Claude Code/Desktop
    await startStdioServer();
  } else {
    // Modo HTTP: servidor Express (por defecto en produccion)
    await startHttpServer();
  }
}

// Inicia el servidor en modo stdio (uso local con Claude Code/Desktop)
async function startStdioServer(): Promise<void> {
  // Imports dinamicos para evitar cargar estas dependencias en produccion HTTP
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { registerConnectionTools } = await import("./tools/connection.tools.js");
  const { registerNavigationTools } = await import("./tools/navigation.tools.js");
  const { registerFileOpsTools } = await import("./tools/fileops.tools.js");

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerConnectionTools(server);
  registerNavigationTools(server);
  registerFileOpsTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logToStderr("Transporte stdio conectado");
}

// Inicia el servidor Express con MCP HTTP, API REST y panel web
async function startHttpServer(): Promise<void> {
  const app = express();

  // Puerto configurable via variable de entorno
  const port = Number(process.env.PORT) || 3000;

  // Verificar conexion a BD al inicio — detectar errores temprano
  try {
    const { getDatabase } = await import("./config/database.js");
    const db = getDatabase();
    await db.$connect();
    logToStderr("Conexion a base de datos verificada");
  } catch (dbError) {
    logToStderr(`[DB ERROR] No se pudo conectar a la base de datos: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    logToStderr("[DB ERROR] El servidor continuara pero las rutas que requieren BD fallaran");
  }

  // Parsear origenes CORS (no usar wildcard si hay cookies/sesiones)
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : [process.env.BASE_URL || "http://localhost:3000"];

  // Trust proxy — necesario si se usa un reverse proxy (NGINX, etc.)
  app.set("trust proxy", 1);

  // Middleware global
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Rate limiting para API
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes, intenta de nuevo mas tarde" },
  });

  // Rate limiting para MCP
  const mcpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limiting para auth (login/register — mas restrictivo)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos de autenticacion" },
  });

  // Servir archivos estaticos del panel web
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  // Endpoints de descubrimiento OAuth (RFC 9728)
  configureOAuthDiscovery(app);

  // Rutas de autenticacion (registro, login, logout)
  app.use("/api/auth", authLimiter, authRoutes);

  // Rutas de sitios FTP (requieren sesion web)
  app.use("/api/sites", apiLimiter, webAuthMiddleware, sitesRoutes);

  // Rutas OAuth — credenciales (requieren sesion web para CRUD)
  app.use("/api/oauth", apiLimiter, webAuthMiddleware, oauthRoutes);

  // Rutas de archivos (explorador de archivos remoto)
  app.use("/api/files", apiLimiter, webAuthMiddleware, filesRoutes);

  // Rutas de configuracion (perfil, contrasena)
  app.use("/api/settings", apiLimiter, webAuthMiddleware, settingsRoutes);

  // Endpoint POST /oauth/token (publico, para Claude.ai client_credentials)
  // Importar solo el handler de token, sin requerir sesion web
  const { oauthTokenRouter } = await import("./routes/oauth.routes.js");
  app.use("/oauth", oauthTokenRouter);

  // Rutas de paginas HTML del panel web
  app.use(pagesRoutes);

  // Endpoint MCP con Streamable HTTP
  app.use("/mcp", mcpLimiter);
  configureMcpEndpoint(app);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // Debug health — muestra estado de env vars y componentes
  app.get("/debug/health", async (_req, res) => {
    const checks: Record<string, unknown> = {
      status: "ok",
      timestamp: new Date().toISOString(),
      env: {
        BASE_URL: process.env.BASE_URL ?? "(not set)",
        NODE_ENV: process.env.NODE_ENV ?? "(not set)",
        TRANSPORT: process.env.TRANSPORT ?? "(not set, default=http)",
        HAS_JWT_SECRET: !!process.env.JWT_SECRET,
        HAS_ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
        HAS_DATABASE_URL: !!process.env.DATABASE_URL,
        DATABASE_URL_LENGTH: process.env.DATABASE_URL?.length ?? 0,
        PORT: port,
      },
    };

    // Test DB connection
    try {
      const { getDatabase } = await import("./config/database.js");
      const db = getDatabase();
      await db.$queryRaw`SELECT 1 as test`;
      checks.database = "connected";
    } catch (dbErr) {
      checks.database = `ERROR: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`;
    }

    // Test bcryptjs
    try {
      const { hashPassword } = await import("./auth/password.js");
      const hash = await hashPassword("test123");
      checks.bcryptjs = hash ? "working" : "ERROR: empty hash";
    } catch (bcErr) {
      checks.bcryptjs = `ERROR: ${bcErr instanceof Error ? bcErr.message : String(bcErr)}`;
    }

    // Test encryption
    try {
      const { encrypt, decrypt } = await import("./config/encryption.js");
      const enc = encrypt("test_value");
      const dec = decrypt(enc);
      checks.encryption = dec === "test_value" ? "working" : "ERROR: decrypt mismatch";
    } catch (encErr) {
      checks.encryption = `ERROR: ${encErr instanceof Error ? encErr.message : String(encErr)}`;
    }

    // Test session creation (dry run)
    try {
      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(32).toString("hex");
      checks.crypto = token.length === 64 ? "working" : "ERROR: unexpected length";
    } catch (cryptoErr) {
      checks.crypto = `ERROR: ${cryptoErr instanceof Error ? cryptoErr.message : String(cryptoErr)}`;
    }

    res.json(checks);
  });

  // Catch-all: rutas no encontradas — devolver 404 JSON para /api/*, SPA fallback para otras
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Endpoint no encontrado", path: req.path });
    } else {
      // SPA fallback: redirigir a index.html para rutas no reconocidas
      res.sendFile(path.join(publicDir, "index.html"), (err) => {
        if (err) {
          res.status(404).json({ error: "Pagina no encontrada" });
        }
      });
    }
  });

  // Error handler global de Express — atrapa errores no manejados en rutas
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const isProduction = process.env.NODE_ENV === "production";
    logToStderr(`[EXPRESS ERROR] ${err.stack || err.message || String(err)}`);

    if (res.headersSent) return;
    res.status(500).json({
      error: "Error interno del servidor",
      ...(isProduction ? {} : { details: err.message }),
    });
  });

  // Limpiar sesiones expiradas cada hora
  setInterval(() => {
    cleanExpiredSessions().catch(() => {});
  }, 60 * 60 * 1000);

  // Iniciar servidor
  app.listen(port, "0.0.0.0", () => {
    logToStderr(`Servidor HTTP escuchando en 0.0.0.0:${port}`);
    logToStderr(`Panel web: ${process.env.BASE_URL || `http://localhost:${port}`}`);
    logToStderr(`MCP endpoint: ${process.env.BASE_URL || `http://localhost:${port}`}/mcp`);
  });
}

// Handlers globales para errores no capturados — evitar que el servidor crashee
process.on("unhandledRejection", (reason) => {
  logToStderr(`[UNHANDLED REJECTION] ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

process.on("uncaughtException", (error) => {
  logToStderr(`[UNCAUGHT EXCEPTION] ${error.stack || error.message}`);
  // No hacer process.exit — dejar que el servidor siga corriendo si es posible
});

// Ejecutar
main().catch((error) => {
  logToStderr(`Error fatal: ${error}`);
  process.exit(1);
});
