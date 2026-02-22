/*
 * Archivo: types.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Interfaces y tipos TypeScript para el servidor MCP FTP/SFTP
 * Ruta: ftp-mcp-server-open/src/types.ts
 */

import type { SUPPORTED_PROTOCOLS, SORT_OPTIONS } from "./constants.js";

// Tipo para protocolo soportado
export type Protocol = (typeof SUPPORTED_PROTOCOLS)[number];

// Tipo para opciones de ordenamiento
export type SortOption = (typeof SORT_OPTIONS)[number];

// Configuración de conexión
export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  protocol: Protocol;
  privateKeyPath?: string;
  basePath: string;
  timeout: number;
}

// Entrada de archivo/directorio en listado
export interface FileEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "unknown";
  size: number;
  modifiedAt: Date;
  permissions?: string;
  owner?: string;
  group?: string;
}

// Información detallada de un archivo
export interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink" | "unknown";
  size: number;
  modifiedAt: Date;
  permissions?: string;
  owner?: string;
  group?: string;
  mimeType?: string;
}

// Resultado de lectura de archivo
export interface FileReadResult {
  content: string;
  totalLines: number;
  truncated: boolean;
  encoding: string;
  size: number;
  lineStart?: number;
  lineEnd?: number;
}

// Resultado de escritura de archivo
export interface FileWriteResult {
  path: string;
  size: number;
  backupCreated: boolean;
  backupPath?: string;
}

// Estado de conexión
export interface ConnectionStatus {
  connected: boolean;
  host?: string;
  port?: number;
  protocol?: Protocol;
  basePath?: string;
  currentPath?: string;
}

// Resultado de búsqueda de archivos
export interface SearchResult {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: Date;
}

// Interfaz unificada del cliente de archivos
export interface IFileClient {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  list(path: string): Promise<FileEntry[]>;
  read(path: string): Promise<Buffer>;
  write(path: string, content: Buffer): Promise<void>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  delete(path: string): Promise<void>;
  rmdir(path: string, recursive?: boolean): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(path: string): Promise<FileInfo>;
  exists(path: string): Promise<boolean>;
}

// Configuración del entorno
export interface EnvConfig {
  protocol: Protocol;
  host: string;
  port: number;
  user: string;
  password: string;
  privateKeyPath?: string;
  basePath: string;
  maxFileSize: number;
  allowedExtensions: string[];
  readTimeout: number;
  transport: "stdio" | "http";
  httpPort: number;
}

// Información de un sitio FTP (sin contraseña, para exposición)
export interface SiteInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  basePath: string;
  isActive: boolean;
}

// Datos completos de un sitio FTP (con contraseña encriptada)
export interface SiteData {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  passwordEnc: string;
  basePath: string;
  isActive: boolean;
}

// Contexto de usuario para las tools MCP
export interface UserContext {
  userId: string;
  email: string;
}

// Entrada de selección de sitio con TTL
export interface SiteSelection {
  siteId: string;
  selectedAt: number;
}
