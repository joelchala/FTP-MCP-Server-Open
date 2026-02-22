/*
 * Archivo: connection.manager.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Gestor de conexiones FTP/SFTP con soporte multi-usuario y config dinámica
 * Ruta: ftp-mcp-server-open/src/services/connection.manager.ts
 */

import type { IFileClient, ConnectionConfig, ConnectionStatus, FileEntry, FileInfo, EnvConfig, SearchResult, SiteSelection } from "../types.js";
import { FtpClient } from "./ftp.client.js";
import { SftpFileClient } from "./sftp.client.js";
import { sanitizePath, isPathAllowed, matchesPattern, logToStderr } from "./file.utils.js";
import { getDatabase } from "../config/database.js";
import { decrypt } from "../config/encryption.js";
import {
  DEFAULT_FTP_PORT,
  DEFAULT_SFTP_PORT,
  DEFAULT_BASE_PATH,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_READ_TIMEOUT,
  DEFAULT_HTTP_PORT,
  DEFAULT_ALLOWED_EXTENSIONS,
  SITE_SELECTION_TTL,
} from "../constants.js";
import type { Protocol } from "../types.js";

// Carga configuración desde variables de entorno (modo stdio/local)
export function loadEnvConfig(): EnvConfig {
  const protocol = (process.env.FTP_PROTOCOL ?? "sftp") as "ftp" | "sftp";
  return {
    protocol,
    host: process.env.FTP_HOST ?? "localhost",
    port: Number(process.env.FTP_PORT) || (protocol === "sftp" ? DEFAULT_SFTP_PORT : DEFAULT_FTP_PORT),
    user: process.env.FTP_USER ?? "anonymous",
    password: process.env.FTP_PASSWORD ?? "",
    privateKeyPath: process.env.SFTP_PRIVATE_KEY_PATH || undefined,
    basePath: process.env.FTP_BASE_PATH ?? DEFAULT_BASE_PATH,
    maxFileSize: Number(process.env.FTP_MAX_FILE_SIZE) || DEFAULT_MAX_FILE_SIZE,
    allowedExtensions: process.env.FTP_ALLOWED_EXTENSIONS
      ? process.env.FTP_ALLOWED_EXTENSIONS.split(",").map((e) => e.trim())
      : DEFAULT_ALLOWED_EXTENSIONS,
    readTimeout: Number(process.env.FTP_READ_TIMEOUT) || DEFAULT_READ_TIMEOUT,
    transport: (process.env.TRANSPORT ?? "http") as "stdio" | "http",
    httpPort: Number(process.env.PORT) || DEFAULT_HTTP_PORT,
  };
}

// Store global de selección de sitio por usuario (userId → SiteSelection)
export const siteSelectionStore = new Map<string, SiteSelection>();

// Limpia selecciones expiradas periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [userId, selection] of siteSelectionStore.entries()) {
    if (now - selection.selectedAt > SITE_SELECTION_TTL) {
      siteSelectionStore.delete(userId);
    }
  }
}, 60000);

// Cache de conexiones activas por siteId
const connectionCache = new Map<string, { client: IFileClient; config: ConnectionConfig; lastUsed: number }>();

// Limpia conexiones inactivas cada 5 minutos
setInterval(async () => {
  const now = Date.now();
  for (const [siteId, conn] of connectionCache.entries()) {
    if (now - conn.lastUsed > SITE_SELECTION_TTL) {
      try { await conn.client.disconnect(); } catch { /* ignorar */ }
      connectionCache.delete(siteId);
    }
  }
}, 300000);

// Obtiene config desencriptada del sitio seleccionado para un usuario
export async function getSelectedSiteConfig(
  userId: string
): Promise<{ config: ConnectionConfig; siteId: string } | null> {
  const selection = siteSelectionStore.get(userId);

  // Si no hay selección, auto-seleccionar si solo tiene un sitio
  if (!selection) {
    const db = getDatabase();
    const sites = await db.site.findMany({ where: { userId, isActive: true } });
    if (sites.length === 1) {
      const site = sites[0]!;
      siteSelectionStore.set(userId, { siteId: site.id, selectedAt: Date.now() });
      const password = decrypt(site.passwordEnc);
      return {
        siteId: site.id,
        config: {
          host: site.host, port: site.port, user: site.username, password,
          protocol: site.protocol as Protocol, basePath: site.basePath,
          timeout: Number(process.env.FTP_READ_TIMEOUT) || DEFAULT_READ_TIMEOUT,
        },
      };
    }
    return null;
  }

  // Verificar TTL
  if (Date.now() - selection.selectedAt > SITE_SELECTION_TTL) {
    siteSelectionStore.delete(userId);
    return null;
  }

  const db = getDatabase();
  const site = await db.site.findFirst({
    where: { id: selection.siteId, userId, isActive: true },
  });
  if (!site) { siteSelectionStore.delete(userId); return null; }

  const password = decrypt(site.passwordEnc);
  return {
    siteId: site.id,
    config: {
      host: site.host, port: site.port, user: site.username, password,
      protocol: site.protocol as Protocol, basePath: site.basePath,
      timeout: Number(process.env.FTP_READ_TIMEOUT) || DEFAULT_READ_TIMEOUT,
    },
  };
}

// Obtiene o crea una conexión FTP/SFTP para un sitio específico
export async function getConnectionForSite(
  siteId: string, config: ConnectionConfig
): Promise<ConnectionManager> {
  let cached = connectionCache.get(siteId);

  if (cached && cached.client.isConnected()) {
    cached.lastUsed = Date.now();
    return new ConnectionManager(cached.client, config);
  }

  // Crear nueva conexión
  const client = config.protocol === "sftp" ? new SftpFileClient() : new FtpClient();
  await client.connect(config);
  connectionCache.set(siteId, { client, config, lastUsed: Date.now() });
  return new ConnectionManager(client, config);
}

