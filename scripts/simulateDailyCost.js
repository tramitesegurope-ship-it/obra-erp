const fs = require('fs');
const path = require('path');
const COST_SUMMARY = path.join(__dirname, '../api/backups/cotizaciones/cost_summary.json');
const DAILY_OUTPUT = path.join(__dirname, '../api/backups/cotizaciones/daily_cost_sample.json');
const REPORT_OUTPUT = path.join(__dirname, '../api/backups/cotizaciones/daily_cost_report.json');

const simulateDay = () => {
  const payload = JSON.parse(fs.readFileSync(COST_SUMMARY, 'utf8'));
  const items = payload.items.slice(0, 50);
  const entries = items.map((item, index) => {
    const qty = Number(item.qtyBudget) ? Number(item.qtyBudget) * 0.01 : 1;
    const components = (item.norma || []).filter(component => component.unit);
    const materials = components.filter(component => component.unit !== 'h-h');
    const labor = components.filter(component => component.unit === 'h-h');
    const indirectFixed = 200 * ((index % 3) + 1);
    const indirectVariable = qty * 15;
    return {
      date: new Date().toISOString().slice(0, 10),
      group: item.group,
      code: item.code,
      description: item.description,
      unit: item.unit,
      plannedQty: Number(item.qtyBudget) || null,
      executedQty: qty,
      materials,
      labor,
      indirectFixed,
      indirectVariable,
    };
  });
  fs.writeFileSync(DAILY_OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    entries,
  }, null, 2));
  const report = entries.map(entry => ({
    ...entry,
    materialsCost: entry.materials.reduce((acc, component) => acc + (Number(component.quantity) || 0), 0),
    laborCost: entry.labor.reduce((acc, component) => acc + (Number(component.quantity) || 0), 0),
    indirectCost: entry.indirectFixed + entry.indirectVariable,
    totalCost:
      entry.materials.reduce((acc, component) => acc + (Number(component.quantity) || 0), 0) +
      entry.labor.reduce((acc, component) => acc + (Number(component.quantity) || 0), 0) +
      entry.indirectFixed +
      entry.indirectVariable,
  }));
  fs.writeFileSync(REPORT_OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    entries: report,
  }, null, 2));
  console.log('Sample day saved ->', DAILY_OUTPUT);
  console.log('Report ->', REPORT_OUTPUT);
};

simulateDay();
