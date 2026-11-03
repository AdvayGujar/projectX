import { readFile } from "node:fs/promises";
import path from "node:path";
import pptxgen from "pptxgenjs";

import {
  assert,
  ensureOut,
  fileSize,
  names,
  outDir,
  readZip,
  repoRoot,
  zipText,
} from "./lib.mjs";

const SLIDE_COUNT = 12;

function addTitleSlide(pres, title) {
  const slide = pres.addSlide();
  slide.background = { color: "F7F5F0" };
  slide.addText(title, {
    x: 0.7,
    y: 2.1,
    w: 8.6,
    h: 1.1,
    fontSize: 40,
    bold: true,
    color: "1F1D1A",
  });
  slide.addText("M0 feasibility spike", {
    x: 0.7,
    y: 3.2,
    w: 8.6,
    h: 0.5,
    fontSize: 18,
    color: "6B6459",
  });
  slide.addNotes("Title slide note. If this renders, notes survive export.");
}

function addBulletSlide(pres, index) {
  const slide = pres.addSlide();
  slide.addText(`Check ${index}`, {
    x: 0.7,
    y: 0.6,
    w: 8.6,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: "1F1D1A",
  });
  slide.addText(
    [
      { text: "Twelve slides generated from a spec-like structure", options: { bullet: true } },
      { text: "Speaker notes on every slide", options: { bullet: true } },
      { text: "Consistent 16:9 layout and theme tokens", options: { bullet: true } },
      { text: "No PowerPoint installation required", options: { bullet: true } },
    ],
    { x: 0.9, y: 1.7, w: 8.2, h: 3.6, fontSize: 18, color: "2E2A25" },
  );
  slide.addNotes(`Bullet slide ${index} note.`);
}

function addTwoColumnSlide(pres) {
  const slide = pres.addSlide();
  slide.addText("Two column", {
    x: 0.7, y: 0.6, w: 8.6, h: 0.8, fontSize: 28, bold: true, color: "1F1D1A",
  });
  slide.addText("Left column\n\nRead documents\nExtract page text\nCite sources", {
    x: 0.9, y: 1.8, w: 4.0, h: 3.4, fontSize: 16, color: "2E2A25",
  });
  slide.addText("Right column\n\nGenerate decks\nValidate specs\nExport OOXML", {
    x: 5.1, y: 1.8, w: 4.0, h: 3.4, fontSize: 16, color: "2E2A25",
  });
  slide.addNotes("Two column note.");
}

function addQuoteSlide(pres) {
  const slide = pres.addSlide();
  slide.addText("“The spec is the source of truth.”", {
    x: 0.9, y: 2.0, w: 8.2, h: 1.2, fontSize: 32, italic: true, color: "1F1D1A",
  });
  slide.addText("ProjectX architecture rule", {
    x: 0.9, y: 3.3, w: 8.2, h: 0.5, fontSize: 16, color: "6B6459",
  });
  slide.addNotes("Quote slide note.");
}

async function addImageSlide(pres) {
  const icon = await readFile(path.join(repoRoot, "apps/mobile/assets/icon.png"));
  const slide = pres.addSlide();
  slide.addText("Embedded image", {
    x: 0.7, y: 0.6, w: 8.6, h: 0.8, fontSize: 28, bold: true, color: "1F1D1A",
  });
  slide.addImage({
    data: `image/png;base64,${icon.toString("base64")}`,
    x: 3.4, y: 1.6, w: 3.2, h: 3.2,
  });
  slide.addNotes("Image slide note.");
}

export async function run() {
  await ensureOut();
  const file = path.join(outDir, "spike.pptx");

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "ProjectX";
  pres.company = "ProjectX";
  pres.title = "M0 Spike Deck";
  pres.subject = "Feasibility";

  addTitleSlide(pres, "M0 Spike Deck");
  for (let index = 1; index <= 7; index += 1) {
    addBulletSlide(pres, index);
  }
  addTwoColumnSlide(pres);
  addQuoteSlide(pres);
  await addImageSlide(pres);
  addBulletSlide(pres, SLIDE_COUNT);

  await pres.writeFile({ fileName: file });

  const zip = await readZip(file);
  const slides = names(zip, /^ppt\/slides\/slide\d+\.xml$/);
  const notes = names(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/);
  const media = names(zip, /^ppt\/media\//);
  const presentation = await zipText(zip, "ppt/presentation.xml");

  assert(slides.length === SLIDE_COUNT, `expected ${SLIDE_COUNT} slides, got ${slides.length}`);
  assert(notes.length >= SLIDE_COUNT, `expected at least ${SLIDE_COUNT} notes, got ${notes.length}`);
  assert(media.length >= 1, "expected at least one embedded media file");
  assert(presentation.includes("<p:sldIdLst>"), "presentation.xml missing slide list");

  return {
    name: "pptxgenjs",
    ok: true,
    file,
    size: await fileSize(file),
    detail: `${slides.length} slides, ${notes.length} notes, ${media.length} media`,
  };
}
