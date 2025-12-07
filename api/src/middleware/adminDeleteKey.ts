import type { Request, Response, NextFunction } from 'express';
import { verifyDeletePassword } from '../services/adminSecurity';

const HEADER_NAME = 'x-admin-delete-password';

const extractPassword = (req: Request): string | null => {
  const fromHeader = req.header(HEADER_NAME);
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  if (typeof req.body?.adminPassword === 'string' && req.body.adminPassword.trim()) {
    return req.body.adminPassword.trim();
  }
  if (typeof req.query?.adminPassword === 'string' && (req.query.adminPassword as string).trim()) {
    return (req.query.adminPassword as string).trim();
  }
  return null;
};

export const requireAdminDeleteKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const password = extractPassword(req);
    if (!password) {
      return res.status(403).json({ error: 'Ingresa la contraseña de administrador para eliminar.' });
    }
    const ok = await verifyDeletePassword(password);
    if (!ok) {
      return res.status(403).json({ error: 'Contraseña de administrador incorrecta.' });
    }
    return next();
  } catch (error) {
    console.error('Error al validar contraseña admin:', error);
    return res.status(500).json({ error: 'No se pudo validar la contraseña del administrador.' });
  }
};
