import crypto from 'crypto';
import prisma from '../db';

const SALT = process.env.ADMIN_DELETE_SALT ?? 'obra-erp-admin-salt';

const hashPassword = (password: string) =>
  crypto.createHmac('sha256', SALT).update(password).digest('hex');

export const getDeletePasswordHash = async () => {
  const setting = await prisma.adminSetting.findUnique({ where: { id: 1 } });
  return setting?.deletePasswordHash ?? null;
};

export const verifyDeletePassword = async (candidate: string): Promise<boolean> => {
  const hash = await getDeletePasswordHash();
  if (!hash) return false;
  const candidateHash = hashPassword(candidate);
  return hash === candidateHash;
};

export const setDeletePassword = async (password: string) => {
  const hashed = hashPassword(password);
  await prisma.adminSetting.upsert({
    where: { id: 1 },
    update: { deletePasswordHash: hashed },
    create: { id: 1, deletePasswordHash: hashed },
  });
};
