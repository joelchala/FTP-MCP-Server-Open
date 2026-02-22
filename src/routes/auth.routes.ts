/*
 * Archivo: auth.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Rutas de registro, login y logout para el panel web (email + password)
 * Ruta: ftp-mcp-server-open/src/routes/auth.routes.ts
 */

import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../config/database.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { createSession, destroySession } from "../auth/session.js";
import { webAuthMiddleware } from "../middleware/auth.web.js";
import { logToStderr } from "../services/file.utils.js";

export const authRoutes = Router();

const SESSION_COOKIE_NAME = "session_token";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Schema de validacion para registro
const registerSchema = z.object({
  email: z.string().email("Email invalido").max(255),
  password: z.string().min(8, "Minimo 8 caracteres").max(128),
  name: z.string().min(1).max(100).optional(),
});

// Schema de validacion para login
const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(1, "Contrasena requerida"),
});

// Configura la cookie de sesion en la respuesta
function setSessionCookie(res: import("express").Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    path: "/",
  });
}

// POST /api/auth/register — Registro de nuevo usuario
authRoutes.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const { email, password, name } = parsed.data;
    const db = getDatabase();

    // Verificar si el email ya existe
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Este email ya esta registrado." });
      return;
    }

    // Crear usuario
    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, passwordHash, name: name ?? null },
    });

    // Crear sesion
    const token = await createSession(user.id);
    setSessionCookie(res, token);

    logToStderr(`[AUTH] Usuario registrado: ${email}`);
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    logToStderr(`[AUTH] Error en registro: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/login — Inicio de sesion
authRoutes.post("/login", async (req, res) => {
  try {
    logToStderr(`[AUTH] Login attempt recibido`);

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;
    logToStderr(`[AUTH] Login para: ${email}`);

    let db;
    try {
      db = getDatabase();
      logToStderr(`[AUTH] Database instance obtenida`);
    } catch (dbErr) {
      logToStderr(`[AUTH] ERROR getDatabase: ${dbErr instanceof Error ? dbErr.stack || dbErr.message : String(dbErr)}`);
      res.status(500).json({ error: "Error de conexion a base de datos" });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await db.user.findUnique({ where: { email } });
      logToStderr(`[AUTH] Query user completada, encontrado: ${!!user}`);
    } catch (queryErr) {
      logToStderr(`[AUTH] ERROR query user: ${queryErr instanceof Error ? queryErr.stack || queryErr.message : String(queryErr)}`);
      res.status(500).json({ error: "Error consultando base de datos" });
      return;
    }

    if (!user) {
      res.status(401).json({ error: "Email o contrasena incorrectos." });
      return;
    }

    // Verificar contrasena
    let valid;
    try {
      valid = await verifyPassword(password, user.passwordHash);
      logToStderr(`[AUTH] Verificacion password completada: ${valid}`);
    } catch (bcryptErr) {
      logToStderr(`[AUTH] ERROR bcrypt: ${bcryptErr instanceof Error ? bcryptErr.stack || bcryptErr.message : String(bcryptErr)}`);
      res.status(500).json({ error: "Error verificando credenciales" });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: "Email o contrasena incorrectos." });
      return;
    }

    // Crear sesion
    let token;
    try {
      token = await createSession(user.id);
      logToStderr(`[AUTH] Sesion creada OK`);
    } catch (sessionErr) {
      logToStderr(`[AUTH] ERROR createSession: ${sessionErr instanceof Error ? sessionErr.stack || sessionErr.message : String(sessionErr)}`);
      res.status(500).json({ error: "Error creando sesion" });
      return;
    }

    setSessionCookie(res, token);

    logToStderr(`[AUTH] Login exitoso: ${email}`);
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    logToStderr(`[AUTH] Error INESPERADO en login: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/auth/logout — Cierre de sesion
authRoutes.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (token) {
      await destroySession(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ message: "Sesion cerrada correctamente." });
  } catch (error) {
    logToStderr(`[AUTH] Error en logout: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/auth/me — Retorna datos del usuario autenticado
authRoutes.get("/me", webAuthMiddleware, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name },
  });
});
