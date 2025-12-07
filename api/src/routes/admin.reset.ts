import { Router, Request, Response } from 'express';
import prisma from '../db';
import { resetDemoData } from '../services/resetDemo';

const router = Router();
const isResetEnabled =
  (process.env.ALLOW_DEMO_RESET ?? 'true').toLowerCase() === 'true';

router.post('/admin/reset-demo', async (_req: Request, res: Response) => {
  if (!isResetEnabled) {
    return res
      .status(403)
      .json({ error: 'Reset deshabilitado en este entorno.' });
  }

  try {
    await resetDemoData(prisma);
    res.json({
      ok: true,
      message: 'Información del proyecto eliminada correctamente.',
    });
  } catch (error) {
    console.error('Error al resetear datos demo', error);
    res.status(500).json({ error: 'No se pudo reiniciar la información.' });
  }
});

export default router;
