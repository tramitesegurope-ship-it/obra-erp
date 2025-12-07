import prisma from '../db';
import { loadFoodWasteTable } from '../lib/foodWasteTable';

let ensured = false;

export async function seedFoodWasteTable(): Promise<number> {
  const records = loadFoodWasteTable();
  if (!records.length) return 0;

  const existing = await prisma.foodIngredient.findMany({
    select: { name: true },
  });
  const existingSet = new Set(existing.map(item => item.name.toLowerCase()));

  const data = records
    .filter(record => !existingSet.has(record.name.toLowerCase()))
    .map(record => ({
      name: record.name,
      category: record.category ?? null,
      unit: record.unit ?? null,
      defaultWastePct: record.defaultWastePct ?? 0,
    }));

  if (!data.length) return 0;

  const result = await prisma.foodIngredient.createMany({
    data,
  });

  return result.count ?? data.length;
}

export async function ensureFoodWasteSeeded(): Promise<number> {
  if (ensured) return 0;
  const count = await prisma.foodIngredient.count();
  if (count > 0) {
    ensured = true;
    return 0;
  }
  const created = await seedFoodWasteTable();
  ensured = true;
  return created;
}
