const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

type Method = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

async function request<T = any>(method: Method, url: string, data?: any): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  };
  const res = await fetch(BASE + url, opts);
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText);
  }
  // algunos endpoints PUT/DELETE pueden no devolver JSON
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const api = {
  get:   <T = any>(url: string) => request<T>('GET', url),
  post:  <T = any>(url: string, data?: any) => request<T>('POST', url, data),
  put:   <T = any>(url: string, data?: any) => request<T>('PUT', url, data),
  patch: <T = any>(url: string, data?: any) => request<T>('PATCH', url, data),
  delete:<T = any>(url: string) => request<T>('DELETE', url),
};

export default api;
