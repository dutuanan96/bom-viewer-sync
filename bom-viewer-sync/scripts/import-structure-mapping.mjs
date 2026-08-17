import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const workbookPath = path.resolve('outputs/packaging-mapping-proposal-20260814/full-mapping-master-20260814-v8.xlsx');
const outputPath = path.resolve('knowledge/structure-mapping.json');
const workbook = XLSX.read(await fs.readFile(workbookPath), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets['映射明细'], { header: 1, defval: '' }).slice(1);
const mappings = rows.map((row, index) => ({
  id: `MAP-${row[0]}-${String(index + 1).padStart(3, '0')}`,
  status: 'confirmed',
  productCodes: [String(row[0])],
  source: { name: String(row[2]), spec: String(row[3]), quantity: Number(row[4]) },
  target: { materialCodes: row[7] ? [String(row[7])] : [], name: String(row[8]), spec: String(row[9]), quantity: Number(row[10]) || 0 },
  relationship: String(row[6]).includes('2D') ? 'drawing_confirmed' : String(row[6]).includes('规则') ? 'rule_confirmed' : 'direct',
  explanationZh: String(row[6]),
  evidence: '铁件BOM(1) 与 PDM 已确认映射',
}));
await fs.writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, packVersion: '1.0.0', updatedAt: '2026-08-14', mappings }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ imported: mappings.length, outputPath }, null, 2));
