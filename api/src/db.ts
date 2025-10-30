// src/db.ts
import { PrismaClient } from '@prisma/client';

// Un único cliente para toda la app
const prisma = new PrismaClient({ log: ['warn', 'error'] });

export default prisma;
