/*
 * Archivo: constants.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Constantes globales del servidor MCP FTP/SFTP
 * Ruta: ftp-mcp-server-open/src/constants.ts
 */

// Límite máximo de tamaño de archivo para lectura (por defecto 500MB)
// Aplica en tools MCP (ftp_read_file) y en loadEnvConfig()
// Se puede sobreescribir con la variable de entorno FTP_MAX_FILE_SIZE
export const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024;

// Timeout de lectura por defecto en milisegundos (2 minutos)
export const DEFAULT_READ_TIMEOUT = 120000;

// Puerto por defecto para transporte HTTP
export const DEFAULT_HTTP_PORT = 3000;

// Puerto FTP por defecto
export const DEFAULT_FTP_PORT = 21;

// Puerto SFTP por defecto
export const DEFAULT_SFTP_PORT = 22;

// Ruta base por defecto
export const DEFAULT_BASE_PATH = "/public_html";

// Extensiones permitidas por defecto para operaciones de escritura
export const DEFAULT_ALLOWED_EXTENSIONS = [
  ".php", ".html", ".css", ".js", ".json", ".txt", ".xml",
  ".htaccess", ".md", ".yml", ".yaml", ".env", ".ini", ".conf",
  ".svg", ".sql", ".twig", ".vue", ".jsx", ".tsx", ".ts",
  ".scss", ".sass", ".less",
];

// Profundidad máxima de búsqueda recursiva
export const DEFAULT_MAX_SEARCH_DEPTH = 3;

// Resultados máximos de búsqueda
export const DEFAULT_MAX_SEARCH_RESULTS = 50;

// Nombre del servidor MCP
export const SERVER_NAME = "ftp-mcp-server-open";

// Version del servidor MCP
export const SERVER_VERSION = "2.0.0-open";

// Protocolos soportados
export const SUPPORTED_PROTOCOLS = ["ftp", "sftp"] as const;

// Opciones de ordenamiento para listado de directorios
export const SORT_OPTIONS = ["name", "size", "date"] as const;

// Encodings soportados para lectura de archivos
export const SUPPORTED_ENCODINGS = ["utf-8", "ascii", "latin1", "base64"] as const;

// Extensiones de tipos MIME comunes
export const MIME_MAP: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".php": "application/x-php",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
  ".sql": "application/sql",
  ".ts": "application/typescript",
  ".tsx": "application/typescript",
  ".jsx": "application/javascript",
  ".vue": "text/x-vue",
  ".scss": "text/x-scss",
  ".sass": "text/x-sass",
  ".less": "text/x-less",
  ".ini": "text/plain",
  ".conf": "text/plain",
  ".env": "text/plain",
  ".htaccess": "text/plain",
  ".twig": "text/x-twig",
};

// TTL de selección de sitio en milisegundos (30 minutos)
export const SITE_SELECTION_TTL = 30 * 60 * 1000;

// Máximo de sitios FTP por usuario
export const MAX_SITES_PER_USER = 20;

// Puerto mínimo y máximo para validación
export const MIN_PORT = 1;
export const MAX_PORT = 65535;
