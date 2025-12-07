import { Router } from 'express';
import { z } from 'zod';
import { getDeletePasswordHash, setDeletePassword, verifyDeletePassword } from '../services/adminSecurity';

const router = Router();

router.get('/admin/security/status', async (_req, res) => {
  const hash = await getDeletePasswordHash();
  res.json({ hasPassword: Boolean(hash) });
});

router.post('/admin/security/password', async (req, res) => {
  const Schema = z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(4).max(120),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detail: parsed.error.flatten() });
  }
  const { currentPassword, newPassword } = parsed.data;
  const hash = await getDeletePasswordHash();
  if (hash) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Debes ingresar la contraseña actual.' });
    }
    const ok = await verifyDeletePassword(currentPassword);
    if (!ok) {
      return res.status(403).json({ error: 'Contraseña actual incorrecta.' });
    }
  }
  await setDeletePassword(newPassword);
  res.json({ ok: true });
});

router.post('/auth/unlock-delete', async (req, res) => {
  const Schema = z.object({ password: z.string().min(1) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Contraseña requerida.' });
  }
  const ok = await verifyDeletePassword(parsed.data.password);
  if (!ok) {
    return res.status(403).json({ error: 'Contraseña inválida.' });
  }
  res.json({ ok: true });
});

export default router;
