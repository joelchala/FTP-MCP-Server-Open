/*
 * Archivo: format.helper.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Formateo de respuestas en Markdown y JSON
 * Ruta: ftp-mcp-server-open/src/helpers/format.helper.ts
 */

import type { FileEntry, FileInfo, FileReadResult, FileWriteResult, ConnectionStatus, SearchResult } from "../types.js";

// Formatea el tamaño en bytes a una representación legible
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0);
  return `${size} ${units[i]}`;
}

// Formatea una fecha a formato legible
function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

// Ícono según tipo de entrada
function typeIcon(type: string): string {
  switch (type) {
    case "directory": return "📁";
    case "file": return "📄";
    case "symlink": return "🔗";
    default: return "❓";
  }
}

// Formatea el estado de conexión
export function formatConnectionStatus(status: ConnectionStatus): string {
  if (!status.connected) {
    return [
      `## 🔌 Estado de conexión`,
      `- **Estado**: Desconectado`,
      ``,
      `Usa \`ftp_connect\` para establecer una conexión.`,
    ].join("\n");
  }

  return [
    `## ✅ Conexión activa`,
    `- **Host**: ${status.host}:${status.port}`,
    `- **Protocolo**: ${status.protocol?.toUpperCase()}`,
    `- **Ruta base**: ${status.basePath}`,
    `- **Estado**: Conectado`,
  ].join("\n");
}

// Formatea confirmación de conexión exitosa
export function formatConnectSuccess(host: string, port: number, protocol: string, basePath: string): string {
  return [
    `## ✅ Conexión establecida`,
    `- **Host**: ${host}:${port}`,
    `- **Protocolo**: ${protocol.toUpperCase()}`,
    `- **Ruta base**: ${basePath}`,
    `- **Estado**: Conectado`,
  ].join("\n");
}

// Formatea confirmación de desconexión
export function formatDisconnectSuccess(): string {
  return `## ✅ Desconectado\n- La conexión se cerró correctamente.`;
}

// Formatea listado de directorio
export function formatDirectoryListing(path: string, entries: FileEntry[]): string {
  if (entries.length === 0) {
    return `## 📂 ${path}\n\nEl directorio está vacío.`;
  }

  const lines = [`## 📂 ${path}`, ``, `| Tipo | Nombre | Tamaño | Modificado |`, `|------|--------|--------|------------|`];

  for (const entry of entries) {
    const icon = typeIcon(entry.type);
    const size = entry.type === "directory" ? "-" : formatSize(entry.size);
    const date = formatDate(entry.modifiedAt);
    lines.push(`| ${icon} | ${entry.name} | ${size} | ${date} |`);
  }

  lines.push(``, `**Total**: ${entries.length} elementos`);
  return lines.join("\n");
}

// Formatea resultados de búsqueda
export function formatSearchResults(pattern: string, basePath: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return [
      `## 🔍 Búsqueda: "${pattern}"`,
      `- **Directorio**: ${basePath}`,
      `- No se encontraron resultados.`,
    ].join("\n");
  }

  const lines = [
    `## 🔍 Búsqueda: "${pattern}"`,
    `- **Directorio**: ${basePath}`,
    `- **Resultados**: ${results.length}`,
    ``,
  ];

  for (const result of results) {
    const icon = result.type === "directory" ? "📁" : "📄";
    lines.push(`- ${icon} \`${result.path}\` (${formatSize(result.size)})`);
  }

  return lines.join("\n");
}

// Formatea información de archivo
export function formatFileInfo(info: FileInfo): string {
  const lines = [
    `## 📄 Información de archivo`,
    `- **Nombre**: ${info.name}`,
    `- **Ruta**: ${info.path}`,
    `- **Tipo**: ${info.type}`,
    `- **Tamaño**: ${formatSize(info.size)}`,
    `- **Modificado**: ${formatDate(info.modifiedAt)}`,
  ];

  if (info.mimeType) lines.push(`- **MIME**: ${info.mimeType}`);
  if (info.permissions) lines.push(`- **Permisos**: ${info.permissions}`);
  if (info.owner) lines.push(`- **Propietario**: ${info.owner}`);
  if (info.group) lines.push(`- **Grupo**: ${info.group}`);

  return lines.join("\n");
}

// Formatea resultado de lectura de archivo
export function formatFileRead(path: string, result: FileReadResult): string {
  const lines = [
    `## 📄 ${path}`,
    `- **Tamaño**: ${formatSize(result.size)}`,
    `- **Líneas**: ${result.totalLines}`,
    `- **Encoding**: ${result.encoding}`,
  ];

  if (result.truncated) {
    lines.push(`- **⚠️ Truncado**: Sí (mostrando líneas ${result.lineStart ?? 1}-${result.lineEnd ?? result.totalLines})`);
  }

  const ext = path.split(".").pop() ?? "";
  const lang = ext === "ts" || ext === "tsx" ? "typescript" : ext;
  lines.push(``, "```" + lang, result.content, "```");

  return lines.join("\n");
}

// Formatea resultado de escritura de archivo
export function formatFileWrite(result: FileWriteResult): string {
  const lines = [
    `## ✅ Archivo escrito`,
    `- **Ruta**: ${result.path}`,
    `- **Tamaño**: ${formatSize(result.size)}`,
  ];

  if (result.backupCreated && result.backupPath) {
    lines.push(`- **Backup**: ${result.backupPath}`);
  }

  return lines.join("\n");
}

// Formatea confirmación de creación de directorio
export function formatDirCreated(path: string): string {
  return `## ✅ Directorio creado\n- **Ruta**: ${path}`;
}

// Formatea confirmación de eliminación
export function formatDeleted(path: string, type: "archivo" | "directorio"): string {
  return `## ✅ ${type.charAt(0).toUpperCase() + type.slice(1)} eliminado\n- **Ruta**: ${path}`;
}

// Formatea confirmación de renombrado
export function formatRenamed(oldPath: string, newPath: string): string {
  return [
    `## ✅ Renombrado/Movido`,
    `- **De**: ${oldPath}`,
    `- **A**: ${newPath}`,
  ].join("\n");
}
