const fs = require('fs');
const path = require('path');
const XLSX = require('../api/node_modules/xlsx');

const METRADO_FILES = [
  { group: 'LP', file: 'METRADO BASE LP.xlsx', sheet: 'Mtdo-Ppto LP' },
  { group: 'RP', file: 'METRADO BASE RP.xlsx', sheet: 'Mtdo-Ppto RP' },
  { group: 'RS', file: 'METRADO BASE RS.xlsx', sheet: 'Mtdo-Ppto RS' },
  { group: 'SFV', file: 'METRADO BASE SFV.xlsx', sheet: 'Mtdo-Ppto SFV' },
];

const SOURCE_DIR = path.join(__dirname, '../api/backups/cotizaciones');
const OUTPUT_FILE = path.join(SOURCE_DIR, 'normalized_budget.json');

const toNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
};

const cleanText = value => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

const parseSheet = ({ group, file, sheet }) => {
  const workbookPath = path.join(SOURCE_DIR, file);
  const wb = XLSX.readFile(workbookPath, { cellDates: false, cellNF: false, cellText: false });
  const ws = wb.Sheets[sheet];
  if (!ws) {
    throw new Error(`Sheet ${sheet} not found in ${file}`);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell).trim() === 'ITEM'));
  if (headerIndex === -1) {
    throw new Error(`Header row not found in ${file}`);
  }
  const records = [];
  for (let i = headerIndex + 4; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const rawCode = cleanText(row[0]);
    const description = cleanText(row[2] || row[1]);
    const unit = cleanText(row[5]);
    const qtyContractual = toNumber(row[8]);
    const qtyMetrado = toNumber(row[10]);
    const additionQty = toNumber(row[13]);
    const additionTotal = toNumber(row[14]);
    const newQty = toNumber(row[15]);
    const newTotal = toNumber(row[16]);
    const deductionQty = toNumber(row[17]);
    const deductionTotal = toNumber(row[18]);
    const bindingQty = toNumber(row[19]);
    const bindingTotal = toNumber(row[20]);
    const observation = cleanText(row[21]);

    if (!rawCode && !description) continue;

    records.push({
      group,
      code: rawCode || null,
      description,
      unit: unit || null,
      qtyContractual,
      qtyMetrado,
      additions: additionQty || additionTotal ? { quantity: additionQty, total: additionTotal } : null,
      newItems: newQty || newTotal ? { quantity: newQty, total: newTotal } : null,
      deductions: deductionQty || deductionTotal ? { quantity: deductionQty, total: deductionTotal } : null,
      bindingDeduction: bindingQty || bindingTotal ? { quantity: bindingQty, total: bindingTotal } : null,
      observation: observation || null,
      nameMapping: description.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim(),
    });
  }
  return records.filter(item => item.description);
};

const main = () => {
  const dataset = METRADO_FILES.flatMap(parseSheet);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), items: dataset }, null, 2));
  console.log(`Budget normalized with ${dataset.length} items -> ${OUTPUT_FILE}`);
};

main();
