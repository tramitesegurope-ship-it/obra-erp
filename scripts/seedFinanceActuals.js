const fs = require('fs');
const path = require('path');

const ENRICHED_PATH = path.join(__dirname, '../api/backups/cotizaciones/budget_with_apu_enriched.json');
const OUTPUT_PATH = path.join(__dirname, '../api/backups/cotizaciones/finance_actuals.json');

const computePuBudget = components => {
  if (!Array.isArray(components)) return null;
  return components.reduce((acc, component) => {
    if (typeof component.partial === 'number') {
      return acc + component.partial;
    }
    if (typeof component.quantity === 'number' && typeof component.unitCost === 'number') {
      return acc + component.quantity * component.unitCost;
    }
    return acc;
  }, 0);
};

const dataset = JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf8'));
const today = new Date();
const entries = dataset.items
  .filter(item => Number(item.qtyMetrado ?? item.qtyContractual ?? 0) > 0)
  .slice(0, 150)
  .map((item, index) => {
    const plannedQty = Number(item.qtyMetrado ?? item.qtyContractual ?? 0) || null;
    const basePu = computePuBudget(item.components) || 850;
    const executionFactor = 0.15 + (index % 6) * 0.07;
    const executedQty = plannedQty ? Number((plannedQty * executionFactor).toFixed(2)) : Number((15 + index % 5).toFixed(2));
    const date = new Date(today.getTime() - index * 86400000).toISOString().slice(0, 10);
    const materialShare = 0.42 + (index % 5) * 0.01;
    const laborShare = 0.28;
    const equipmentShare = 0.12;
    const feedingShare = 0.05;
    const lodgingShare = 0.04;
    const logisticsShare = 0.04;
    const baseTotal = executedQty * basePu * (0.9 + (index % 4) * 0.05);
    const materials = Number((baseTotal * materialShare).toFixed(2));
    const labor = Number((baseTotal * laborShare).toFixed(2));
    const equipment = Number((baseTotal * equipmentShare).toFixed(2));
    const feeding = Number((baseTotal * feedingShare).toFixed(2));
    const lodging = Number((baseTotal * lodgingShare).toFixed(2));
    const logistics = Number((baseTotal * logisticsShare).toFixed(2));
    const other = Number((baseTotal - materials - labor - equipment - feeding - lodging - logistics).toFixed(2));

    return {
      date,
      group: item.group,
      code: item.code,
      description: item.description,
      unit: item.unit,
      plannedQty,
      executedQty,
      puBudget: Number(basePu.toFixed(2)),
      costBreakdown: {
        materials,
        labor,
        equipment,
        feeding,
        lodging,
        logistics,
        other,
      },
    };
  });

const payload = {
  generatedAt: new Date().toISOString(),
  entries,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
console.log(`Finance actuals seeded -> ${OUTPUT_PATH} (${entries.length} entries)`);
