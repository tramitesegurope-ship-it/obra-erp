import fs from 'fs';
import path from 'path';

export type FoodWasteRecord = {
  name: string;
  unit?: string;
  category?: string;
  defaultWastePct?: number;
};

let cache: FoodWasteRecord[] | null = null;
let normalizedCache: { record: FoodWasteRecord; normalized: string }[] | null = null;

const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim();

export function loadFoodWasteTable(): FoodWasteRecord[] {
  if (cache) return cache;
  const filePath = path.resolve(__dirname, '../../data/food-waste-table.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cache = parsed
        .filter(item => item && typeof item.name === 'string')
        .map(item => ({
          name: String(item.name).trim(),
          unit: item.unit ? String(item.unit).trim() : undefined,
          category: item.category ? String(item.category).trim() : undefined,
          defaultWastePct:
            typeof item.defaultWastePct === 'number'
              ? Math.max(0, Math.min(0.9, item.defaultWastePct))
              : undefined,
        }));
      normalizedCache = cache.map(record => ({
        record,
        normalized: normalizeName(record.name),
      }));
      return cache;
    }
  } catch (error) {
    console.warn('No se pudo cargar tabla de mermas:', error);
  }
  cache = [];
  normalizedCache = [];
  return cache;
}

export function findWasteRecordByName(name: string): FoodWasteRecord | null {
  if (!name) return null;
  if (!cache) loadFoodWasteTable();
  if (!normalizedCache) return null;
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const direct = normalizedCache.find(entry => entry.normalized === normalized);
  if (direct) return direct.record;
  const partial = normalizedCache.find(entry => entry.normalized.includes(normalized) || normalized.includes(entry.normalized));
  return partial?.record ?? null;
}
