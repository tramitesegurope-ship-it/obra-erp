// api/src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import prisma from './db';

// Routers (cada uno exporta un Router con rutas como /materials, /moves, etc.)
import obras from './routes/obras';
import materials from './routes/materials';
import proveedores from './routes/proveedores';
import frentes from './routes/frentes';
import moves from './routes/moves';
import stock from './routes/stock';
import kardex from './routes/kardex';

const app = express();
const API_PREFIX = '/api';

// CORS para Vite / localhost
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));

// Health/version
app.get(`${API_PREFIX}/health`, (_req, res) => res.json({ ok: true }));
app.get(`${API_PREFIX}/version`, (_req, res) => res.json({ version: '1.0.0-mvp' }));

// ========= Montaje de rutas bajo /api =========
// Cada router debe definir internamente endpoints como:
//  - GET  /materials
//  - POST /materials
//  - PATCH/PUT /materials/:id
//  - GET  /moves, POST /moves, PATCH /moves/:id, etc.
app.use(API_PREFIX, obras);
app.use(API_PREFIX, materials);
app.use(API_PREFIX, proveedores);
app.use(API_PREFIX, frentes);
app.use(API_PREFIX, moves);
app.use(API_PREFIX, stock);
app.use(API_PREFIX, kardex);

// 404 para cualquier otra ruta de /api no encontrada
app.use(API_PREFIX, (_req, res) => res.status(404).json({ error: 'Not found' }));

// Handler global de errores (tipado TS)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validación', issues: err.issues });
  }
  if (err?.code === 'P2002') {
    // Prisma unique constraint
    return res.status(409).json({ error: 'Duplicado: constraint única' });
  }
  res.status(500).json({ error: 'Error interno' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`API ready on :${PORT}`));

// Cierre limpio de Prisma
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
