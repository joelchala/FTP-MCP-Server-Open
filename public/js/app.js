/*
 * Archivo: app.js
 * Autor: Joel Chala
 * Version: 2.0.0-open
 * Descripcion: Modulo JS compartido — sidebar, auth, toast, utilidades
 */

// ─── Auth Guard ─────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) { window.location.href = '/login'; return null; }
    const data = await res.json();
    return data.user || data;
  } catch {
    window.location.href = '/login';
    return null;
  }
}

// ─── API Helper ─────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Session expired
      if (res.status === 401) {
        window.location.href = '/login';
        throw { status: 401, error: 'Sesion expirada' };
      }
      throw { status: res.status, error: data.error || 'Error en la solicitud', ...data };
    }
    return data;
  } catch (err) {
    // Network error
    if (!err.status) {
      throw { status: 0, error: 'Error de conexion. Verifica tu internet.' };
    }
    throw err;
  }
}

// ─── Top Navigation ─────────────────────────────────────
function initTopNav(activePage) {
  const pages = [
    { id: 'dashboard', href: '/dashboard', icon: '&#127968;', label: 'Dashboard' },
    { id: 'projects', href: '/projects', icon: '&#128194;', label: 'Proyectos' },
    { id: 'explorer', href: '/explorer', icon: '&#128193;', label: 'Explorador' },
    { id: 'sites', href: '/sites', icon: '&#127760;', label: 'Conexiones' },
    { id: 'connect', href: '/connect', icon: '&#129302;', label: 'Conectores MCP' },
    { id: 'settings', href: '/settings', icon: '&#9881;', label: 'Config' },
  ];

  const navHTML = pages.map(p => {
    const cls = p.id === activePage ? ' active' : '';
    return `<a href="${p.href}" class="app-header-nav-item${cls}" data-page="${p.id}">
      <span class="nav-icon">${p.icon}</span>${p.label}
    </a>`;
  }).join('');

  const navContainer = document.querySelector('.app-header-nav');
  if (navContainer) {
    navContainer.innerHTML = navHTML;
  }
}

// ─── Init Header User ───────────────────────────────────
function initHeaderUser(user) {
  const headerRight = document.querySelector('.app-header-right');
  if (!headerRight) {
    console.error('initHeaderUser: .app-header-right no encontrado');
    return;
  }

  if (!user) {
    console.error('initHeaderUser: usuario no proporcionado');
    return;
  }

  try {
    const userName = user.name || user.email || 'Usuario';
    const initials = userName
      .split(' ')
      .map(n => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

    headerRight.innerHTML = `
      <div class="header-user">
        <div class="header-user-avatar">${initials}</div>
        <div class="header-user-info">
          <div class="header-user-name">${user.name || 'Usuario'}</div>
          <div class="header-user-email">${user.email || ''}</div>
        </div>
      </div>
      <button class="header-logout" onclick="handleLogout()">
        <span>&#128682;</span>
        <span>Salir</span>
      </button>
    `;

    console.log('✅ Header de usuario inicializado correctamente');
  } catch (error) {
    console.error('❌ Error en initHeaderUser:', error);
    // Mostrar un header básico en caso de error
    headerRight.innerHTML = `
      <button class="header-logout" onclick="handleLogout()">
        <span>&#128682;</span>
        <span>Salir</span>
      </button>
    `;
  }
}

// ─── Toast Notifications ────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ─── Logout ─────────────────────────────────────────────
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  window.location.href = '/login';
}

// ─── Modal ──────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ─── Copy to Clipboard ──────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copiado al portapapeles', 'success', 2000);
  } catch {
    showToast('Error al copiar', 'error');
  }
}

// ─── Confirm Dialog ─────────────────────────────────────
function confirmDialog(message, onConfirm, options = {}) {
  const title = options.title || 'Confirmar';
  const confirmText = options.confirmText || 'Confirmar';
  const cancelText = options.cancelText || 'Cancelar';
  const danger = options.danger || false;

  // Remove existing dialog if any
  const existing = document.getElementById('confirm-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '420px';
  modal.innerHTML = `
    <h3>${title}</h3>
    <p style="color: var(--text-secondary); margin: 16px 0 24px; font-size: 14px; line-height: 1.5;">${message}</p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${confirmText}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const cleanup = () => overlay.remove();

  document.getElementById('confirm-cancel').onclick = cleanup;
  document.getElementById('confirm-ok').onclick = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };

  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
}

// ─── Prompt Dialog ──────────────────────────────────────
function promptDialog(message, defaultValue, onConfirm, options = {}) {
  const title = options.title || 'Ingresa un valor';
  const confirmText = options.confirmText || 'Confirmar';
  const cancelText = options.cancelText || 'Cancelar';

  const existing = document.getElementById('prompt-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'prompt-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '420px';
  modal.innerHTML = `
    <h3>${title}</h3>
    <p style="color: var(--text-secondary); margin: 12px 0 16px; font-size: 14px;">${message}</p>
    <input type="text" id="prompt-input" value="${defaultValue || ''}" style="width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 14px; font-family: inherit; margin-bottom: 20px;">
    <div class="modal-footer">
      <button class="btn btn-secondary" id="prompt-cancel">${cancelText}</button>
      <button class="btn btn-primary" id="prompt-ok">${confirmText}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = document.getElementById('prompt-input');
  input.focus();
  input.select();

  const cleanup = () => overlay.remove();

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    cleanup();
    if (onConfirm) onConfirm(value);
  };

  document.getElementById('prompt-cancel').onclick = cleanup;
  document.getElementById('prompt-ok').onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cleanup(); };
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
}

// ─── Skeleton Loaders ───────────────────────────────────
function showSkeleton(containerId, count = 3, type = 'line') {
  const el = document.getElementById(containerId);
  if (!el) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    if (type === 'card') html += '<div class="skeleton skeleton-card"></div>';
    else if (type === 'stat') html += '<div class="skeleton skeleton-stat"></div>';
    else html += `<div class="skeleton skeleton-line${i === count - 1 ? ' short' : ''}"></div>`;
  }
  el.innerHTML = html;
}

function removeSkeleton(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const skeletons = el.querySelectorAll('.skeleton');
  skeletons.forEach(s => s.remove());
}

// ─── Format Helpers ─────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(str) {
  if (!str) return 'Nunca';
  const now = Date.now();
  const d = new Date(str).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Hace unos segundos';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} dias`;
  return formatDate(str);
}

// ─── Action Icons Map ───────────────────────────────────
function getActionIcon(action) {
  const icons = {
    file_read: '&#128196;',
    file_write: '&#128221;',
    file_delete: '&#128465;',
    file_mkdir: '&#128194;',
    file_rename: '&#9999;',
    site_create: '&#10133;',
    site_update: '&#9999;',
    site_delete: '&#128465;',
    site_test: '&#128268;',
    login: '&#128274;',
    register: '&#128100;',
    oauth_generate: '&#128273;',
    oauth_revoke: '&#128683;',
  };
  return icons[action] || '&#9679;';
}

function getActionLabel(action) {
  const labels = {
    file_read: 'Archivo leido',
    file_write: 'Archivo escrito',
    file_delete: 'Archivo eliminado',
    file_mkdir: 'Directorio creado',
    file_rename: 'Archivo renombrado',
    site_create: 'Sitio creado',
    site_update: 'Sitio actualizado',
    site_delete: 'Sitio eliminado',
    site_test: 'Conexion probada',
    login: 'Inicio de sesion',
    register: 'Registro',
    oauth_generate: 'Credenciales generadas',
    oauth_revoke: 'Credenciales revocadas',
  };
  return labels[action] || action;
}
