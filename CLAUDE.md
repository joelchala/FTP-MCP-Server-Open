# CLAUDE.md — FTP MCP Server Open

Guia de convenciones y contexto del proyecto para agentes de desarrollo.

## Proyecto

**FTP MCP Server Open** — Servidor MCP open-source que conecta modelos de IA a servidores FTP/SFTP remotos.
- **Autor:** Joel Chala
- **Version:** 2.0.0-open
- **Licencia:** MIT

## Comandos rapidos

```bash
# Instalar dependencias
npm install

# Compilar TypeScript + generar Prisma client
npm run build

# Iniciar servidor (requiere build previo)
npm start

# Desarrollo con watch mode
npm run dev

# Sincronizar schema de base de datos
npm run db:push

# Generar Prisma client
npm run db:generate
```

## Arquitectura

### Modo dual

- **Stdio** — Uso local con Claude Desktop/Code. Conexion unica via env vars.
- **HTTP** — Plataforma web con Express, panel admin, OAuth 2.0 + PKCE, API REST y MCP Streamable HTTP.

### Stack

| Capa | Tecnologia |
|------|-----------|
| Runtime | Node.js >= 18 (recomendado 22.x) |
| Lenguaje | TypeScript 5.7 (strict mode, ES2022, Node16 modules) |
| Backend | Express 4.21 |
| Base de datos | Prisma 6.0 + SQLite (default) / MySQL |
| FTP | basic-ftp 5.0 |
| SFTP | ssh2-sftp-client 11.0 |
| MCP | @modelcontextprotocol/sdk 1.12 |
| Validacion | Zod 3.24 |
| Auth | bcryptjs + JWT HS256 + OAuth 2.0 + PKCE |
| Frontend | HTML5 + CSS3 + Vanilla JS (tema oscuro) |

### Estructura de directorios

```
src/
  index.ts              # Entrada principal (Express + MCP)
  constants.ts          # Constantes globales
  types.ts              # Interfaces TypeScript
  env-loader.ts         # Carga de variables de entorno
  auth/                 # Autenticacion (password, OAuth, sesiones)
  config/               # Configuracion (database, encryption)
  middleware/            # Middleware Express (auth.web, auth.mcp)
  routes/               # Rutas API REST (auth, sites, oauth, files, settings, pages)
  mcp/                  # MCP Streamable HTTP transport
  schemas/              # Schemas Zod (connection, navigation, fileops, site)
  services/             # Logica de negocio (connection.manager, ftp.client, sftp.client)
  helpers/              # Formateo de errores y respuestas
  tools/                # Implementaciones de las 14 MCP tools
public/
  *.html                # Paginas del panel web
  css/style.css         # Estilos (tema oscuro)
  js/app.js             # JavaScript del frontend
prisma/
  schema.prisma         # Modelos: User, Site, OauthClient, Session, AuthorizationCode
```

## Convenciones de codigo

### Headers de archivo

Todo archivo TypeScript debe incluir un header con este formato:

```typescript
/*
 * Archivo: nombre-del-archivo.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Breve descripcion del proposito del archivo
 * Ruta: ftp-mcp-server-open/src/ruta/nombre-del-archivo.ts
 */
```

### Nomenclatura

| Contexto | Convencion | Ejemplo |
|----------|-----------|---------|
| Variables y funciones | camelCase | `getErrorMessage`, `basePath` |
| Tipos e interfaces | PascalCase | `FileEntry`, `ConnectionConfig` |
| Constantes | UPPER_SNAKE_CASE | `DEFAULT_MAX_FILE_SIZE`, `SERVER_NAME` |
| Columnas BD (Prisma) | camelCase en modelo, snake_case en BD via `@map` | `passwordHash` → `password_hash` |
| Archivos TS | kebab-case con sufijo de tipo | `auth.routes.ts`, `connection.manager.ts` |
| Rutas API | kebab-case | `/api/auth/register`, `/api/files/list` |

### Sufijos de archivos

