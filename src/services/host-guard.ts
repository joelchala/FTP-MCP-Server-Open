/*
 * Archivo: host-guard.ts
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Bloquea conexiones a hosts internos (SSRF) salvo ALLOW_PRIVATE_HOSTS=true
 * Ruta: ftp-mcp-server-open/src/services/host-guard.ts
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Indica si una IP (v4 o v6) es privada, loopback, link-local o no enrutable
export function isPrivateIp(ip: string): boolean {
  let addr = ip.toLowerCase();

  // IPv4 mapeada en IPv6 (::ffff:10.0.0.1)
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) addr = mapped[1]!;

  if (isIP(addr) === 4) {
    const [a, b] = addr.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||           // link-local / metadata cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224                              // multicast y reservadas
    );
  }

  // IPv6: loopback, no especificada, ULA (fc00::/7), link-local (fe80::/10), multicast
  return (
    addr === "::1" || addr === "::" ||
    /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr) || /^ff/.test(addr)
  );
}

// Lanza error si el host apunta a una direccion interna
// Se llama en cada conexion (no solo al guardar el sitio) para cubrir cambios de DNS
export async function assertHostAllowed(host: string): Promise<void> {
  if (process.env.ALLOW_PRIVATE_HOSTS === "true") return;

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((r) => r.address);

  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new Error(
      "Host no permitido: apunta a una direccion interna. Define ALLOW_PRIVATE_HOSTS=true si es intencional."
    );
  }
}
