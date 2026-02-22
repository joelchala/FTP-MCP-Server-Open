/*
 * Archivo: sftp.client.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Cliente SFTP usando la librería ssh2-sftp-client, implementa IFileClient
 * Ruta: ftp-mcp-server-open/src/services/sftp.client.ts
 */

import SftpClient from "ssh2-sftp-client";
import { readFileSync } from "node:fs";
import type { IFileClient, ConnectionConfig, FileEntry, FileInfo } from "../types.js";
import { logToStderr } from "./file.utils.js";

export class SftpFileClient implements IFileClient {
  private client: SftpClient;
  private connected = false;

  constructor() {
    this.client = new SftpClient();
  }

  // Conecta al servidor SFTP
  async connect(config: ConnectionConfig): Promise<void> {
    try {
      const connectConfig: SftpClient.ConnectOptions = {
        host: config.host,
        port: config.port,
        username: config.user,
        readyTimeout: config.timeout,
      };

      // Usar llave privada si está configurada, sino usar contraseña
      if (config.privateKeyPath) {
        try {
          connectConfig.privateKey = readFileSync(config.privateKeyPath);
        } catch (err) {
          throw new Error(`No se pudo leer la llave privada: ${config.privateKeyPath} — ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        connectConfig.password = config.password ?? "";
      }

      await this.client.connect(connectConfig);
      this.connected = true;
      logToStderr(`Conectado a SFTP ${config.host}:${config.port}`);
    } catch (error) {
      this.connected = false;
      await this.client.end().catch(() => {});
      throw error;
    }
  }

  // Desconecta del servidor SFTP
  async disconnect(): Promise<void> {
    await this.client.end();
    this.connected = false;
    logToStderr("Desconectado de SFTP");
  }

  // Verifica si hay conexión activa
  isConnected(): boolean {
    return this.connected;
  }

  // Lista archivos y directorios en una ruta
  async list(remotePath: string): Promise<FileEntry[]> {
    const items = await this.client.list(remotePath);
    return items.map((item) => ({
      name: item.name,
      type: this.mapFileType(item.type),
      size: item.size,
      modifiedAt: new Date(item.modifyTime),
      permissions: item.rights ? `${item.rights.user}${item.rights.group}${item.rights.other}` : undefined,
      owner: String(item.owner),
      group: String(item.group),
    }));
  }

  // Lee el contenido de un archivo remoto
  async read(remotePath: string): Promise<Buffer> {
    const result = await this.client.get(remotePath);
    if (Buffer.isBuffer(result)) {
      return result;
    }
    // Si devuelve un string, convertirlo a Buffer
    if (typeof result === "string") {
      return Buffer.from(result, "utf-8");
    }
    throw new Error("Formato de lectura no soportado");
  }

  // Escribe contenido a un archivo remoto
  async write(remotePath: string, content: Buffer): Promise<void> {
    await this.client.put(content, remotePath);
  }

  // Crea un directorio (soporta creación recursiva)
  async mkdir(remotePath: string, recursive?: boolean): Promise<void> {
    await this.client.mkdir(remotePath, recursive ?? false);
  }

  // Elimina un archivo remoto
  async delete(remotePath: string): Promise<void> {
    await this.client.delete(remotePath);
  }

  // Elimina un directorio remoto
  async rmdir(remotePath: string, recursive?: boolean): Promise<void> {
    await this.client.rmdir(remotePath, recursive ?? false);
  }

  // Renombra o mueve un archivo/directorio
  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.client.rename(oldPath, newPath);
  }

  // Obtiene información de un archivo o directorio
  async stat(remotePath: string): Promise<FileInfo> {
    const stats = await this.client.stat(remotePath);
    const name = remotePath.substring(remotePath.lastIndexOf("/") + 1);
    // Convertir mode numérico a string octal de permisos (ej: "755")
    const permissions = stats.mode !== undefined
      ? (stats.mode & 0o777).toString(8)
      : undefined;
    return {
      name,
      path: remotePath,
      type: this.mapStatType(stats),
      size: stats.size,
      modifiedAt: new Date(stats.modifyTime),
      permissions,
      owner: stats.uid !== undefined ? String(stats.uid) : undefined,
      group: stats.gid !== undefined ? String(stats.gid) : undefined,
    };
  }

  // Verifica si un archivo o directorio existe
  async exists(remotePath: string): Promise<boolean> {
    const result = await this.client.exists(remotePath);
    return result !== false;
  }

  // Mapea el tipo de archivo de ssh2-sftp-client al tipo interno
  private mapFileType(type: string): FileEntry["type"] {
    switch (type) {
      case "d": return "directory";
      case "-": return "file";
      case "l": return "symlink";
      default: return "unknown";
    }
  }

  // Mapea el tipo del stat de SFTP
  private mapStatType(stats: SftpClient.FileStats): FileEntry["type"] {
    if (stats.isDirectory) return "directory";
    if (stats.isFile) return "file";
    return "unknown";
  }
}
