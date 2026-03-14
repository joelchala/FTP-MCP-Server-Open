# FTP MCP Server Open

Open source MCP Server for connecting AI models (Claude, ChatGPT, Gemini, etc.) to remote FTP/SFTP servers. Manage, read, write, and navigate files on your remote servers using any MCP-compatible LLM.

**Author**: Joel Chala
**Version**: 2.0.0-open
**License**: MIT

---

## FTP MCP Server — Version de pago (Online)

Existe una version de pago con funcionalidades optimizadas disponible en:

**[https://ftpmcpserver.site](https://ftpmcpserver.site)**

La version online de **FTP MCP Server** comparte el mismo codigo base que esta version open source, pero incluye modificaciones especificas para no interferir con la entropia del sistema y ofrecer una experiencia mas fluida en produccion. Si buscas una solucion lista para usar sin necesidad de configurar tu propio servidor, la version de pago es la opcion ideal.

---

## Features

- **14 MCP Tools** — List, read, write, search, create, delete, and rename files and directories via FTP/SFTP
- **Dual Mode** — Stdio (local CLI) and HTTP (web platform with admin panel)
- **OAuth 2.0 + PKCE** — Secure integration with Claude.ai, ChatGPT, Gemini and other MCP clients
- **Web Admin Panel** — Dashboard, file explorer, site management, OAuth credentials
- **SQLite by default** — Zero-configuration database, with optional MySQL support
- **AES-256-GCM Encryption** — FTP credentials encrypted at rest
- **FTP & SFTP** — Full support for both protocols
- **Auto-recovery** — Automatic reconnection on FTP/DB failures with Prisma panic recovery
- **Large file support** — Up to 500MB read limit, extended timeouts for write operations

## Compatibility

### Supported MCP Clients

| Client | Transport | Notes |
|--------|-----------|-------|
| Claude Desktop | stdio | Config via `claude_desktop_config.json` |
| Claude Code | stdio | Config via CLI `claude mcp add` |
| Cursor | stdio | Config in editor settings |
| Windsurf | stdio | Config in editor settings |
| claude.ai | HTTP + OAuth PKCE | Remote MCP connector |
| ChatGPT | HTTP + OAuth PKCE | Remote MCP connector (when available) |
| Gemini | HTTP + OAuth PKCE | Remote MCP connector (when available) |
| Any MCP client | stdio / HTTP | Depending on client support |

## Requirements

- **Node.js** >= 18 (recommended 22.x)
- **npm** >= 9
- Access to an FTP or SFTP server

### Additional for HTTP mode (web platform)

- A public domain/URL (for Claude.ai integration)

## Quick Start

```bash
git clone https://github.com/joelchala/FTP-MCP-Server-Open.git
cd FTP-MCP-Server-Open
npm install
npm run build
cp .env.example .env
```

## Configuration

### Stdio mode (local use)

```env
TRANSPORT=stdio
FTP_PROTOCOL=sftp
FTP_HOST=your-server.com
FTP_PORT=22
FTP_USER=your-user
FTP_PASSWORD=your-password
FTP_BASE_PATH=/public_html
```

### HTTP mode (web platform)

```env
TRANSPORT=http
PORT=3000
BASE_URL=https://your-domain.com
DATABASE_URL="file:./data.db"
JWT_SECRET=your_64_hex_char_key
ENCRYPTION_KEY=your_64_hex_char_key
CORS_ORIGINS=https://your-domain.com,https://claude.ai
```

Generate secret keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Initialize the database:
```bash
npx prisma db push
```

Start the server:
```bash
npm start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TRANSPORT` | MCP transport: `stdio` or `http` | `stdio` |
| `PORT` | HTTP server port | `3000` |
| `BASE_URL` | Public server URL | `http://localhost:3000` |
| `DATABASE_URL` | Database connection (SQLite or MySQL) | `file:./data.db` |
| `JWT_SECRET` | JWT signing key (HS256) | - |
| `ENCRYPTION_KEY` | AES-256 hex key (64 chars) | - |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | BASE_URL |
| `NODE_ENV` | Environment: `production` or `development` | `development` |
| `FTP_PROTOCOL` | Protocol: `ftp` or `sftp` (stdio mode) | `sftp` |
| `FTP_HOST` | Server hostname (stdio mode) | `localhost` |
| `FTP_PORT` | Connection port (stdio mode) | `22` |
| `FTP_USER` | FTP username (stdio mode) | `anonymous` |
| `FTP_PASSWORD` | FTP password (stdio mode) | - |
| `SFTP_PRIVATE_KEY_PATH` | SSH private key path | - |
| `FTP_BASE_PATH` | Root sandbox directory | `/public_html` |
| `FTP_MAX_FILE_SIZE` | Max read size (bytes) | `524288000` (500MB) |
| `FTP_ALLOWED_EXTENSIONS` | Writable file extensions | See .env.example |
| `FTP_READ_TIMEOUT` | Read timeout (ms) | `120000` (2 min) |

> **Note on large files**: `FTP_MAX_FILE_SIZE` controls the maximum file size for read operations. Write operations have no artificial limit — the only constraint comes from the FTP/SFTP server itself. Adjust these values according to your needs.

### Database Options

**SQLite (default)** — Zero configuration:
```env
DATABASE_URL="file:./data.db"
```

**MySQL (advanced)** — Change `provider` in `prisma/schema.prisma` from `"sqlite"` to `"mysql"`:
```env
DATABASE_URL=mysql://user:password@localhost:3306/ftp_mcp_server_open
```

## Authentication

### Web authentication (admin panel)

- Registration with email and password (bcrypt, cost factor 12)
- Session-based login with cookies (httpOnly, Secure, SameSite=Lax, 24h TTL)

### OAuth 2.0 Authorization Code + PKCE (for Claude.ai)

Claude.ai connects using the standard OAuth 2.0 flow with PKCE (RFC 7636):

1. Register on the web panel (`/register`) and log in
2. Go to the connection page (`/connect`) and generate OAuth credentials
3. In Claude.ai, add a custom MCP connector with the URL: `https://your-domain.com/mcp`
4. Claude.ai redirects to `/authorize` where you authorize access
5. The server generates an authorization code, Claude.ai exchanges it for a JWT

**Auto-discovery**: Claude.ai discovers OAuth endpoints via:
- `/.well-known/oauth-protected-resource` (RFC 9728)
- `/.well-known/oauth-authorization-server` (RFC 8414)

**Credential format**:
- Client ID: `ftpmcp_` + 24 hex characters
- Client Secret: 48 hex characters (hashed with bcrypt)
- Access token: JWT HS256, 8h TTL

## Usage with Claude Desktop (stdio mode)

```json
{
  "mcpServers": {
    "ftp-server": {
      "command": "node",
      "args": ["/absolute/path/to/FTP-MCP-Server-Open/dist/index.js"],
      "env": {
        "FTP_PROTOCOL": "sftp",
        "FTP_HOST": "your-server.com",
        "FTP_PORT": "22",
        "FTP_USER": "user",
        "FTP_PASSWORD": "password",
        "FTP_BASE_PATH": "/public_html"
      }
    }
  }
}
```

## Usage with Claude Code (stdio mode)

```bash
claude mcp add ftp-server \
  -e FTP_PROTOCOL=sftp \
  -e FTP_HOST=your-server.com \
  -e FTP_PORT=22 \
  -e FTP_USER=user \
  -e FTP_PASSWORD=password \
  -e FTP_BASE_PATH=/public_html \
  -- node /absolute/path/to/FTP-MCP-Server-Open/dist/index.js
```

## Usage with Cursor / Windsurf (stdio mode)

Check your editor's documentation for adding MCP servers via stdio. The configuration requires the same environment variables shown above.

## MCP Tools (14)

### Site Management (HTTP mode only)

| Tool | Description |
|------|-------------|
| `ftp_list_sites` | List configured FTP sites |
| `ftp_select_site` | Select an FTP site for operations |

### Connection

| Tool | Description |
|------|-------------|
| `ftp_connect` | Connect to FTP/SFTP server |
| `ftp_disconnect` | Close active connection |
| `ftp_status` | Show connection status |

### Navigation

| Tool | Description |
|------|-------------|
| `ftp_list_directory` | List files and directories |
| `ftp_search_files` | Search files recursively by pattern |
| `ftp_get_file_info` | Get file metadata |

### File Operations

| Tool | Description |
|------|-------------|
| `ftp_read_file` | Read text file content |
| `ftp_write_file` | Write content to a file |
| `ftp_create_directory` | Create a new directory |
| `ftp_delete_file` | Delete a file |
| `ftp_delete_directory` | Delete a directory |
| `ftp_rename` | Rename or move a file/directory |

## Web Panel

The HTTP mode includes a full web admin panel:

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Public homepage |
| Login | `/login` | Sign in |
| Register | `/register` | Create account |
| Dashboard | `/dashboard` | Main panel with stats |
| Sites | `/sites` | Manage FTP/SFTP connections |
| Explorer | `/explorer` | Remote file browser and editor |
| Projects | `/projects` | Project-based view |
| Connect | `/connect` | Generate OAuth credentials |
| Settings | `/settings` | Profile, password, danger zone |
| Authorize | `/authorize` | OAuth authorization screen (PKCE) |

## HTTP API Endpoints

### Authentication API

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current user info |

### Sites API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sites` | List user's sites |
| POST | `/api/sites` | Create a site |
| PUT | `/api/sites/:id` | Update a site |
| DELETE | `/api/sites/:id` | Delete a site |
| POST | `/api/sites/:id/test` | Test FTP/SFTP connection |

### Files API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/files/list` | List directory files |
| GET | `/api/files/read` | Read file content |
| POST | `/api/files/write` | Write file content |
| GET | `/api/files/stat` | File metadata |
| POST | `/api/files/mkdir` | Create directory |
| DELETE | `/api/files/delete` | Delete file or directory |
| POST | `/api/files/rename` | Rename/move file or directory |
| GET | `/api/files/search` | Search files by pattern |

### OAuth API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/oauth/clients` | List OAuth credentials |
| POST | `/api/oauth/clients` | Generate new credentials |
| DELETE | `/api/oauth/clients/:id` | Revoke credentials |
| POST | `/oauth/authorize` | Generate authorization code (PKCE) |
| POST | `/oauth/token` | Exchange code/credentials for JWT |

### Settings API

| Method | Route | Description |
|--------|-------|-------------|
| PUT | `/api/settings/profile` | Update name/email |
| PUT | `/api/settings/password` | Change password |
| DELETE | `/api/settings/sessions` | Close all sessions |

### MCP & Discovery

| Method | Route | Description |
|--------|-------|-------------|
| POST/GET/DELETE | `/mcp` | MCP Streamable HTTP endpoint |
| GET | `/.well-known/oauth-protected-resource` | RFC 9728 resource metadata |
| GET | `/.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata |
| GET | `/health` | Basic health check |
| GET | `/debug/health` | Detailed health check |

## Project Structure

```
FTP-MCP-Server-Open/
  prisma/
    schema.prisma              # Models: User, Site, OauthClient, Session, AuthorizationCode
  public/
    index.html                 # Landing page
    login.html                 # Login
    register.html              # Registration
    dashboard.html             # Main dashboard
    sites.html                 # Site management
    explorer.html              # File explorer
    projects.html              # Projects view
    connect.html               # MCP connection
    settings.html              # Settings
    authorize.html             # OAuth authorization (PKCE)
    css/style.css              # Dark theme styles
    js/app.js                  # Frontend JavaScript
  src/
    index.ts                   # Main entry (Express + MCP)
    env-loader.ts              # Environment variable loading
    constants.ts               # Global constants
    types.ts                   # TypeScript interfaces
    auth/
      password.ts              # bcrypt hashing
      oauth-credentials.ts     # Client ID/Secret generation
      session.ts               # Session management
      protected-resource.ts    # RFC 9728/8414 OAuth discovery
    config/
      database.ts              # Prisma client singleton with auto-recovery
      encryption.ts            # AES-256-GCM encrypt/decrypt
    middleware/
      auth.web.ts              # Web auth middleware (sessions)
      auth.mcp.ts              # MCP auth middleware (JWT Bearer)
    routes/
      auth.routes.ts           # Register, login, logout
      sites.routes.ts          # FTP sites CRUD
      oauth.routes.ts          # OAuth: authorize, token, credentials
      files.routes.ts          # File operations
      settings.routes.ts       # User settings
      pages.routes.ts          # HTML page serving
    mcp/
      mcp.http.ts              # MCP Streamable HTTP transport
    schemas/
      connection.schema.ts     # Zod connection schemas
      navigation.schema.ts     # Zod navigation schemas
      fileops.schema.ts        # Zod file operation schemas
      site.schema.ts           # Zod site schemas
    services/
      connection.manager.ts    # Dual-mode connection manager
      ftp.client.ts            # FTP client (basic-ftp)
      sftp.client.ts           # SFTP client (ssh2-sftp-client)
      file.utils.ts            # File utilities
    helpers/
      error.helper.ts          # Error formatting
      format.helper.ts         # Response formatting
    tools/
      connection.tools.ts      # Tools: connect, disconnect, status
      navigation.tools.ts      # Tools: list, search, file_info
      fileops.tools.ts         # Tools: read, write, mkdir, delete, rename
      site.tools.ts            # Tools: list_sites, select_site
```

## Database

SQLite (default) or MySQL with Prisma ORM. Models:

- **User** — Users with email and hashed password (bcrypt)
- **Site** — FTP/SFTP sites with encrypted passwords (AES-256-GCM)
- **OauthClient** — OAuth credentials (clientId, hashed clientSecret)
- **Session** — Web sessions with random token and 24h expiration
- **AuthorizationCode** — Temporary codes for OAuth PKCE flow (10 min TTL)

## Security

- **Sandbox** — Operations limited to `FTP_BASE_PATH` directory
- **Extensions** — Writes only allowed for configured file extensions
- **Encryption** — FTP passwords encrypted with AES-256-GCM
- **Authentication** — bcrypt (cost 12) + JWT HS256
- **OAuth PKCE** — Authorization Code with SHA-256 code challenge
- **Sessions** — Random tokens, 24h expiration, automatic cleanup
- **Rate limiting** — Auth (50 req/15min), API (300 req/15min), MCP (60 req/min)
- **Helmet** — HTTP security headers with strict CSP
- **Path traversal** — Blocked via path sanitization
- **Cookies** — httpOnly, Secure, SameSite=Lax

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
