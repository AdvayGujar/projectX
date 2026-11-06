import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseDocx } from "../office/docx";
import { parsePptx } from "../office/pptx";
import { parseText } from "../office/text";
import { parseCsv, parseXlsxBytes } from "../office/xlsx";

const DOCX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Risks</w:t></w:r></w:p>
    <w:p><w:r><w:t>Supply delay is</w:t></w:r><w:r><w:t xml:space="preserve"> the main risk.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Owner</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Advay</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    archive.file(name, content);
  }
  return archive.generateAsync({ type: "uint8array" });
}

describe("DOCX parsing", () => {
  it("turns headings into sections and keeps table rows", async () => {
    const parsed = await parseDocx(await zip({ "word/document.xml": DOCX_XML }));

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.section).toBe("Risks");
    expect(parsed.sections[0]?.text).toContain("Supply delay is the main risk.");
    expect(parsed.sections[0]?.text).toContain("Owner | Advay");
    expect(parsed.sections[0]?.page).toBeNull();
  });

  it("fails cleanly when the main part is missing", async () => {
    await expect(parseDocx(await zip({ "word/styles.xml": "<w:styles/>" }))).rejects.toThrow(
      "missing its main text",
    );
  });
});

const PRESENTATION = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
  </p:sldIdLst>
</p:presentation>`;

const PRESENTATION_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="slide" Target="slides/slide2.xml"/>
</Relationships>`;

const SLIDE_ONE = `<p:sld xmlns:p="p"><a:p><a:r><a:t>Title One</a:t></a:r></a:p>
  <a:p><a:r><a:t>Bullet A</a:t></a:r></a:p></p:sld>`;
const SLIDE_TWO = `<p:sld xmlns:p="p"><a:p><a:r><a:t>Title Two</a:t></a:r></a:p></p:sld>`;
const NOTES_ONE = `<p:notes><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:notes>`;

describe("PPTX parsing", () => {
  it("follows presentation order and includes speaker notes", async () => {
    const parsed = await parsePptx(await zip({
      "ppt/presentation.xml": PRESENTATION,
      "ppt/_rels/presentation.xml.rels": PRESENTATION_RELS,
      "ppt/slides/slide1.xml": SLIDE_ONE,
      "ppt/slides/slide2.xml": SLIDE_TWO,
      "ppt/slides/_rels/slide1.xml.rels": `<?xml version="1.0"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId2" Type="notesSlide" Target="../notesSlides/notesSlide1.xml"/>
        </Relationships>`,
      "ppt/notesSlides/notesSlide1.xml": NOTES_ONE,
    }));

    expect(parsed.slideCount).toBe(2);
    expect(parsed.sections.map((section) => section.page)).toEqual([1, 2]);
    expect(parsed.sections[0]?.section).toBe("Title One");
    expect(parsed.sections[0]?.text).toContain("Bullet A");
    expect(parsed.sections[0]?.text).toContain("Speaker note");
    expect(parsed.sections[1]?.text).toContain("Title Two");
  });
});

describe("XLSX and CSV parsing", () => {
  it("keeps values, formula text, and sheet range citations", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Item", "Amount", "Tax"],
      ["A", 100, 8],
      ["B", 200, 16],
    ]);
    sheet.C2 = { t: "n", f: "B2*0.08", v: 8, w: "8" };
    XLSX.utils.book_append_sheet(workbook, sheet, "Budget");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const parsed = parseXlsxBytes(bytes);

    expect(parsed.sheetCount).toBe(1);
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0]?.section).toBe("Budget!A1:C3");
    expect(parsed.chunks[0]?.text).toContain("8 (=B2*0.08)");
  });

  it("reads CSV text", () => {
    const parsed = parseCsv("Item,Amount\nA,10\nB,20");

    expect(parsed.sheetCount).toBe(1);
    expect(parsed.chunks[0]?.text).toContain("Item\tAmount");
    expect(parsed.chunks[0]?.text).toContain("A\t10");
  });
});

describe("text parsing", () => {
  it("starts a section at each Markdown heading", () => {
    const parsed = parseText("# Plan\nIntro\n\n## Risks\nDelay\n");

    expect(parsed.sections.map((section) => section.section)).toEqual(["Plan", "Risks"]);
    expect(parsed.sections[0]?.text).toContain("Intro");
    expect(parsed.sections[1]?.text).toContain("Delay");
  });
});
