import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import writeXlsxFile from "write-excel-file/node";
import * as XLSX from "xlsx";

import { assert, ensureOut, fileSize, outDir } from "./lib.mjs";

const ROWS = 1000;
const STYLED_ROWS = 100;

function buildBudgetRows() {
  const rows = [["ID", "Item", "Date", "Amount", "Tax", "Total", "Status", "Notes"]];
  for (let index = 1; index <= ROWS; index += 1) {
    rows.push([
      index,
      `Item ${index}`,
      new Date(2026, 0, (index % 28) + 1),
      index * 10,
      null,
      null,
      index % 2 === 0 ? "closed" : "open",
      `Row ${index}`,
    ]);
  }
  return rows;
}

function addFormulas(sheet) {
  for (let row = 2; row <= ROWS + 1; row += 1) {
    sheet[`E${row}`] = { t: "n", f: `D${row}*0.08` };
    sheet[`F${row}`] = { t: "n", f: `D${row}+E${row}` };
  }
}

function verifyBudget(file) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets.Budget;
  assert(sheet, "Budget sheet missing");
  assert(sheet["!ref"] === `A1:H${ROWS + 1}`, `unexpected range ${sheet["!ref"]}`);
  assert(sheet.E2?.f === "D2*0.08", `tax formula missing: ${sheet.E2?.f}`);
  assert(sheet.F1001?.f === "D1001+E1001", `total formula missing: ${sheet.F1001?.f}`);
  assert(sheet.C2?.t === "n" || sheet.C2?.t === "d", `date cell type is ${sheet.C2?.t}`);
  return workbook.SheetNames.join(",");
}

async function writeBudget(file) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(buildBudgetRows());
  addFormulas(sheet);
  sheet["!cols"] = [
    { wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true });
  await writeFile(file, buffer);
}

function buildStyledRows() {
  const rows = [[
    { value: "ID", fontWeight: "bold", backgroundColor: "#EDEAE4" },
    { value: "Item", fontWeight: "bold", backgroundColor: "#EDEAE4" },
    { value: "Date", fontWeight: "bold", backgroundColor: "#EDEAE4" },
    { value: "Amount", fontWeight: "bold", backgroundColor: "#EDEAE4" },
    { value: "Tax", fontWeight: "bold", backgroundColor: "#EDEAE4" },
    { value: "Total", fontWeight: "bold", backgroundColor: "#EDEAE4" },
  ]];
  for (let index = 1; index <= STYLED_ROWS; index += 1) {
    rows.push([
      index,
      `Item ${index}`,
      { value: new Date(2026, 0, (index % 28) + 1), type: Date, format: "yyyy-mm-dd" },
      { value: index * 10, type: Number, format: "#,##0.00" },
      { value: index * 10 * 0.08, type: Number, format: "#,##0.00" },
      { value: index * 10 * 1.08, type: Number, format: "#,##0.00" },
    ]);
  }
  return rows;
}

async function writeStyled(file) {
  await writeXlsxFile(buildStyledRows(), {
    sheet: "Styled",
    columns: [{ width: 6 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 }],
  }).toFile(file);
}

function verifyStyled(file) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets.Styled;
  assert(sheet, "Styled sheet missing");
  assert(sheet["!ref"] === `A1:F${STYLED_ROWS + 1}`, `unexpected range ${sheet["!ref"]}`);
  assert(sheet.E2?.v === 0.8, `styled tax value missing: ${JSON.stringify(sheet.E2)}`);
  assert(sheet.F2?.v === 10.8, `styled total value missing: ${JSON.stringify(sheet.F2)}`);
  return workbook.SheetNames.join(",");
}

export async function run() {
  await ensureOut();
  const budgetFile = path.join(outDir, "spike.xlsx");
  const styledFile = path.join(outDir, "spike-styled.xlsx");

  await writeBudget(budgetFile);
  const budgetSheets = verifyBudget(budgetFile);

  await writeStyled(styledFile);
  const styledSheets = verifyStyled(styledFile);

  return {
    name: "xlsx",
    ok: true,
    file: budgetFile,
    size: (await fileSize(budgetFile)) + (await fileSize(styledFile)),
    detail: `${ROWS} formula rows (${budgetSheets}); styled ${STYLED_ROWS} rows (${styledSheets})`,
  };
}
