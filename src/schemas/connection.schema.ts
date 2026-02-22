/*
 * Archivo: connection.schema.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Esquemas Zod para herramientas de conexión FTP/SFTP
 * Ruta: ftp-mcp-server-open/src/schemas/connection.schema.ts
 */

import { z } from "zod";

// Esquema para ftp_connect
export const connectSchema = z.object({
  host: z.string().optional().describe("Host del servidor FTP/SFTP (usa .env si se omite)"),
  port: z.number().int().positive().optional().describe("Puerto de conexión (usa .env si se omite)"),
  user: z.string().optional().describe("Usuario de conexión (usa .env si se omite)"),
  password: z.string().optional().describe("Contraseña de conexión (usa .env si se omite)"),
  protocol: z.enum(["ftp", "sftp"]).optional().describe("Protocolo: ftp o sftp (usa .env si se omite)"),
}).strict();

// Esquema para ftp_disconnect (sin parámetros)
export const disconnectSchema = z.object({}).strict();

// Esquema para ftp_status (sin parámetros)
export const statusSchema = z.object({}).strict();
