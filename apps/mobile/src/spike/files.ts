import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import pptxgen from "pptxgenjs";
import * as XLSX from "xlsx";

import type { SpikeResult } from "./types";

async function saveBase64(name: string, base64: string): Promise<string> {
  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error("cache directory unavailable");
  }
  const uri = `${directory}${name}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

export async function generatePptx(): Promise<SpikeResult> {
  const started = Date.now();
  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_16x9";

  for (let index = 1; index <= 12; index += 1) {
    const slide = presentation.addSlide();
    slide.addText(`Slide ${index}`, {
      x: 0.7, y: 0.6, w: 8.6, h: 0.8, fontSize: 28, bold: true,
    });
    slide.addText(
      [
        { text: "Spec-driven deck", options: { bullet: true } },
        { text: "Native preview", options: { bullet: true } },
        { text: "OOXML export", options: { bullet: true } },
      ],
      { x: 0.9, y: 1.6, w: 8.2, h: 3.2, fontSize: 18 },
    );
    slide.addNotes(`Speaker note ${index}`);
  }

  const output = await presentation.write({ outputType: "base64" });
  if (typeof output !== "string") {
    throw new Error("unexpected pptx output");
  }
  const uri = await saveBase64("spike.pptx", output);
  return { label: "PPTX", detail: "12 slides", ms: Date.now() - started, uri };
}

export async function generateXlsx(): Promise<SpikeResult> {
  const started = Date.now();
  const rows: Array<Array<string | number | null>> = [["ID", "Item", "Amount", "Tax"]];
  for (let index = 1; index <= 1000; index += 1) {
    rows.push([index, `Item ${index}`, index * 10, null]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let row = 2; row <= 1001; row += 1) {
    sheet[`D${row}`] = { t: "n", f: `C${row}*0.08` };
  }
  sheet["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
  const output = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  if (typeof output !== "string") {
    throw new Error("unexpected xlsx output");
  }
  const uri = await saveBase64("spike.xlsx", output);
  return { label: "XLSX", detail: "1000 rows + formulas", ms: Date.now() - started, uri };
}

function docxParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, size: 22 })],
  });
}

export async function generateDocx(): Promise<SpikeResult> {
  const started = Date.now();
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "M0 Spike Report", bold: true, size: 44 })],
    }),
    docxParagraph("Generated on device by the docx library."),
  ];

  for (let index = 1; index <= 8; index += 1) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `Section ${index}` })],
    }));
    children.push(docxParagraph(`Body text for section ${index}. If this opens in Word or Pages, the DOCX path is viable.`));
  }

  const document = new Document({
    creator: "ProjectX",
    title: "M0 Spike Report",
    sections: [{ children }],
  });
  const base64 = await Packer.toBase64String(document);
  const uri = await saveBase64("spike.docx", base64);
  return { label: "DOCX", detail: "8 sections", ms: Date.now() - started, uri };
}

function buildReportHtml(): string {
  const pages = Array.from({ length: 10 }, (_, index) => {
    const page = index + 1;
    return `
      <section class="page">
        <h1>Page ${page}</h1>
        <p>This report verifies that the print pipeline handles typography, spacing, tables, and page breaks.</p>
        <ul><li>Ten pages</li><li>A table per page</li><li>Consistent margins</li></ul>
        <table>
          <thead><tr><th>Check</th><th>Target</th><th>Result</th></tr></thead>
          <tbody>
            <tr><td>PPTX</td><td>12 slides</td><td>pass</td></tr>
            <tr><td>XLSX</td><td>1k rows</td><td>pass</td></tr>
            <tr><td>PDF</td><td>10 pages</td><td>pass</td></tr>
          </tbody>
        </table>
      </section>`;
  }).join("");

  return `<!doctype html>
    <html><head><meta charset="utf-8" /><style>
      @page { size: A4; margin: 18mm; }
      body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1f1d1a; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      h1 { font-size: 28px; margin: 0 0 12px; }
      p, li { font-size: 14px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #d8d2c7; padding: 8px; text-align: left; font-size: 13px; }
      th { background: #edeae4; }
    </style></head><body>${pages}</body></html>`;
}

export async function generatePdf(): Promise<SpikeResult> {
  const started = Date.now();
  const result = await Print.printToFileAsync({ html: buildReportHtml() });
  return {
    label: "PDF",
    detail: `${result.numberOfPages} pages`,
    ms: Date.now() - started,
    uri: result.uri,
  };
}
