const fs = require('fs');
const path = require('path');
const XLSX = require('../api/node_modules/xlsx');

const APU_FILE = path.join(__dirname, '../api/backups/cotizaciones/A.P.U. Pamparomas.xls');
const OUTPUT_FILE = path.join(__dirname, '../api/backups/cotizaciones/apu_norms.json');

const sheetNames = ['MT', 'BT', 'SF'];

const HEADER_ALIASES = {
  item: ['item', 'ítem', 'codigo', 'cod.'],
  description: ['descripción', 'descripcion', 'artículo', 'articulos'],
  descriptionOffered: ['ofertada', 'oferta', 'descripcion ofertada'],
  quantity: ['cantidad', 'cant.', 'cant'],
  unit: ['u.m.', 'unidad', 'um'],
  unitPrice: ['p. unitario', 'prec. unit.', 'precio unitario', 'p. unit', 'p.unitario', 'precio u'],
  subtotal: ['subtotal', 'sub total', 'precio parcial', 'precio partial', 's/'],
};

const findColumn = (headers, aliases) => {
  const normalized = headers.map(cell => String(cell || '').toLowerCase());
  for (const term of aliases) {
    const idx = normalized.findIndex(value => value.includes(term.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseWorksheet = (sheetName, ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const activities = [];
  let headerIndex = rows.findIndex(row =>
    row.some(cell => String(cell).toLowerCase().includes('item')),
  );
  if (headerIndex < 0) headerIndex = rows.findIndex(row =>
    row.some(cell => String(cell).toLowerCase().includes('descripcion')),
  );
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex] || [];
  const cols = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)]),
  );

  const components = [];
  let currentHeading = null;
  let cursor = headerIndex + 1;
  while (cursor < rows.length) {
    const current = rows[cursor];
    const desc = String(current[cols.description] || current[cols.descriptionOffered] || '').trim();
    if (!desc && (current.every(cell => cell === '' || cell === null))) {
      cursor += 1;
      continue;
    }
    const quantity = Math.max(0, Number(current[cols.quantity] ?? current[cols.subtotal] ?? 0));
    const unitPrice = Number(current[cols.unitPrice] ?? current[cols.subtotal] ?? 0);
    const subtotal = Number(current[cols.subtotal] ?? (quantity * unitPrice));
    const isHeaderRow =
      !quantity &&
      !unitPrice &&
      !subtotal &&
      desc.length > 3 &&
      desc === desc.toUpperCase();
    if (isHeaderRow) {
      currentHeading = desc.trim();
      cursor += 1;
      continue;
    }
    if (desc) {
      const finalDescription = currentHeading ? `${currentHeading} · ${desc}` : desc;
      components.push({
        itemCode: String(current[cols.item] || '').trim() || null,
        description: finalDescription,
        descriptionOffered: String(current[cols.descriptionOffered] || '').trim() || null,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
        unit: String(current[cols.unit] || '').trim() || null,
        unitCost: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
        partial: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
      });
    }
    cursor += 1;
  }

  if (components.length) {
    activities.push({
      sheet: sheetName,
      components,
    });
  }
  return activities;
};

const main = () => {
  const workbook = XLSX.readFile(APU_FILE);
  const dataset = sheetNames.flatMap(name => {
    const ws = workbook.Sheets[name];
    if (!ws) return [];
    return parseWorksheet(name, ws);
  });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), activities: dataset }, null, 2));
  console.log(`APU parsed into ${OUTPUT_FILE}`);
};

main();
