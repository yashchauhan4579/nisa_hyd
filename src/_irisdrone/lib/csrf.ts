let csrfTokenCache = '';
let csrfTokenPromise: Promise<string> | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && csrfTokenCache) {
    return csrfTokenCache;
  }
  if (!forceRefresh && csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = fetch('/api/auth/csrf-token', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'same-origin',
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`CSRF token request failed (${res.status})`);
      }
      const data = await res.json();
      const token = String(data?.csrfToken ?? '').trim();
      if (!token) {
        throw new Error('CSRF token missing in response');
      }
      csrfTokenCache = token;
      return token;
    })
    .finally(() => {
      csrfTokenPromise = null;
    });

  return csrfTokenPromise;
}

export function clearCsrfTokenCache(): void {
  csrfTokenCache = '';
  csrfTokenPromise = null;
}
