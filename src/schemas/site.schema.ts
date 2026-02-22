/*
 * Archivo: site.schema.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Esquemas Zod para sitios FTP y herramientas de selección de sitio
 * Ruta: ftp-mcp-server-open/src/schemas/site.schema.ts
 */

import { z } from "zod";

// Esquema para crear/actualizar un sitio FTP (API REST)
export const createSiteSchema = z.object({
  name: z.string().min(1).max(100).describe("Nombre descriptivo del sitio"),
  host: z.string().min(1).max(255).describe("Host del servidor FTP/SFTP"),
  port: z.number().int().min(1).max(65535).default(21).describe("Puerto de conexión"),
  protocol: z.enum(["ftp", "sftp"]).default("ftp").describe("Protocolo: ftp o sftp"),
  username: z.string().min(1).max(100).describe("Usuario FTP"),
  password: z.string().min(1).describe("Contraseña FTP"),
  basePath: z.string().default("/public_html").describe("Ruta base en el servidor"),
}).strict();

// Esquema para actualizar un sitio FTP (todos los campos opcionales)
export const updateSiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["ftp", "sftp"]).optional(),
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(1).optional(),
  basePath: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

// Esquema para ftp_list_sites (MCP tool, sin parámetros)
export const listSitesSchema = z.object({}).strict();

// Esquema para ftp_select_site (MCP tool)
export const selectSiteSchema = z.object({
  site_id: z.string().describe("ID del sitio FTP a seleccionar (obtenido de ftp_list_sites)"),
}).strict();
