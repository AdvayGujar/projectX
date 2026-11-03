import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ensureOut, fileSize, outDir } from "./lib.mjs";

async function buildPdf(pages) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  for (let index = 1; index <= pages; index += 1) {
    const page = document.addPage([595, 842]);
    page.drawText(`ProjectX PDF fixture`, {
      x: 48, y: 790, size: 18, font: bold, color: rgb(0.12, 0.11, 0.1),
    });
    page.drawText(`Page ${index} of ${pages}`, {
      x: 48, y: 766, size: 11, font, color: rgb(0.42, 0.39, 0.35),
    });
    page.drawText(
      "The quick brown fox jumps over the lazy dog. This paragraph exists to give the extractor enough text per page to behave like a real document.",
      { x: 48, y: 720, size: 11, font, maxWidth: 500, lineHeight: 16, color: rgb(0.18, 0.16, 0.15) },
    );
    page.drawRectangle({
      x: 48, y: 560, width: 500, height: 120, borderColor: rgb(0.8, 0.77, 0.72), borderWidth: 1,
    });
    page.drawText("Check", { x: 60, y: 650, size: 11, font: bold });
    page.drawText("Result", { x: 260, y: 650, size: 11, font: bold });
    page.drawText("PDF extraction", { x: 60, y: 620, size: 11, font });
    page.drawText("pending", { x: 260, y: 620, size: 11, font });
    page.drawText("Page count", { x: 60, y: 594, size: 11, font });
    page.drawText(String(pages), { x: 260, y: 594, size: 11, font });
  }

  return document.save();
}

export async function run() {
  await ensureOut();
  const large = path.join(outDir, "large.pdf");
  const small = path.join(outDir, "small.pdf");
  await writeFile(large, await buildPdf(300));
  await writeFile(small, await buildPdf(5));
  return {
    large: { file: large, size: await fileSize(large) },
    small: { file: small, size: await fileSize(small) },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((result) => {
    console.log(`large.pdf  ${(result.large.size / 1024).toFixed(1)} KB`);
    console.log(`small.pdf  ${(result.small.size / 1024).toFixed(1)} KB`);
  });
}
