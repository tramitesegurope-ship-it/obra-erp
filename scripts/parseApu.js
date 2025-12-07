const fs = require('fs');
const path = require('path');
const XLSX = require('../api/node_modules/xlsx');

const APU_FILE = path.join(__dirname, '../api/backups/cotizaciones/A.P.U. Pamparomas.xls');
const OUTPUT_FILE = path.join(__dirname, '../api/backups/cotizaciones/apu_norms.json');

const sheetNames = ['MT', 'BT', 'SF'];

const parseWorksheet = (sheetName, ws) => {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const activities = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const row = rows[cursor];
    if (String(row[1]).startsWith('PARTIDA')) {
      const description = String(row[2]).trim();
      const unitRow = rows[cursor + 1] || [];
      const unit = String(unitRow[2]).trim() || null;
      const componentStart = cursor + 4;
      const components = [];
      cursor = componentStart;
      while (cursor < rows.length) {
        const current = rows[cursor];
        const marker = String(current[1]).toUpperCase();
        if (!current[0] && (marker.includes('TOTAL') || marker.includes('PARTIDA'))) {
          break;
        }
        const description = String(current[1]).trim();
        if (description) {
          components.push({
            description,
            quantity: Number(current[2]) || Number(current[4]) || null,
            unit: String(current[3] || current[5]).trim() || null,
            unitCost: Number(current[5]) || Number(current[6]) || null,
            partial: Number(current[6]) || Number(current[7]) || null,
          });
        }
        cursor += 1;
      }
      activities.push({
        sheet: sheetName,
        description,
        unit,
        components,
        unifiedName: description.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim(),
      });
    } else {
      cursor += 1;
    }
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
