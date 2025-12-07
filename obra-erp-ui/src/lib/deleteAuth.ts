const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
const STORAGE_KEY = 'obra-admin-delete-password';
const EVENT_NAME = 'obra-admin-delete-changed';

const broadcast = () => {
  window.dispatchEvent(new Event(EVENT_NAME));
};

export const isDeleteUnlocked = () => Boolean(sessionStorage.getItem(STORAGE_KEY));

export const getDeletePassword = () => sessionStorage.getItem(STORAGE_KEY);

export const lockDelete = () => {
  sessionStorage.removeItem(STORAGE_KEY);
  broadcast();
};

export const unlockDelete = async (password: string) => {
  const trimmed = password.trim();
  if (!trimmed) throw new Error('Ingresa tu contraseña.');
  const res = await fetch(`${API_BASE}/auth/unlock-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: trimmed }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Contraseña inválida.');
  }
  sessionStorage.setItem(STORAGE_KEY, trimmed);
  broadcast();
};

export const subscribeDeleteAuth = (listener: () => void) => {
  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
};
