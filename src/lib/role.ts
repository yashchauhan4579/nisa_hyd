// Lightweight role read from the persisted auth (JWT payload or stored user),
// usable outside React (e.g. DataCacheContext) without coupling to AuthContext.
export function currentRole(): string {
  try {
    const u = localStorage.getItem('user');
    if (u) {
      const role = JSON.parse(u)?.role;
      if (role) return String(role).toLowerCase();
    }
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      if (payload?.role) return String(payload.role).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function isAdmin(): boolean {
  return currentRole() === 'admin';
}
