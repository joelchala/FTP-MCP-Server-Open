/*
 * Archivo: navigation.schema.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Esquemas Zod para herramientas de navegación y exploración
 * Ruta: ftp-mcp-server-open/src/schemas/navigation.schema.ts
 */

import { z } from "zod";

// Esquema para ftp_list_directory
export const listDirectorySchema = z.object({
  path: z.string().default(".").describe("Ruta del directorio a listar (relativa a la ruta base)"),
  show_hidden: z.boolean().default(false).describe("Mostrar archivos ocultos (que comienzan con .)"),
  sort_by: z.enum(["name", "size", "date"]).default("name").describe("Ordenar por: name, size o date"),
}).strict();

// Esquema para ftp_search_files
export const searchFilesSchema = z.object({
  pattern: z.string().describe("Patrón de búsqueda (ej: '*.php', 'header*', '*.css')"),
  path: z.string().default(".").describe("Directorio base para la búsqueda"),
  max_depth: z.number().int().min(1).max(10).default(3).describe("Profundidad máxima de búsqueda recursiva"),
  max_results: z.number().int().min(1).max(200).default(50).describe("Número máximo de resultados"),
}).strict();

// Esquema para ftp_get_file_info
export const getFileInfoSchema = z.object({
  path: z.string().describe("Ruta del archivo o directorio"),
}).strict();