// Clase para gestionar operaciones FTP/SFTP con una config dada
export class ConnectionManager {
  private client: IFileClient;
  private config: ConnectionConfig;
  private envConfig: EnvConfig;

  constructor(client: IFileClient, config: ConnectionConfig) {
    this.client = client;
    this.config = config;
    this.envConfig = loadEnvConfig();
  }

  // — Métodos estáticos para modo local (stdio) —

  private static localClient: IFileClient | null = null;
  private static localConfig: ConnectionConfig | null = null;

  // Obtiene instancia local (modo stdio)
  static getLocalInstance(): ConnectionManager | null {
    if (ConnectionManager.localClient?.isConnected() && ConnectionManager.localConfig) {
      return new ConnectionManager(ConnectionManager.localClient, ConnectionManager.localConfig);
    }
    return null;
  }

  // Conecta en modo local (stdio)
  static async connectLocal(overrides?: Partial<ConnectionConfig>): Promise<ConnectionManager> {
    if (ConnectionManager.localClient?.isConnected()) {
      await ConnectionManager.localClient.disconnect();
    }
    const env = loadEnvConfig();
    const config: ConnectionConfig = {
      host: overrides?.host ?? env.host, port: overrides?.port ?? env.port,
      user: overrides?.user ?? env.user, password: overrides?.password ?? env.password,
      protocol: overrides?.protocol ?? env.protocol, privateKeyPath: env.privateKeyPath,
      basePath: overrides?.basePath ?? env.basePath, timeout: env.readTimeout,
    };
    const client = config.protocol === "sftp" ? new SftpFileClient() : new FtpClient();
    await client.connect(config);
    const exists = await client.exists(config.basePath);
    if (!exists) { await client.disconnect(); throw new Error(`La ruta base '${config.basePath}' no existe`); }
    ConnectionManager.localClient = client;
    ConnectionManager.localConfig = config;
    logToStderr(`Conexión local establecida. Ruta base: ${config.basePath}`);
    return new ConnectionManager(client, config);
  }

  // Desconecta modo local
  static async disconnectLocal(): Promise<void> {
    if (ConnectionManager.localClient) {
      await ConnectionManager.localClient.disconnect();
      ConnectionManager.localClient = null;
      ConnectionManager.localConfig = null;
    }
  }

  // Estado de conexión local
  static getLocalStatus(): ConnectionStatus {
    if (!ConnectionManager.localClient?.isConnected() || !ConnectionManager.localConfig) {
      return { connected: false };
    }
    const c = ConnectionManager.localConfig;
    return { connected: true, host: c.host, port: c.port, protocol: c.protocol, basePath: c.basePath };
  }

  // — Métodos de instancia —

  getEnvConfig(): EnvConfig { return this.envConfig; }

  getStatus(): ConnectionStatus {
    if (!this.client.isConnected()) return { connected: false };
    return {
      connected: true, host: this.config.host, port: this.config.port,
      protocol: this.config.protocol, basePath: this.config.basePath,
    };
  }

  resolvePath(userPath: string): string {
    const resolved = sanitizePath(userPath, this.config.basePath);
    if (!isPathAllowed(resolved, this.config.basePath)) {
      throw new Error(`PATH_NOT_ALLOWED:${resolved}`);
    }
    return resolved;
  }

  async list(userPath: string): Promise<FileEntry[]> { return this.client.list(this.resolvePath(userPath)); }
  async read(userPath: string): Promise<Buffer> { return this.client.read(this.resolvePath(userPath)); }
  async write(p: string, c: Buffer): Promise<void> { await this.client.write(this.resolvePath(p), c); }
  async mkdir(p: string, r?: boolean): Promise<void> { await this.client.mkdir(this.resolvePath(p), r); }
  async deleteFile(p: string): Promise<void> { await this.client.delete(this.resolvePath(p)); }
  async deleteDir(p: string, r?: boolean): Promise<void> { await this.client.rmdir(this.resolvePath(p), r); }
  async rename(o: string, n: string): Promise<void> { await this.client.rename(this.resolvePath(o), this.resolvePath(n)); }
  async stat(p: string): Promise<FileInfo> { return this.client.stat(this.resolvePath(p)); }
  async exists(p: string): Promise<boolean> { return this.client.exists(this.resolvePath(p)); }
  async disconnect(): Promise<void> { await this.client.disconnect(); }

  // Búsqueda recursiva de archivos
  async search(userPath: string, pattern: string, maxDepth: number, maxResults: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    await this.searchRecursive(this.resolvePath(userPath), pattern, 0, maxDepth, maxResults, results);
    return results;
  }

  private async searchRecursive(
    curPath: string, pattern: string, depth: number,
    maxDepth: number, maxResults: number, results: SearchResult[]
  ): Promise<void> {
    if (depth > maxDepth || results.length >= maxResults) return;
    let entries: FileEntry[];
    try { entries = await this.client.list(curPath); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxResults) break;
      const p = curPath === "/" ? `/${e.name}` : `${curPath}/${e.name}`;
      if (matchesPattern(e.name, pattern)) {
        results.push({ path: p, name: e.name, type: e.type === "directory" ? "directory" : "file", size: e.size, modifiedAt: e.modifiedAt });
      }
      if (e.type === "directory" && !e.name.startsWith(".")) {
        await this.searchRecursive(p, pattern, depth + 1, maxDepth, maxResults, results);
      }
    }
  }
}
