/*
 * Archivo: pages.routes.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Rutas para servir las paginas HTML del panel web
 * Ruta: ftp-mcp-server-open/src/routes/pages.routes.ts
 */

import { Router } from "express";
import type { Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pagesRoutes = Router();

// Directorio public/ relativo a dist/routes/
const publicDir = path.join(__dirname, "..", "..", "public");

// Helper: envia archivo HTML con manejo de errores
function sendPage(res: Response, filename: string): void {
  const filePath = path.join(publicDir, filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(404).json({ error: `Pagina no encontrada: ${filename}` });
      }
    }
  });
}

// Pagina de login
pagesRoutes.get("/login", (_req: Request, res: Response) => {
  sendPage(res, "login.html");
});

// Pagina de registro
pagesRoutes.get("/register", (_req: Request, res: Response) => {
  sendPage(res, "register.html");
});

// Pagina de dashboard
pagesRoutes.get("/dashboard", (_req: Request, res: Response) => {
  sendPage(res, "dashboard.html");
});

// Pagina de sitios FTP
pagesRoutes.get("/sites", (_req: Request, res: Response) => {
  sendPage(res, "sites.html");
});

// Pagina de conexion MCP
pagesRoutes.get("/connect", (_req: Request, res: Response) => {
  sendPage(res, "connect.html");
});

// Pagina de proyectos
pagesRoutes.get("/projects", (_req: Request, res: Response) => {
  sendPage(res, "projects.html");
});

// Pagina de explorador de archivos
pagesRoutes.get("/explorer", (_req: Request, res: Response) => {
  sendPage(res, "explorer.html");
});

// Pagina de configuracion
pagesRoutes.get("/settings", (_req: Request, res: Response) => {
  sendPage(res, "settings.html");
});

// Pagina de autorizacion OAuth (Authorization Code + PKCE)
// Los clientes MCP redirigen aqui con parametros OAuth en la URL
pagesRoutes.get("/authorize", (_req: Request, res: Response) => {
  sendPage(res, "authorize.html");
});
