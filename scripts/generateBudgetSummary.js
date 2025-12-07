const fs = require('fs');
const path = require('path');

const BUDGET_FILE = path.join(__dirname, '../api/backups/cotizaciones/normalized_budget.json');
const SUMMARY_FILE = path.join(__dirname, '../api/backups/cotizaciones/budget_summary.json');
const CSV_FILE = path.join(__dirname, '../api/backups/cotizaciones/budget_items.csv');

const toNumber = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const main = () => {
  if (!fs.existsSync(BUDGET_FILE)) {
    throw new Error('normalized_budget.json not found. Run normalizeBudget script first.');
  }
  const payload = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  const items = payload.items || [];

  const summary = {};
  const csvLines = ['group,code,description,unit,qty_contractual,qty_metrado,add_qty,new_qty,deduction_qty,binding_qty'];

  for (const item of items) {
    const group = item.group || 'UNKNOWN';
    if (!summary[group]) {
      summary[group] = { contractual: 0, metrado: 0, additions: 0, newItems: 0, deductions: 0, binding: 0, count: 0 };
    }
    const totals = summary[group];
    totals.contractual += toNumber(item.qtyContractual);
    totals.metrado += toNumber(item.qtyMetrado);
    totals.additions += toNumber(item.additions?.quantity);
    totals.newItems += toNumber(item.newItems?.quantity);
    totals.deductions += toNumber(item.deductions?.quantity);
    totals.binding += toNumber(item.bindingDeduction?.quantity);
    totals.count += 1;

    const line = [
      group,
      item.code ?? '',
      '"' + (item.description ?? '').replace(/"/g, "'") + '"',
      item.unit ?? '',
      item.qtyContractual ?? '',
      item.qtyMetrado ?? '',
      item.additions?.quantity ?? '',
      item.newItems?.quantity ?? '',
      item.deductions?.quantity ?? '',
      item.bindingDeduction?.quantity ?? ''
    ].join(',');
    csvLines.push(line);
  }

  const totals = Object.entries(summary).map(([group, data]) => ({ group, ...data }));
  const result = {
    generatedAt: new Date().toISOString(),
    totals,
    overall: totals.reduce((acc, item) => {
      acc.contractual += item.contractual;
      acc.metrado += item.metrado;
      acc.additions += item.additions;
      acc.newItems += item.newItems;
      acc.deductions += item.deductions;
      acc.binding += item.binding;
      acc.count += item.count;
      return acc;
    }, { contractual: 0, metrado: 0, additions: 0, newItems: 0, deductions: 0, binding: 0, count: 0 })
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(result, null, 2));
  fs.writeFileSync(CSV_FILE, csvLines.join('\n'));
  console.log(`Budget summary saved to ${SUMMARY_FILE}`);
  console.log(`Flat CSV saved to ${CSV_FILE}`);
};

main();