| Sufijo | Proposito |
|--------|----------|
| `.routes.ts` | Rutas Express (Router) |
| `.tools.ts` | Implementaciones MCP tools |
| `.schema.ts` | Schemas de validacion Zod |
| `.helper.ts` | Utilidades de formateo/errores |
| `.client.ts` | Clientes FTP/SFTP |
| `.manager.ts` | Gestion de conexiones/estado |

### Imports

- Usar ES modules (`import`/`export`), nunca CommonJS (`require`)
- Siempre incluir extension `.js` en imports relativos (requerido por Node16 module resolution)
- Imports de tipos con `import type` cuando solo se importan tipos

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
```

### Idioma

- **Comentarios:** Espanol (sin acentos en el codigo fuente)
- **Variables/funciones:** Ingles
- **Mensajes de error al usuario (API):** Espanol
- **Logs internos (logToStderr):** Espanol con prefijo entre corchetes `[MODULO]`

```typescript
logToStderr(`[AUTH] Usuario registrado: ${email}`);
logToStderr(`[DB ERROR] No se pudo conectar: ${error.message}`);
```

### Patrones del proyecto

#### Rutas Express

```typescript
export const miRoutes = Router();

miRoutes.post("/endpoint", async (req, res) => {
  try {
    const parsed = miSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos invalidos", details: parsed.error.flatten() });
      return;
    }
    // logica...
    res.json({ resultado });
  } catch (error) {
    logToStderr(`[MODULO] Error: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
```

#### Validacion con Zod

- Siempre usar `safeParse`, nunca `parse` directo
- Retornar 400 con `error.flatten()` en caso de fallo

#### Manejo de errores

- Usar funciones de `helpers/error.helper.ts` para errores formateados en MCP tools
- En rutas API: try/catch con `logToStderr` y respuesta JSON generica
- Nunca exponer stack traces en produccion

#### Base de datos

- Acceder via `getDatabase()` (singleton Prisma)
- Credenciales FTP encriptadas con AES-256-GCM (`config/encryption.ts`)
- Passwords de usuario hasheados con bcryptjs (cost factor 12)

## Seguridad

- Path traversal: Todas las rutas se sanitizan contra `../` en `file.utils.ts`
- Extension whitelisting: Solo extensiones autorizadas para escritura
- Rate limiting: Auth (50/15min), API (300/15min), MCP (60/min)
- Sesiones: Token random 64 hex, 24h TTL, cookies httpOnly/Secure/SameSite
- JWT: HS256, 1h TTL para tokens MCP
- Helmet: Headers HTTP de seguridad con CSP estricto

## Base de datos

### Modelos Prisma

| Modelo | Proposito |
|--------|----------|
| `User` | Usuarios (email, password hash, nombre) |
| `Site` | Sitios FTP/SFTP (credenciales encriptadas AES-256-GCM) |
| `OauthClient` | Credenciales OAuth (clientId, secret hasheado) |
| `Session` | Sesiones web (token, 24h TTL) |
| `AuthorizationCode` | Codigos OAuth temporales (10min TTL, PKCE SHA-256) |

### Cambios al schema

1. Modificar `prisma/schema.prisma`
2. Ejecutar `npm run db:push` para sincronizar
3. Ejecutar `npm run db:generate` para regenerar el client

## Variables de entorno

- Nunca hardcodear secrets en el codigo
- Usar `.env` para desarrollo, `.env.production` para produccion
- `ENCRYPTION_KEY` y `JWT_SECRET` son requeridos (64 chars hex, 32 bytes)
- Ver `.env.example` para la lista completa

## Git

### Commits

- Mensajes concisos en ingles
- Formato: `tipo: descripcion breve`
- Tipos: `feat`, `fix`, `refactor`, `docs`, `chore`, `security`
- Firmar con nombre del agente: `Co-Authored-By: Omar <noreply@anthropic.com>`

### Ramas

- `main` — rama principal estable
- Feature branches: `feat/nombre-descriptivo`
- Fix branches: `fix/nombre-descriptivo`
