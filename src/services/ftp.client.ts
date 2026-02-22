/*
 * Archivo: ftp.client.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Cliente FTP usando la librería basic-ftp, implementa IFileClient
 * Ruta: ftp-mcp-server-open/src/services/ftp.client.ts
 */

import * as ftp from "basic-ftp";
import { Writable, Readable } from "node:stream";
import type { IFileClient, ConnectionConfig, FileEntry, FileInfo } from "../types.js";
import { logToStderr } from "./file.utils.js";

export class FtpClient implements IFileClient {
  private client: ftp.Client;
  private connected = false;

  constructor() {
    this.client = new ftp.Client();
    this.client.ftp.verbose = false;
  }

  // Conecta al servidor FTP
  async connect(config: ConnectionConfig): Promise<void> {
    try {
      (this.client.ftp as unknown as { timeout: number }).timeout = config.timeout;
      await this.client.access({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password ?? "",
        secure: false,
      });
      this.connected = true;
      logToStderr(`Conectado a FTP ${config.host}:${config.port}`);
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  // Desconecta del servidor FTP
  async disconnect(): Promise<void> {
    this.client.close();
    this.connected = false;
    logToStderr("Desconectado de FTP");
  }

  // Verifica si hay conexión activa
  isConnected(): boolean {
    return this.connected && !this.client.closed;
  }

  // Lista archivos y directorios en una ruta
  async list(remotePath: string): Promise<FileEntry[]> {
    const items = await this.client.list(remotePath);
    return items.map((item) => ({
      name: item.name,
      type: this.mapFileType(item.type),
      size: item.size,
      modifiedAt: item.modifiedAt ?? new Date(0),
      permissions: item.permissions
        ? `${item.permissions.user}${item.permissions.group}${item.permissions.world}`
        : undefined,
      owner: item.user,
      group: item.group,
    }));
  }

  // Lee el contenido de un archivo remoto
  async read(remotePath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });
    await this.client.downloadTo(writable, remotePath);
    return Buffer.concat(chunks);
  }

  // Escribe contenido a un archivo remoto
  async write(remotePath: string, content: Buffer): Promise<void> {
    const readable = Readable.from(content);
    await this.client.uploadFrom(readable, remotePath);
  }

  // Crea un directorio (soporta creación recursiva)
  async mkdir(remotePath: string, recursive?: boolean): Promise<void> {
    if (recursive) {
      await this.client.ensureDir(remotePath);
      // ensureDir cambia el directorio de trabajo, volver a /
      await this.client.cd("/");
    } else {
      await this.client.send(`MKD ${remotePath}`);
    }
  }

  // Elimina un archivo remoto
  async delete(remotePath: string): Promise<void> {
    await this.client.remove(remotePath);
  }

  // Elimina un directorio remoto
  async rmdir(remotePath: string, recursive?: boolean): Promise<void> {
    if (recursive) {
      await this.client.removeDir(remotePath);
    } else {
      await this.client.send(`RMD ${remotePath}`);
    }
  }

  // Renombra o mueve un archivo/directorio
  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.client.rename(oldPath, newPath);
  }

  // Obtiene información de un archivo o directorio
  async stat(remotePath: string): Promise<FileInfo> {
    const dirPath = remotePath.substring(0, remotePath.lastIndexOf("/")) || "/";
    const fileName = remotePath.substring(remotePath.lastIndexOf("/") + 1);
    const items = await this.client.list(dirPath);
    const item = items.find((i) => i.name === fileName);

    if (!item) {
      throw new Error(`No such file or directory: ${remotePath}`);
    }

    return {
      name: item.name,
      path: remotePath,
      type: this.mapFileType(item.type),
      size: item.size,
      modifiedAt: item.modifiedAt ?? new Date(0),
      permissions: item.permissions
        ? `${item.permissions.user}${item.permissions.group}${item.permissions.world}`
        : undefined,
      owner: item.user,
      group: item.group,
    };
  }

  // Verifica si un archivo o directorio existe
  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.stat(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  // Mapea el tipo de archivo de basic-ftp al tipo interno
  private mapFileType(type: ftp.FileType): FileEntry["type"] {
    switch (type) {
      case ftp.FileType.File: return "file";
      case ftp.FileType.Directory: return "directory";
      case ftp.FileType.SymbolicLink: return "symlink";
      default: return "unknown";
    }
  }
}
