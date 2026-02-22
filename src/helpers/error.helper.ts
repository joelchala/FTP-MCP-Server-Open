/*
 * Archivo: error.helper.ts
 * Autor: Joel Chala
 * Versión: 1.0
 * Descripción: Manejo centralizado de errores con mensajes accionables
 * Ruta: ftp-mcp-server-open/src/helpers/error.helper.ts
 */

// Extrae el mensaje de un error desconocido
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Error desconocido";
}

// Formatea un error de conexión con sugerencias
export function formatConnectionError(error: unknown, host: string, protocol: string): string {
  const msg = getErrorMessage(error);
  const lines = [
    `## ❌ Error de conexión`,
    `- **Host**: ${host}`,
    `- **Protocolo**: ${protocol.toUpperCase()}`,
    `- **Error**: ${msg}`,
    ``,
    `### Sugerencias:`,
  ];

  if (msg.includes("ECONNREFUSED")) {
    lines.push(`- Verifica que el servidor esté en ejecución y acepte conexiones`);
    lines.push(`- Confirma que el puerto sea correcto`);
  } else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    lines.push(`- Verifica que el nombre del host sea correcto`);
    lines.push(`- Comprueba tu conexión a internet`);
  } else if (msg.includes("AUTH") || msg.includes("Login") || msg.includes("authentication")) {
    lines.push(`- Verifica usuario y contraseña`);
    lines.push(`- Para SFTP, verifica la llave privada si la usas`);
  } else if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    lines.push(`- El servidor no respondió a tiempo`);
    lines.push(`- Verifica la conectividad de red y los firewalls`);
  } else {
    lines.push(`- Revisa las credenciales y configuración de conexión`);
    lines.push(`- Usa \`ftp_status\` para verificar el estado actual`);
  }

  return lines.join("\n");
}

// Formatea un error de archivo con sugerencias
export function formatFileError(
  operation: string,
  path: string,
  error: unknown
): string {
  const msg = getErrorMessage(error);
  const lines = [
    `## ❌ Error: ${operation}`,
    `- **Ruta**: ${path}`,
    `- **Error**: ${msg}`,
    ``,
    `### Sugerencias:`,
  ];

  if (msg.includes("No such file") || msg.includes("not found") || msg.includes("ENOENT")) {
    lines.push(`- Verifica que la ruta sea correcta`);
    lines.push(`- Usa \`ftp_list_directory\` para explorar el directorio`);
  } else if (msg.includes("Permission") || msg.includes("EACCES")) {
    lines.push(`- No tienes permisos para esta operación`);
    lines.push(`- Verifica los permisos del archivo/directorio en el servidor`);
  } else if (msg.includes("not empty")) {
    lines.push(`- El directorio no está vacío`);
    lines.push(`- Usa \`force: true\` para eliminar recursivamente`);
  } else if (msg.includes("already exists")) {
    lines.push(`- El archivo o directorio ya existe`);
    lines.push(`- Usa un nombre diferente o elimina el existente primero`);
  } else {
    lines.push(`- Verifica la conexión con \`ftp_status\``);
    lines.push(`- Intenta reconectar con \`ftp_connect\``);
  }

  return lines.join("\n");
}

// Formatea un error de validación de ruta
export function formatPathError(path: string, reason: string): string {
  return [
    `## ❌ Error: Ruta no permitida`,
    `- **Ruta**: ${path}`,
    `- **Razón**: ${reason}`,
    ``,
    `### Sugerencias:`,
    `- Las rutas deben estar dentro de la ruta base configurada`,
    `- No se permite navegación con \`../\` fuera del sandbox`,
    `- Usa rutas relativas desde la ruta base`,
  ].join("\n");
}

// Formatea un error de extensión no permitida
export function formatExtensionError(path: string, allowed: string[]): string {
  return [
    `## ❌ Error: Extensión no permitida`,
    `- **Ruta**: ${path}`,
    `- **Extensiones permitidas**: ${allowed.join(", ")}`,
    ``,
    `### Sugerencia:`,
    `- Solo se permiten operaciones de escritura en archivos con extensiones autorizadas`,
  ].join("\n");
}

// Formatea un error de tamaño de archivo
export function formatSizeError(path: string, size: number, maxSize: number): string {
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  const maxMB = (maxSize / 1024 / 1024).toFixed(2);
  return [
    `## ❌ Error: Archivo demasiado grande`,
    `- **Ruta**: ${path}`,
    `- **Tamaño**: ${sizeMB} MB`,
    `- **Límite**: ${maxMB} MB`,
    ``,
    `### Sugerencia:`,
    `- Configura \`FTP_MAX_FILE_SIZE\` en .env para aumentar el límite`,
  ].join("\n");
}

// Formatea un error de conexión no establecida
export function formatNotConnectedError(): string {
  return [
    `## ❌ Error: No conectado`,
    `- No hay una conexión activa al servidor FTP/SFTP`,
    ``,
    `### Sugerencia:`,
    `- Usa \`ftp_connect\` para establecer una conexión primero`,
  ].join("\n");
}
