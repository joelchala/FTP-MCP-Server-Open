/*
 * Archivo: fileops.schema.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Esquemas Zod para operaciones de archivos (read, write, delete, rename, etc.)
 * Ruta: ftp-mcp-server-open/src/schemas/fileops.schema.ts
 */

import { z } from "zod";

// Esquema para ftp_read_file
export const readFileSchema = z.object({
  path: z.string().describe("Ruta del archivo a leer"),
  encoding: z.string().default("utf-8").describe("Encoding del archivo (utf-8, ascii, latin1, base64)"),
  line_start: z.number().int().positive().optional().describe("Línea inicial (1-based)"),
  line_end: z.number().int().positive().optional().describe("Línea final (1-based, inclusiva)"),
}).strict();

// Esquema para ftp_write_file
export const writeFileSchema = z.object({
  path: z.string().describe("Ruta del archivo a escribir"),
  content: z.string().describe("Contenido a escribir en el archivo"),
  create_backup: z.boolean().default(true).describe("Crear backup antes de sobrescribir"),
}).strict();

// Esquema para ftp_create_directory
export const createDirectorySchema = z.object({
  path: z.string().describe("Ruta del directorio a crear"),
  recursive: z.boolean().default(true).describe("Crear directorios intermedios si no existen"),
}).strict();

// Esquema para ftp_delete_file
export const deleteFileSchema = z.object({
  path: z.string().describe("Ruta del archivo a eliminar"),
}).strict();

// Esquema para ftp_delete_directory
export const deleteDirectorySchema = z.object({
  path: z.string().describe("Ruta del directorio a eliminar"),
  force: z.boolean().default(false).describe("Eliminar recursivamente aunque no esté vacío"),
}).strict();

// Esquema para ftp_rename
export const renameSchema = z.object({
  old_path: z.string().describe("Ruta actual del archivo o directorio"),
  new_path: z.string().describe("Nueva ruta (renombrar o mover)"),
}).strict();
