import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, grayscale } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  ShadingType
} from "docx";
import PptxGenJS from "pptxgenjs";
import {
  Workspace,
  LearningModule,
  WorkspaceFile,
  MindMapGraph,
  CourseStudyMaterials
} from "./types.js";

const FILES_BASE_DIR = path.join(process.cwd(), "storage", "workspace_files");

export function ensureWorkspaceFilesDir(workspaceId: string): string {
  const dir = path.join(FILES_BASE_DIR, workspaceId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWorkspaceFilePath(workspaceId: string, fileName: string): string {
  return path.join(ensureWorkspaceFilesDir(workspaceId), fileName);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REAL ISO-32000 BINARY PDF GENERATION (via pdf-lib)
// ─────────────────────────────────────────────────────────────────────────────

export function sanitizePdfText(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u2022]/g, "*")
    .replace(/[\u2192]/g, "->")
    .replace(/[\u2190]/g, "<-")
    .replace(/[\u2194]/g, "<->")
    .replace(/[\u21D2]/g, "=>")
    .replace(/[\u2264]/g, "<=")
    .replace(/[\u2265]/g, ">=")
    .replace(/[\u2260]/g, "!=")
    .replace(/[\u2248]/g, "~=")
    .replace(/[\u00D7]/g, "x")
    .replace(/[\u00F7]/g, "/")
    .replace(/[\u00B1]/g, "+/-")
    .replace(/[^\x20-\x7E\r\n\t]/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

export interface PdfSection {
  heading: string;
  subheading?: string;
  paragraphs: string[];
  callout?: string;
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
  diagram?: string;
  examples?: { title: string; scenario: string; solution: string }[];
  formulas?: string[];
}

export interface PdfDocOptions {
  title: string;
  subtitle?: string;
  subject: string;
  learningGoal?: string;
  overview?: string;
  documentType: string;
  scope: "course" | "module";
  sections: PdfSection[];
  tableOfContents?: string[];
  finalTakeaway?: string;
  sourceReferences?: string[];
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return [""];
  const words = clean.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxChars) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [""];
}

export async function generateBinaryPdf(opts: PdfDocOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 54;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // Helper to add a fresh page
  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawHeaderFooter = () => {
    // Top subtle running header
    currentPage.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 36 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 36 },
      thickness: 0.5,
      color: grayscale(0.85)
    });
    currentPage.drawText(
      sanitizePdfText(`GOOGLE ACADEMY COMPANION  •  ${opts.subject.toUpperCase()}  •  ${opts.documentType.toUpperCase()}`),
      {
        x: MARGIN,
        y: PAGE_HEIGHT - 30,
        size: 7.5,
        font: fontBold,
        color: grayscale(0.45)
      }
    );

    // Bottom running footer
    currentPage.drawLine({
      start: { x: MARGIN, y: 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: 38 },
      thickness: 0.5,
      color: grayscale(0.85)
    });
    currentPage.drawText(
      sanitizePdfText("Source Grounded Curriculum • Comprehensive Study Material"),
      {
        x: MARGIN,
        y: 26,
        size: 7.5,
        font: fontRegular,
        color: grayscale(0.5)
      }
    );
  };

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < MARGIN + 40) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeaderFooter();
    }
  };

  // ── COVER / TITLE PAGE ──
  // Header accent bar
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - 10,
    width: CONTENT_WIDTH,
    height: 6,
    color: rgb(0.12, 0.12, 0.14)
  });
  y -= 36;

  // Scope Badge
  const scopeTag = opts.scope === "course" ? "COMPLETE COURSE STUDY MATERIAL" : "LEARNING MODULE DOCUMENT";
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - 16,
    width: 220,
    height: 18,
    color: rgb(0.94, 0.94, 0.96)
  });
  currentPage.drawText(sanitizePdfText(scopeTag), {
    x: MARGIN + 8,
    y: y - 12,
    size: 8,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.18)
  });
  y -= 38;

  // Document Title
  const titleLines = wrapText(opts.title, 40);
  for (const line of titleLines) {
    currentPage.drawText(sanitizePdfText(line), {
      x: MARGIN,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.1)
    });
    y -= 26;
  }
  y -= 4;

  // Subtitle / Subject
  if (opts.subtitle) {
    const subLines = wrapText(opts.subtitle, 58);
    for (const line of subLines) {
      currentPage.drawText(sanitizePdfText(line), {
        x: MARGIN,
        y,
        size: 10.5,
        font: fontOblique,
        color: rgb(0.35, 0.35, 0.38)
      });
      y -= 15;
    }
  }

  // Overview if provided
  if (opts.overview) {
    y -= 6;
    const ovLines = wrapText(opts.overview, 68);
    for (const oline of ovLines) {
      currentPage.drawText(sanitizePdfText(oline), {
        x: MARGIN,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.35)
      });
      y -= 13;
    }
  }

  // Metadata Card
  y -= 12;
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - 60,
    width: CONTENT_WIDTH,
    height: 60,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.88, 0.88, 0.92),
    borderWidth: 1
  });

  currentPage.drawText(sanitizePdfText(`Subject Domain: ${opts.subject}`), {
    x: MARGIN + 14,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.18)
  });
  const goalPreview = (opts.learningGoal || "Comprehensive mastery and systematic understanding").slice(0, 75);
  currentPage.drawText(sanitizePdfText(`Target Goal: ${goalPreview}`), {
    x: MARGIN + 14,
    y: y - 34,
    size: 8,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.35)
  });
  currentPage.drawText(
    sanitizePdfText(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} • Publisher: Google Academy Companion`),
    {
      x: MARGIN + 14,
      y: y - 48,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.5)
    }
  );
  y -= 76;

  // Table of Contents on Cover if provided
  if (opts.tableOfContents && opts.tableOfContents.length) {
    currentPage.drawText("TABLE OF CONTENTS", {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.18)
    });
    y -= 16;

    opts.tableOfContents.slice(0, 12).forEach((item, idx) => {
      currentPage.drawText(`${idx + 1}.`, {
        x: MARGIN + 4,
        y,
        size: 8.5,
        font: fontBold,
        color: rgb(0.35, 0.35, 0.4)
      });
      currentPage.drawText(sanitizePdfText(item.slice(0, 68)), {
        x: MARGIN + 26,
        y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.25)
      });
      y -= 15;
    });
    y -= 12;
  }

  // Break to next page for actual document body
  currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawHeaderFooter();

  // ── DOCUMENT SECTIONS (Each chapter starts on a sensible page break) ──
  for (let sIdx = 0; sIdx < opts.sections.length; sIdx++) {
    const sec = opts.sections[sIdx];

    // Sensible page break for each section after the first
    if (sIdx > 0) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeaderFooter();
    } else {
      ensureSpace(80);
    }

    // Section Header (Chapter H1)
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: 4,
      height: 18,
      color: rgb(0.1, 0.1, 0.15)
    });
    currentPage.drawText(sanitizePdfText(sec.heading), {
      x: MARGIN + 12,
      y,
      size: 13,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.12)
    });
    y -= 22;

    if (sec.subheading) {
      currentPage.drawText(sanitizePdfText(sec.subheading), {
        x: MARGIN + 12,
        y,
        size: 9.5,
        font: fontOblique,
        color: rgb(0.4, 0.4, 0.45)
      });
      y -= 18;
    }

    // Callout Box if explicitly present on section
    if (sec.callout) {
      ensureSpace(55);
      const calloutLines = wrapText(sec.callout, 68);
      const boxHeight = (calloutLines.length * 13) + 18;

      currentPage.drawRectangle({
        x: MARGIN,
        y: y - boxHeight,
        width: CONTENT_WIDTH,
        height: boxHeight,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.8, 0.85, 0.95),
        borderWidth: 1
      });
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - boxHeight,
        width: 3.5,
        height: boxHeight,
        color: rgb(0.2, 0.35, 0.7)
      });

      let cy = y - 13;
      for (const cline of calloutLines) {
        currentPage.drawText(sanitizePdfText(cline), {
          x: MARGIN + 12,
          y: cy,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.15, 0.2, 0.35)
        });
        cy -= 13;
      }
      y -= boxHeight + 14;
    }

    // Process paragraphs and markdown content
    for (const rawParagraph of sec.paragraphs) {
      if (!rawParagraph) continue;
      const lines = rawParagraph.split("\n");
      let inCodeBlock = false;
      let codeLines: string[] = [];

      for (let li = 0; li < lines.length; li++) {
        const rawLine = lines[li];
        const trimmed = rawLine.trim();

        // Code block toggle
        if (trimmed.startsWith("```")) {
          if (inCodeBlock) {
            const blockHeight = (codeLines.length * 11) + 16;
            ensureSpace(blockHeight + 10);
            currentPage.drawRectangle({
              x: MARGIN,
              y: y - blockHeight,
              width: CONTENT_WIDTH,
              height: blockHeight,
              color: rgb(0.12, 0.12, 0.15),
              borderColor: rgb(0.25, 0.25, 0.3),
              borderWidth: 0.5
            });
            let cdy = y - 13;
            for (const cl of codeLines) {
              currentPage.drawText(sanitizePdfText(cl.slice(0, 72)), {
                x: MARGIN + 10,
                y: cdy,
                size: 8,
                font: fontMono,
                color: rgb(0.85, 0.88, 0.92)
              });
              cdy -= 11;
            }
            y -= blockHeight + 10;
            codeLines = [];
            inCodeBlock = false;
          } else {
            inCodeBlock = true;
            codeLines = [];
          }
          continue;
        }

        if (inCodeBlock) {
          codeLines.push(rawLine);
          continue;
        }

        if (!trimmed) {
          y -= 5;
          continue;
        }

        // Markdown Sub-subheading (###)
        if (trimmed.startsWith("### ")) {
          const hText = trimmed.replace(/^###\s+/, "");
          const hLines = wrapText(hText, 55);
          ensureSpace(hLines.length * 14 + 14);
          y -= 8;
          for (const hl of hLines) {
            currentPage.drawText(sanitizePdfText(hl), {
              x: MARGIN,
              y,
              size: 10,
              font: fontBold,
              color: rgb(0.15, 0.15, 0.2)
            });
            y -= 13;
          }
          y -= 4;
          continue;
        }

        // Markdown Subheading (##)
        if (trimmed.startsWith("## ")) {
          const hText = trimmed.replace(/^##\s+/, "");
          const hLines = wrapText(hText, 50);
          ensureSpace(hLines.length * 16 + 18);
          y -= 10;
          for (const hl of hLines) {
            currentPage.drawText(sanitizePdfText(hl), {
              x: MARGIN,
              y,
              size: 11.5,
              font: fontBold,
              color: rgb(0.1, 0.1, 0.15)
            });
            y -= 15;
          }
          y -= 4;
          continue;
        }

        // Markdown Heading (#)
        if (trimmed.startsWith("# ")) {
          const hText = trimmed.replace(/^#\s+/, "");
          const hLines = wrapText(hText, 45);
          ensureSpace(hLines.length * 18 + 20);
          y -= 12;
          for (const hl of hLines) {
            currentPage.drawText(sanitizePdfText(hl), {
              x: MARGIN,
              y,
              size: 13,
              font: fontBold,
              color: rgb(0.08, 0.08, 0.12)
            });
            y -= 17;
          }
          y -= 6;
          continue;
        }

        // Markdown Blockquote / Callout (> )
        if (trimmed.startsWith("> ")) {
          const bText = trimmed.replace(/^>\s+/, "");
          const bLines = wrapText(bText, 66);
          const bHeight = (bLines.length * 12) + 14;
          ensureSpace(bHeight + 8);
          currentPage.drawRectangle({
            x: MARGIN,
            y: y - bHeight,
            width: CONTENT_WIDTH,
            height: bHeight,
            color: rgb(0.96, 0.97, 0.99),
            borderColor: rgb(0.85, 0.88, 0.95),
            borderWidth: 0.5
          });
          currentPage.drawRectangle({
            x: MARGIN,
            y: y - bHeight,
            width: 3,
            height: bHeight,
            color: rgb(0.2, 0.35, 0.7)
          });
          let by = y - 11;
          for (const bl of bLines) {
            currentPage.drawText(sanitizePdfText(bl), {
              x: MARGIN + 10,
              y: by,
              size: 8.5,
              font: fontOblique,
              color: rgb(0.15, 0.2, 0.35)
            });
            by -= 12;
          }
          y -= bHeight + 8;
          continue;
        }

        // Bullet list item
        if (/^[\*\-\•]\s+/.test(trimmed)) {
          const itemText = trimmed.replace(/^[\*\-\•]\s+/, "");
          const bLines = wrapText(itemText, 68);
          ensureSpace(bLines.length * 13 + 4);
          currentPage.drawText("*", {
            x: MARGIN + 6,
            y,
            size: 9,
            font: fontBold,
            color: rgb(0.2, 0.2, 0.25)
          });
          currentPage.drawText(sanitizePdfText(bLines[0]), {
            x: MARGIN + 16,
            y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.25)
          });
          y -= 13;
          for (let bi = 1; bi < bLines.length; bi++) {
            ensureSpace(13);
            currentPage.drawText(sanitizePdfText(bLines[bi]), {
              x: MARGIN + 16,
              y,
              size: 8.5,
              font: fontRegular,
              color: rgb(0.2, 0.2, 0.25)
            });
            y -= 13;
          }
          continue;
        }

        // Numbered list item
        const numMatch = trimmed.match(/^(\d+[\.\)])\s+(.*)/);
        if (numMatch) {
          const numPrefix = numMatch[1];
          const itemText = numMatch[2];
          const bLines = wrapText(itemText, 66);
          ensureSpace(bLines.length * 13 + 4);
          currentPage.drawText(sanitizePdfText(numPrefix), {
            x: MARGIN + 4,
            y,
            size: 8.5,
            font: fontBold,
            color: rgb(0.2, 0.2, 0.25)
          });
          currentPage.drawText(sanitizePdfText(bLines[0]), {
            x: MARGIN + 20,
            y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.25)
          });
          y -= 13;
          for (let bi = 1; bi < bLines.length; bi++) {
            ensureSpace(13);
            currentPage.drawText(sanitizePdfText(bLines[bi]), {
              x: MARGIN + 20,
              y,
              size: 8.5,
              font: fontRegular,
              color: rgb(0.2, 0.2, 0.25)
            });
            y -= 13;
          }
          continue;
        }

        // Markdown Table Row (| col1 | col2 |)
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          if (/^\|[\s\-:]+\|/.test(trimmed)) {
            continue;
          }
          const cells = trimmed.slice(1, -1).split("|").map(c => c.trim());
          if (cells.length >= 2) {
            const colWidth = CONTENT_WIDTH / cells.length;
            ensureSpace(18);
            currentPage.drawRectangle({
              x: MARGIN,
              y: y - 14,
              width: CONTENT_WIDTH,
              height: 16,
              color: rgb(0.96, 0.96, 0.98),
              borderColor: rgb(0.88, 0.88, 0.92),
              borderWidth: 0.5
            });
            cells.forEach((cell, ci) => {
              currentPage.drawText(sanitizePdfText(cell.slice(0, 24)), {
                x: MARGIN + (ci * colWidth) + 6,
                y: y - 11,
                size: 7.5,
                font: fontRegular,
                color: rgb(0.18, 0.18, 0.22)
              });
            });
            y -= 18;
            continue;
          }
        }

        // Standard Paragraph line
        const pLines = wrapText(trimmed, 74);
        for (const pl of pLines) {
          ensureSpace(14);
          currentPage.drawText(sanitizePdfText(pl), {
            x: MARGIN,
            y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.18, 0.18, 0.22)
          });
          y -= 13;
        }
        y -= 3;
      }
    }

    // Additional Section Bullets
    if (sec.bullets && sec.bullets.length) {
      ensureSpace(20);
      currentPage.drawText("Key Principles & Takeaways:", {
        x: MARGIN,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.2)
      });
      y -= 14;

      for (const b of sec.bullets) {
        const bLines = wrapText(b, 68);
        ensureSpace(bLines.length * 13 + 4);
        currentPage.drawText("*", {
          x: MARGIN + 6,
          y,
          size: 9,
          font: fontBold,
          color: rgb(0.2, 0.2, 0.25)
        });
        currentPage.drawText(sanitizePdfText(bLines[0]), {
          x: MARGIN + 18,
          y,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.25)
        });
        y -= 13;
        for (let bi = 1; bi < bLines.length; bi++) {
          ensureSpace(13);
          currentPage.drawText(sanitizePdfText(bLines[bi]), {
            x: MARGIN + 18,
            y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.25)
          });
          y -= 13;
        }
      }
      y -= 6;
    }

    // Worked Examples
    if (sec.examples && sec.examples.length) {
      for (const ex of sec.examples) {
        ensureSpace(60);
        currentPage.drawText(sanitizePdfText(`Worked Example: ${ex.title}`), {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: rgb(0.1, 0.2, 0.4)
        });
        y -= 14;

        const scenLines = wrapText(`Scenario: ${ex.scenario}`, 70);
        for (const sl of scenLines) {
          ensureSpace(13);
          currentPage.drawText(sanitizePdfText(sl), {
            x: MARGIN + 10,
            y,
            size: 8,
            font: fontOblique,
            color: rgb(0.25, 0.25, 0.3)
          });
          y -= 12;
        }

        const solLines = wrapText(`Solution Walkthrough: ${ex.solution}`, 70);
        for (const sol of solLines) {
          ensureSpace(13);
          currentPage.drawText(sanitizePdfText(sol), {
            x: MARGIN + 10,
            y,
            size: 8,
            font: fontRegular,
            color: rgb(0.15, 0.2, 0.25)
          });
          y -= 12;
        }
        y -= 6;
      }
    }

    // Diagram / Visual Architecture
    if (sec.diagram) {
      const diagLines = sec.diagram.split("\n").slice(0, 14);
      const diagHeight = (diagLines.length * 11) + 24;
      ensureSpace(diagHeight + 16);

      currentPage.drawRectangle({
        x: MARGIN,
        y: y - diagHeight,
        width: CONTENT_WIDTH,
        height: diagHeight,
        color: rgb(0.1, 0.1, 0.12),
        borderColor: rgb(0.25, 0.25, 0.3),
        borderWidth: 1
      });

      currentPage.drawText("VISUAL ARCHITECTURE & FORMULATION", {
        x: MARGIN + 12,
        y: y - 14,
        size: 7,
        font: fontBold,
        color: rgb(0.7, 0.7, 0.75)
      });

      let dy = y - 26;
      for (const dline of diagLines) {
        currentPage.drawText(sanitizePdfText(dline.slice(0, 75)), {
          x: MARGIN + 12,
          y: dy,
          size: 7.5,
          font: fontMono,
          color: rgb(0.85, 0.88, 0.92)
        });
        dy -= 11;
      }
      y -= diagHeight + 14;
    }

    // Structured Table if present
    if (sec.table && sec.table.headers.length) {
      const colCount = sec.table.headers.length;
      const colWidth = CONTENT_WIDTH / colCount;
      const rowHeight = 18;
      const tableHeight = ((sec.table.rows.length + 1) * rowHeight) + 6;
      ensureSpace(tableHeight + 10);

      // Header row
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.15, 0.15, 0.2)
      });

      sec.table.headers.forEach((h, cIdx) => {
        currentPage.drawText(sanitizePdfText(h.slice(0, 22)), {
          x: MARGIN + (cIdx * colWidth) + 6,
          y: y - 13,
          size: 8,
          font: fontBold,
          color: rgb(0.95, 0.95, 0.98)
        });
      });
      y -= rowHeight;

      // Table rows
      sec.table.rows.forEach((row, rIdx) => {
        const bg = rIdx % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(0.94, 0.94, 0.96);
        currentPage.drawRectangle({
          x: MARGIN,
          y: y - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: bg,
          borderColor: rgb(0.88, 0.88, 0.92),
          borderWidth: 0.5
        });

        row.forEach((cell, cIdx) => {
          currentPage.drawText(sanitizePdfText(cell.slice(0, 25)), {
            x: MARGIN + (cIdx * colWidth) + 6,
            y: y - 13,
            size: 7.5,
            font: fontRegular,
            color: rgb(0.2, 0.2, 0.25)
          });
        });
        y -= rowHeight;
      });
      y -= 12;
    }

    y -= 10;
  }

  // Final Takeaway banner
  if (opts.finalTakeaway) {
    ensureSpace(55);
    currentPage.drawRectangle({
      x: MARGIN,
      y: y - 44,
      width: CONTENT_WIDTH,
      height: 44,
      color: rgb(0.1, 0.1, 0.14)
    });
    currentPage.drawText("EXECUTIVE SYNTHESIS & CONCLUSION", {
      x: MARGIN + 12,
      y: y - 14,
      size: 7.5,
      font: fontBold,
      color: rgb(0.7, 0.75, 0.85)
    });
    const ftLines = wrapText(opts.finalTakeaway, 70);
    let fty = y - 28;
    for (const ftl of ftLines.slice(0, 2)) {
      currentPage.drawText(sanitizePdfText(ftl), {
        x: MARGIN + 12,
        y: fty,
        size: 8,
        font: fontRegular,
        color: rgb(0.95, 0.95, 0.98)
      });
      fty -= 11;
    }
    y -= 54;
  }

  // Source references block
  if (opts.sourceReferences && opts.sourceReferences.length) {
    ensureSpace(40);
    currentPage.drawText("GROUNDING & AUTHORITATIVE SOURCES", {
      x: MARGIN,
      y,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.4)
    });
    y -= 14;
    const srcLines = wrapText(opts.sourceReferences.join(" • "), 72);
    for (const srcl of srcLines) {
      ensureSpace(12);
      currentPage.drawText(sanitizePdfText(srcl), {
        x: MARGIN,
        y,
        size: 7.5,
        font: fontOblique,
        color: rgb(0.4, 0.4, 0.45)
      });
      y -= 12;
    }
    y -= 14;
  }

  // Page Numbers on all pages
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);
    page.drawText(sanitizePdfText(`Page ${i + 1} of ${totalPages}`), {
      x: PAGE_WIDTH - MARGIN - 65,
      y: 26,
      size: 7.5,
      font: fontRegular,
      color: grayscale(0.5)
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// Dedicated helper to generate Detailed Notes PDF for any workspace
export async function generateDetailedNotesPdf(workspace: Workspace): Promise<Buffer> {
  const cm = workspace.courseMaterials;
  const dn = cm?.detailedNotes;
  const mods = workspace.learningModules || [];

  let sections: PdfSection[] = [];
  let tableOfContents: string[] = [];
  let finalTakeaway: string = "";
  let sourceReferences: string[] = [];
  let overview: string = "";

  if (dn && dn.sections && dn.sections.length > 0) {
    overview = dn.overview || `Comprehensive academic study notes for ${workspace.title}.`;
    tableOfContents = dn.tableOfContents || [];
    finalTakeaway = dn.synthesisAndConclusion || "";
    sourceReferences = dn.sourceReferences || workspace.resources.map(r => r.title);

    sections = dn.sections.map(s => ({
      heading: s.heading,
      subheading: s.subheading,
      paragraphs: [s.content],
      callout: typeof s.callout === "string" ? s.callout : (s.callout as any)?.text,
      bullets: s.keyPrinciples,
      diagram: s.visualExplanation?.content,
      examples: s.examples,
      table: (s as any).table
    }));
  } else {
    overview = `A complete, textbook-grade analytical study guide covering the entire curriculum for ${workspace.title}. Grounded in verified source resources, this guide provides foundational definitions, governing laws, worked mathematical proofs, diagrams, and cross-stage synthesis.`;
    tableOfContents = [
      "Course Overview & Curriculum Trajectory",
      ...mods.map(m => `Stage ${m.moduleNumber}: ${m.title}`),
      "Cross-Module Synthesis & Unified Invariants"
    ];
    finalTakeaway = `True mastery in ${workspace.subject} requires fluent mental models that withstand rigorous edge-case testing.`;
    sourceReferences = workspace.resources.map(r => r.title);

    sections = [
      {
        heading: `Course Curriculum Overview: System Architecture in ${workspace.subject}`,
        subheading: `Systematic Analytical Framework for "${workspace.learningGoal || workspace.subject}"`,
        paragraphs: [
          `This course textbook provides an exhaustive, authoritative, source-grounded curriculum designed to guide the learner from foundational axioms to advanced synthesis in ${workspace.subject}.\n\nThe complete curriculum is structured across ${mods.length} progressive learning stages.`
        ],
        bullets: [
          "First Principles Invariance: Isolate elementary physical or mathematical laws before applying formulas.",
          "Causal Directionality: Distinguish underlying mechanistic drivers from surface statistical correlations.",
          "Boundary Envelope Verification: Every operational model fails when pushed past its assumptions."
        ],
        callout: `Target Achievement: ${workspace.learningIntent?.targetAchievement || workspace.learningGoal || workspace.subject}`
      },
      ...mods.map(m => ({
        heading: `Stage ${m.moduleNumber}: ${m.title}`,
        subheading: m.purpose,
        paragraphs: [m.comprehensiveNotes || `# ${m.title}\n\nComprehensive notes for this stage.`],
        bullets: m.quickNotes?.keyPrinciples || [],
        callout: m.quickNotes?.essentialFormulasOrRules?.[0] || m.quickNotes?.finalTakeaway,
        diagram: m.topics?.[0]?.visualExplanation?.content,
        examples: m.topics?.[0]?.workedExamples?.map(we => ({
          title: we.title,
          scenario: we.problem,
          solution: we.stepByStepSolution.join("; ")
        }))
      })),
      {
        heading: `Cross-Module Synthesis & Unified Boundary Invariants`,
        subheading: `Holistic Integration of Stages 1 through ${mods.length}`,
        paragraphs: [
          `System mastery requires connecting individual module stages into a unified mental model. The concepts derived in the foundational stages govern the operational parameters of intermediate problem-solving and advanced synthesis.`
        ],
        bullets: [
          "Unify individual stage mechanisms into a coherent causal workflow.",
          "Perform order-of-magnitude and asymptotic checks before finalizing any analytical conclusion.",
          "Maintain active retrieval practice across the entire curriculum to ensure permanent retention."
        ],
        callout: "Overarching Principle: System-level robustness is achieved when every sub-component satisfies its governing boundary constraints."
      }
    ];
  }

  const pdfBuffer = await generateBinaryPdf({
    title: dn?.title || `${workspace.title}: Comprehensive Course Notes`,
    subtitle: `Complete Course Textbook & Systematic Analytical Guide`,
    subject: workspace.subject,
    learningGoal: workspace.learningGoal,
    overview,
    documentType: "Detailed Notes",
    scope: "course",
    sections,
    tableOfContents,
    finalTakeaway,
    sourceReferences
  });

  // Also cache to disk for immediate access
  try {
    const dir = ensureWorkspaceFilesDir(workspace.id);
    const pdfPath = path.join(dir, "Detailed Notes.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);
  } catch (e) {}

  return pdfBuffer;
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. REAL MICROSOFT WORD DOCX GENERATION (via docx)
// ─────────────────────────────────────────────────────────────────────────────

interface DocxOptions {
  title: string;
  subtitle?: string;
  subject: string;
  learningGoal?: string;
  documentType: string;
  sections: PdfSection[];
  tableOfContents?: string[];
  finalTakeaway?: string;
}

export async function generateBinaryDocx(opts: DocxOptions): Promise<Buffer> {
  const children: any[] = [];

  // Title page elements
  children.push(
    new Paragraph({
      text: "GOOGLE ACADEMY COMPANION",
      spacing: { after: 120 },
      style: "Subtitle"
    }),
    new Paragraph({
      text: opts.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 }
    })
  );

  if (opts.subtitle) {
    children.push(
      new Paragraph({
        text: opts.subtitle,
        style: "Subtitle",
        spacing: { after: 200 }
      })
    );
  }

  // Metadata Table
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Subject Domain: ", bold: true }),
                    new TextRun(opts.subject)
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Target Goal: ", bold: true }),
                    new TextRun(opts.learningGoal || "Comprehensive mastery")
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Generated: ", bold: true }),
                    new TextRun(new Date().toLocaleDateString())
                  ]
                })
              ],
              shading: { type: ShadingType.CLEAR, fill: "F4F4F5" }
            })
          ]
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // Table of Contents
  if (opts.tableOfContents && opts.tableOfContents.length) {
    children.push(
      new Paragraph({
        text: "Table of Contents",
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 150 }
      })
    );
    for (const item of opts.tableOfContents) {
      children.push(
        new Paragraph({
          text: `• ${item}`,
          spacing: { after: 80 }
        })
      );
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Sections
  for (const sec of opts.sections) {
    children.push(
      new Paragraph({
        text: sec.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      })
    );

    if (sec.subheading) {
      children.push(
        new Paragraph({
          text: sec.subheading,
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 100 }
        })
      );
    }

    if (sec.callout) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: "KEY PRINCIPLE: ", bold: true, color: "1E3A8A" }),
                        new TextRun(sec.callout)
                      ]
                    })
                  ],
                  shading: { type: ShadingType.CLEAR, fill: "EFF6FF" }
                })
              ]
            })
          ]
        }),
        new Paragraph({ spacing: { after: 100 } })
      );
    }

    for (const p of sec.paragraphs) {
      children.push(
        new Paragraph({
          text: p,
          spacing: { after: 120 }
        })
      );
    }

    if (sec.bullets) {
      for (const b of sec.bullets) {
        children.push(
          new Paragraph({
            text: b,
            bullet: { level: 0 },
            spacing: { after: 60 }
          })
        );
      }
    }

    if (sec.diagram) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: sec.diagram,
              font: "Courier New",
              size: 18
            })
          ],
          shading: { type: ShadingType.CLEAR, fill: "F4F4F5" },
          spacing: { before: 100, after: 140 }
        })
      );
    }

    if (sec.table && sec.table.headers.length) {
      const rows = [
        new TableRow({
          children: sec.table.headers.map(h => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })] })],
            shading: { type: ShadingType.CLEAR, fill: "18181B" }
          }))
        }),
        ...sec.table.rows.map(row => new TableRow({
          children: row.map(cell => new TableCell({
            children: [new Paragraph({ text: cell })],
            shading: { type: ShadingType.CLEAR, fill: "FAFAFA" }
          }))
        }))
      ];
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows
        }),
        new Paragraph({ spacing: { after: 120 } })
      );
    }
  }

  if (opts.finalTakeaway) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "FINAL SYNTHESIS: ", bold: true }),
          new TextRun(opts.finalTakeaway)
        ],
        spacing: { before: 200, after: 100 }
      })
    );
  }

  const doc = new Document({
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REAL MICROSOFT POWERPOINT PPTX GENERATION (via pptxgenjs)
// ─────────────────────────────────────────────────────────────────────────────

interface SlideData {
  slideNumber: number;
  title: string;
  category?: string;
  bullets: string[];
  keyTakeaway?: string;
  visualDescription?: string;
}

interface PptxOptions {
  title: string;
  subtitle: string;
  subject: string;
  learningGoal: string;
  slides: SlideData[];
}

export async function generateBinaryPptx(opts: PptxOptions): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  // Master Slide Styling (Dark Minimalist)
  const BG_COLOR = "09090b";
  const CARD_BG = "18181b";
  const ACCENT_COLOR = "ffffff";
  const MUTED_COLOR = "a1a1aa";

  // 1. Title Slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: BG_COLOR };

  titleSlide.addText("GOOGLE ACADEMY COMPANION", {
    x: 0.8,
    y: 1.2,
    fontSize: 12,
    color: MUTED_COLOR,
    fontFace: "Arial",
    bold: true
  });

  titleSlide.addText(opts.title, {
    x: 0.8,
    y: 1.8,
    w: 11.5,
    fontSize: 34,
    color: ACCENT_COLOR,
    fontFace: "Arial",
    bold: true
  });

  titleSlide.addText(opts.subtitle || `Complete Course Curriculum • ${opts.subject}`, {
    x: 0.8,
    y: 3.4,
    w: 11.0,
    fontSize: 16,
    color: MUTED_COLOR,
    fontFace: "Arial"
  });

  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 4.8,
    w: 11.5,
    h: 1.2,
    fill: { color: CARD_BG },
    line: { color: "27272a", width: 1 }
  });

  titleSlide.addText(`Target Goal: ${opts.learningGoal.slice(0, 85)}`, {
    x: 1.1,
    y: 5.1,
    fontSize: 12,
    color: ACCENT_COLOR,
    fontFace: "Arial"
  });

  titleSlide.addText(`Course Subject: ${opts.subject} • Slides: ${opts.slides.length + 2} • Formatted for Study & Review`, {
    x: 1.1,
    y: 5.45,
    fontSize: 10,
    color: MUTED_COLOR,
    fontFace: "Arial"
  });

  // 2. Agenda / Executive Overview Slide
  const agendaSlide = pptx.addSlide();
  agendaSlide.background = { color: BG_COLOR };
  agendaSlide.addText("CURRICULUM OVERVIEW", {
    x: 0.8,
    y: 0.8,
    fontSize: 12,
    color: MUTED_COLOR,
    bold: true
  });
  agendaSlide.addText("Course Trajectory & Core Stages", {
    x: 0.8,
    y: 1.2,
    fontSize: 24,
    color: ACCENT_COLOR,
    bold: true
  });

  opts.slides.slice(0, 6).forEach((s, idx) => {
    agendaSlide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 2.2 + (idx * 0.75),
      w: 11.5,
      h: 0.65,
      fill: { color: CARD_BG },
      line: { color: "27272a", width: 1 }
    });
    agendaSlide.addText(`Stage ${idx + 1}: ${s.title}`, {
      x: 1.1,
      y: 2.35 + (idx * 0.75),
      fontSize: 13,
      color: ACCENT_COLOR,
      bold: true
    });
  });

  // 3. Content Slides
  opts.slides.forEach((s) => {
    const slide = pptx.addSlide();
    slide.background = { color: BG_COLOR };

    slide.addText((s.category || "MODULE CORE").toUpperCase(), {
      x: 0.8,
      y: 0.7,
      fontSize: 11,
      color: MUTED_COLOR,
      bold: true
    });

    slide.addText(s.title, {
      x: 0.8,
      y: 1.1,
      w: 11.5,
      fontSize: 22,
      color: ACCENT_COLOR,
      bold: true
    });

    // Content Card
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.8,
      w: 11.5,
      h: 4.2,
      fill: { color: CARD_BG },
      line: { color: "27272a", width: 1 }
    });

    const bulletItems = s.bullets.map(b => ({
      text: b,
      options: { fontSize: 13, color: "e4e4e7", bullet: true }
    }));

    slide.addText(bulletItems, {
      x: 1.2,
      y: 2.2,
      w: 10.7,
      h: 2.6
    });

    if (s.keyTakeaway) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.2,
        y: 5.0,
        w: 10.7,
        h: 0.7,
        fill: { color: "141417" },
        line: { color: "3f3f46", width: 1 }
      });
      slide.addText(`Key Takeaway: ${s.keyTakeaway}`, {
        x: 1.4,
        y: 5.2,
        w: 10.3,
        fontSize: 11,
        color: "fafafa",
        bold: true
      });
    }

    // Running slide number
    slide.addText(`Slide ${s.slideNumber + 2}`, {
      x: 11.0,
      y: 6.8,
      fontSize: 9,
      color: MUTED_COLOR
    });
  });

  // 4. Wrap-up / Synthesis Slide
  const wrapSlide = pptx.addSlide();
  wrapSlide.background = { color: BG_COLOR };
  wrapSlide.addText("COURSE COMPLETE", {
    x: 0.8,
    y: 1.2,
    fontSize: 12,
    color: MUTED_COLOR,
    bold: true
  });
  wrapSlide.addText("Mastery & Active Retrieval Checkpoint", {
    x: 0.8,
    y: 1.6,
    w: 11.5,
    fontSize: 26,
    color: ACCENT_COLOR,
    bold: true
  });
  wrapSlide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 2.4,
    w: 11.5,
    h: 3.8,
    fill: { color: CARD_BG },
    line: { color: "27272a", width: 1 }
  });
  wrapSlide.addText([
    { text: "Complete Course Study Notes and Short Revision Sheets are available in the Library.", options: { fontSize: 14, color: "e4e4e7", bullet: true } },
    { text: "Test conceptual recall through the Full Course Flashcard collection.", options: { fontSize: 14, color: "e4e4e7", bullet: true } },
    { text: "Explore inter-module relationships in the Progressive Interactive Mind Map.", options: { fontSize: 14, color: "e4e4e7", bullet: true } },
    { text: "Apply first-principles problem solving in the Course Practice Worksheets.", options: { fontSize: 14, color: "e4e4e7", bullet: true } }
  ], {
    x: 1.2,
    y: 2.8,
    w: 10.7,
    h: 3.0
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HIGH-LEVEL WORKSPACE DOCUMENT COMPILERS
// ─────────────────────────────────────────────────────────────────────────────

export async function generateAllWorkspaceFiles(
  workspace: Workspace,
  courseMaterialsInput?: CourseStudyMaterials
): Promise<WorkspaceFile[]> {
  const dir = ensureWorkspaceFilesDir(workspace.id);
  const files: WorkspaceFile[] = [];
  const now = new Date().toISOString();

  let courseMaterials = courseMaterialsInput || workspace.courseMaterials;
  if (!courseMaterials) {
    const mods = workspace.learningModules || [];
    courseMaterials = {
      detailedNotes: {
        title: `${workspace.title}: Comprehensive Course Notes`,
        overview: `Complete course detailed notes for ${workspace.title}`,
        tableOfContents: mods.map(m => m.title),
        sections: mods.map(m => ({
          heading: m.title,
          content: m.comprehensiveNotes || m.purpose,
          keyPrinciples: m.quickNotes?.keyPrinciples || []
        })),
        synthesisAndConclusion: "Course complete.",
        sourceReferences: workspace.resources.map(r => r.title)
      },
      shortNotes: {
        title: `${workspace.title}: Short Revision Notes`,
        courseScope: workspace.subject,
        coreTaxonomyAndDefinitions: mods.flatMap(m => m.quickNotes?.coreDefinitions || []),
        governingAxiomsAndFormulas: mods.flatMap(m => m.quickNotes?.essentialFormulasOrRules || []),
        criticalDistinctions: [],
        highYieldRevisionBullets: mods.flatMap(m => m.quickNotes?.criticalFacts || []),
        overarchingTakeaway: "Master fundamental invariants."
      },
      slideDeck: {
        title: workspace.title,
        subtitle: "Complete Course Presentation",
        courseSubject: workspace.subject,
        slides: [
          {
            slideNumber: 1,
            title: workspace.title,
            category: "Overview",
            bullets: [workspace.learningGoal || workspace.subject, "Systematic multi-stage curriculum"],
            keyTakeaway: "Complete Course Coverage"
          },
          ...mods.map((m, idx) => ({
            slideNumber: idx + 2,
            title: m.title,
            category: `Module ${m.moduleNumber}`,
            bullets: m.topicsCovered?.length ? m.topicsCovered : [m.purpose],
            keyTakeaway: m.quickNotes?.finalTakeaway || m.purpose
          }))
        ]
      },
      practiceSet: {
        title: `${workspace.title}: Practice Problem Set`,
        exercises: mods.map((m, idx) => ({
          id: `ex_${workspace.id}_${idx + 1}`,
          exerciseNumber: idx + 1,
          title: `${m.title} Practice Problem`,
          scenario: `Apply concepts of ${m.title}.`,
          problemStatement: `Analyze the core mechanisms and verify system behavior in ${m.title}.`,
          deliverable: "Step-by-step proof or worked solution.",
          solutionWalkthrough: "Apply foundational equations and check limits.",
          difficulty: "Foundational" as const
        }))
      }
    };
  }

  // ── A. COURSE LEVEL STUDY MATERIALS ──

  // 1. Detailed Notes (PDF & DOCX)
  const detailedSections: PdfSection[] = courseMaterials.detailedNotes.sections.map(s => ({
    heading: s.heading,
    subheading: s.subheading,
    paragraphs: [s.content],
    callout: s.callout,
    bullets: s.keyPrinciples,
    diagram: s.visualExplanation?.content,
    table: s.examples?.length ? {
      headers: ["Worked Example", "Scenario / Problem", "Solution Principle"],
      rows: s.examples.map(e => [e.title, e.scenario.slice(0, 45), e.solution.slice(0, 45)])
    } : undefined
  }));

  try {
    const detailedPdf = await generateBinaryPdf({
      title: `${workspace.title}: Comprehensive Course Notes`,
      subtitle: `Complete Course Textbook & Systematic Analytical Guide`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Detailed Notes",
      scope: "course",
      sections: detailedSections,
      tableOfContents: courseMaterials.detailedNotes.tableOfContents,
      finalTakeaway: courseMaterials.detailedNotes.synthesisAndConclusion
    });
    const pdfName = "Detailed Notes.pdf";
    const pdfPath = path.join(dir, pdfName);
    fs.writeFileSync(pdfPath, detailedPdf);

    files.push({
      file_id: `f_${workspace.id}_detailed_notes_pdf`,
      workspace_id: workspace.id,
      title: "Detailed Notes (Complete Course)",
      artifact_type: "detailed_notes",
      scope: "course",
      format: "pdf",
      fileName: pdfName,
      filePath: pdfPath,
      file_path: pdfPath,
      fileSize: detailedPdf.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Textbook-quality comprehensive study document covering all modules."
    });
  } catch (err) {
    console.error("Error generating detailed notes PDF:", err);
  }

  try {
    const detailedDocx = await generateBinaryDocx({
      title: `${workspace.title}: Comprehensive Course Notes`,
      subtitle: `Complete Course Textbook & Systematic Analytical Guide`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Detailed Notes",
      sections: detailedSections,
      tableOfContents: courseMaterials.detailedNotes.tableOfContents,
      finalTakeaway: courseMaterials.detailedNotes.synthesisAndConclusion
    });
    const docxName = "Detailed Notes.docx";
    const docxPath = path.join(dir, docxName);
    fs.writeFileSync(docxPath, detailedDocx);

    files.push({
      file_id: `f_${workspace.id}_detailed_notes_docx`,
      workspace_id: workspace.id,
      title: "Detailed Notes (Word Document)",
      artifact_type: "detailed_notes",
      scope: "course",
      format: "docx",
      fileName: docxName,
      filePath: docxPath,
      file_path: docxPath,
      fileSize: detailedDocx.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Microsoft Word editable edition of complete course textbook notes."
    });
  } catch (err) {
    console.error("Error generating detailed notes DOCX:", err);
  }

  // 2. Short Notes / Revision Notes (PDF & DOCX)
  const shortSections: PdfSection[] = [
    {
      heading: "1. Core Subject Taxonomy & Essential Definitions",
      paragraphs: ["Foundational terminology and precise definitions across the entire curriculum:"],
      bullets: courseMaterials.shortNotes.coreTaxonomyAndDefinitions.map(d => `${d.term}: ${d.definition}`),
      table: {
        headers: ["Term", "Authoritative Definition", "Module Context"],
        rows: courseMaterials.shortNotes.coreTaxonomyAndDefinitions.map(d => [
          d.term,
          d.definition.slice(0, 48),
          d.moduleContext || "Course Invariant"
        ])
      }
    },
    {
      heading: "2. Governing Axioms, Laws & Essential Rules",
      paragraphs: ["Crucial governing formulas and invariant principles required for high-yield recall:"],
      bullets: courseMaterials.shortNotes.governingAxiomsAndFormulas
    },
    {
      heading: "3. Critical Distinctions & Conceptual Pitfalls",
      paragraphs: ["Essential distinctions that prevent common exam and operational errors:"],
      bullets: courseMaterials.shortNotes.criticalDistinctions.map(cd => `${cd.conceptA} vs. ${cd.conceptB}: ${cd.keyDifference}`)
    },
    {
      heading: "4. Rapid Revision Checkpoints",
      paragraphs: ["High-yield checkpoints for rapid end-of-course review:"],
      bullets: courseMaterials.shortNotes.highYieldRevisionBullets
    }
  ];

  try {
    const shortPdf = await generateBinaryPdf({
      title: `${workspace.title}: Short Revision Notes`,
      subtitle: `Complete Course High-Yield Summary & Quick Revision Sheet`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Short Notes",
      scope: "course",
      sections: shortSections,
      finalTakeaway: courseMaterials.shortNotes.overarchingTakeaway
    });
    const shortPdfName = "Short Notes.pdf";
    const shortPdfPath = path.join(dir, shortPdfName);
    fs.writeFileSync(shortPdfPath, shortPdf);

    files.push({
      file_id: `f_${workspace.id}_short_notes_pdf`,
      workspace_id: workspace.id,
      title: "Short Notes / Revision Sheet",
      artifact_type: "short_notes",
      scope: "course",
      format: "pdf",
      fileName: shortPdfName,
      filePath: shortPdfPath,
      file_path: shortPdfPath,
      fileSize: shortPdf.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Complete course high-yield revision sheet covering all critical concepts."
    });
  } catch (err) {
    console.error("Error generating short notes PDF:", err);
  }

  try {
    const shortDocx = await generateBinaryDocx({
      title: `${workspace.title}: Short Revision Notes`,
      subtitle: `Complete Course High-Yield Summary & Quick Revision Sheet`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Short Notes",
      sections: shortSections,
      finalTakeaway: courseMaterials.shortNotes.overarchingTakeaway
    });
    const shortDocxName = "Short Notes.docx";
    const shortDocxPath = path.join(dir, shortDocxName);
    fs.writeFileSync(shortDocxPath, shortDocx);

    files.push({
      file_id: `f_${workspace.id}_short_notes_docx`,
      workspace_id: workspace.id,
      title: "Short Notes (Word Document)",
      artifact_type: "short_notes",
      scope: "course",
      format: "docx",
      fileName: shortDocxName,
      filePath: shortDocxPath,
      file_path: shortDocxPath,
      fileSize: shortDocx.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Microsoft Word edition of high-yield revision notes."
    });
  } catch (err) {
    console.error("Error generating short notes DOCX:", err);
  }

  // 3. Complete Slide Deck (PPTX & PDF)
  try {
    const pptxBuffer = await generateBinaryPptx({
      title: workspace.title,
      subtitle: courseMaterials.slideDeck.subtitle || "Complete Course Slide Deck",
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      slides: courseMaterials.slideDeck.slides
    });
    const pptxName = "Complete Slides.pptx";
    const pptxPath = path.join(dir, pptxName);
    fs.writeFileSync(pptxPath, pptxBuffer);

    files.push({
      file_id: `f_${workspace.id}_slides_pptx`,
      workspace_id: workspace.id,
      title: "Complete Slides (PowerPoint)",
      artifact_type: "slide_deck",
      scope: "course",
      format: "pptx",
      fileName: pptxName,
      filePath: pptxPath,
      file_path: pptxPath,
      fileSize: pptxBuffer.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Structured presentation slides covering every stage of the curriculum."
    });

    // Also generate PDF edition of slides for instant preview / download
    const slideSections: PdfSection[] = courseMaterials.slideDeck.slides.map(s => ({
      heading: `Slide ${s.slideNumber}: ${s.title}`,
      subheading: s.category,
      paragraphs: s.bullets,
      callout: s.keyTakeaway
    }));
    const slidePdf = await generateBinaryPdf({
      title: `${workspace.title}: Presentation Slides`,
      subtitle: `Complete Course Slide Deck Document`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Slide Deck Document",
      scope: "course",
      sections: slideSections
    });
    const slidePdfName = "Complete Slides.pdf";
    const slidePdfPath = path.join(dir, slidePdfName);
    fs.writeFileSync(slidePdfPath, slidePdf);

    files.push({
      file_id: `f_${workspace.id}_slides_pdf`,
      workspace_id: workspace.id,
      title: "Complete Slides (PDF Presentation)",
      artifact_type: "slide_deck",
      scope: "course",
      format: "pdf",
      fileName: slidePdfName,
      filePath: slidePdfPath,
      file_path: slidePdfPath,
      fileSize: slidePdf.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Printable PDF edition of complete course presentation slides."
    });
  } catch (err) {
    console.error("Error generating slides PPTX/PDF:", err);
  }

  // 4. Practice Set / Worksheets (PDF & DOCX)
  try {
    const practiceSections: PdfSection[] = courseMaterials.practiceSet.exercises.map(ex => ({
      heading: `Exercise ${ex.exerciseNumber}: ${ex.title}`,
      subheading: `Difficulty: ${ex.difficulty}`,
      paragraphs: [
        `Scenario: ${ex.scenario}`,
        `Problem Statement: ${ex.problemStatement}`,
        `Expected Deliverable: ${ex.deliverable}`
      ],
      callout: ex.hint ? `Hint: ${ex.hint}` : undefined,
      bullets: [
        `Solution Walkthrough: ${ex.solutionWalkthrough}`
      ]
    }));

    const practicePdf = await generateBinaryPdf({
      title: `${workspace.title}: Comprehensive Practice Worksheets`,
      subtitle: `Hands-on Exercises, Scenario Analyses, and Model Solutions`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Practice Worksheets",
      scope: "course",
      sections: practiceSections
    });
    const practicePdfName = "Practice Set.pdf";
    const practicePdfPath = path.join(dir, practicePdfName);
    fs.writeFileSync(practicePdfPath, practicePdf);

    files.push({
      file_id: `f_${workspace.id}_practice_set_pdf`,
      workspace_id: workspace.id,
      title: "Practice Set & Worksheets",
      artifact_type: "practice_worksheet",
      scope: "course",
      format: "pdf",
      fileName: practicePdfName,
      filePath: practicePdfPath,
      file_path: practicePdfPath,
      fileSize: practicePdf.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Complete course practice problems with step-by-step solutions."
    });

    // Also generate DOCX edition of practice worksheets
    const practiceDocx = await generateBinaryDocx({
      title: `${workspace.title}: Comprehensive Practice Worksheets`,
      subtitle: `Hands-on Exercises, Scenario Analyses, and Model Solutions`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Practice Worksheets",
      sections: practiceSections
    });
    const practiceDocxName = "Practice Worksheet.docx";
    const practiceDocxPath = path.join(dir, practiceDocxName);
    fs.writeFileSync(practiceDocxPath, practiceDocx);

    files.push({
      file_id: `f_${workspace.id}_practice_set_docx`,
      workspace_id: workspace.id,
      title: "Practice Set & Worksheets (Word Document)",
      artifact_type: "practice_worksheet",
      scope: "course",
      format: "docx",
      fileName: practiceDocxName,
      filePath: practiceDocxPath,
      file_path: practiceDocxPath,
      fileSize: practiceDocx.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Microsoft Word editable edition of course practice problems and solution walkthroughs."
    });
  } catch (err) {
    console.error("Error generating practice set PDF/DOCX:", err);
  }

  // 5. Course Flashcards (PDF & DOCX)
  if (courseMaterials.courseFlashcards && courseMaterials.courseFlashcards.length) {
    const flashcardSections: PdfSection[] = [
      {
        heading: "Active Retrieval Master Deck",
        paragraphs: [`Complete course flashcard collection covering ${courseMaterials.courseFlashcards.length} essential concepts:`],
        table: {
          headers: ["Card #", "Prompt / Question (Front)", "Target Concept", "Retrieval Answer (Back)"],
          rows: courseMaterials.courseFlashcards.map((fc, idx) => [
            `#${idx + 1}`,
            fc.front.slice(0, 36),
            fc.relatedConcept.slice(0, 18),
            fc.back.slice(0, 45)
          ])
        }
      }
    ];

    try {
      const fcPdf = await generateBinaryPdf({
        title: `${workspace.title}: Course Flashcard Master Deck`,
        subtitle: `Complete Course Active Recall Cards (${courseMaterials.courseFlashcards.length} Cards)`,
        subject: workspace.subject,
        learningGoal: workspace.learningGoal,
        documentType: "Flashcard Master Deck",
        scope: "course",
        sections: flashcardSections
      });
      const fcPdfName = "Course Flashcards.pdf";
      const fcPdfPath = path.join(dir, fcPdfName);
      fs.writeFileSync(fcPdfPath, fcPdf);

      files.push({
        file_id: `f_${workspace.id}_course_flashcards_pdf`,
        workspace_id: workspace.id,
        title: `Course Flashcards (${courseMaterials.courseFlashcards.length} Cards)`,
        artifact_type: "flashcards",
        scope: "course",
        format: "pdf",
        fileName: fcPdfName,
        filePath: fcPdfPath,
        file_path: fcPdfPath,
        fileSize: fcPdf.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: "Complete course active recall flashcard collection in printable PDF."
      });
    } catch (err) {
      console.error("Error generating course flashcards PDF:", err);
    }

    try {
      const fcDocx = await generateBinaryDocx({
        title: `${workspace.title}: Course Flashcard Master Deck`,
        subtitle: `Complete Course Active Recall Cards (${courseMaterials.courseFlashcards.length} Cards)`,
        subject: workspace.subject,
        learningGoal: workspace.learningGoal,
        documentType: "Flashcard Master Deck",
        sections: flashcardSections
      });
      const fcDocxName = "Course Flashcards.docx";
      const fcDocxPath = path.join(dir, fcDocxName);
      fs.writeFileSync(fcDocxPath, fcDocx);

      files.push({
        file_id: `f_${workspace.id}_course_flashcards_docx`,
        workspace_id: workspace.id,
        title: `Course Flashcards (Word Document)`,
        artifact_type: "flashcards",
        scope: "course",
        format: "docx",
        fileName: fcDocxName,
        filePath: fcDocxPath,
        file_path: fcDocxPath,
        fileSize: fcDocx.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: "Microsoft Word editable edition of complete course flashcard deck."
      });
    } catch (err) {
      console.error("Error generating course flashcards DOCX:", err);
    }
  }

  // 6. Complete Course Mind Map (Compiled PDF Document)
  if (courseMaterials.interactiveMindMap) {
    try {
      const mmPdf = await compileMindMapToPdf(
        `${workspace.title} — Course Knowledge Map`,
        workspace.subject,
        courseMaterials.interactiveMindMap
      );
      const mmPdfName = "Course Knowledge Mind Map.pdf";
      const mmPdfPath = path.join(dir, mmPdfName);
      fs.writeFileSync(mmPdfPath, mmPdf);

      files.push({
        file_id: `f_${workspace.id}_course_mindmap_pdf`,
        workspace_id: workspace.id,
        title: "Course Knowledge Mind Map (PDF)",
        artifact_type: "mind_map_export",
        scope: "course",
        format: "pdf",
        fileName: mmPdfName,
        filePath: mmPdfPath,
        file_path: mmPdfPath,
        fileSize: mmPdf.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: "Comprehensive compiled knowledge hierarchy map and concept relational links."
      });
    } catch (err) {
      console.error("Error generating course mind map PDF:", err);
    }
  }

  // ── B. MODULE LEVEL STUDY MATERIALS ──
  const modules = workspace.learningModules || [];
  for (const mod of modules) {
    // Module Notes PDF & DOCX
    const modSections: PdfSection[] = [
      {
        heading: `Module ${mod.moduleNumber}: ${mod.title}`,
        subheading: mod.purpose,
        paragraphs: [mod.comprehensiveNotes],
        callout: `Final Takeaway: ${mod.quickNotes.finalTakeaway}`,
        bullets: mod.quickNotes.keyPrinciples
      }
    ];

    try {
      const modPdf = await generateBinaryPdf({
        title: `Module ${mod.moduleNumber}: ${mod.title}`,
        subtitle: `Module-Specific Comprehensive Study Notes`,
        subject: workspace.subject,
        learningGoal: mod.purpose,
        documentType: `Module ${mod.moduleNumber} Notes`,
        scope: "module",
        sections: modSections
      });
      const modPdfName = `Module ${mod.moduleNumber} - Notes.pdf`;
      const modPdfPath = path.join(dir, modPdfName);
      fs.writeFileSync(modPdfPath, modPdf);

      const modFile: WorkspaceFile = {
        file_id: `f_${workspace.id}_mod_${mod.id}_notes_pdf`,
        workspace_id: workspace.id,
        module_id: mod.id,
        title: `Module ${mod.moduleNumber} Notes (PDF)`,
        artifact_type: "detailed_notes",
        scope: "module",
        format: "pdf",
        fileName: modPdfName,
        filePath: modPdfPath,
        file_path: modPdfPath,
        fileSize: modPdf.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: `Detailed chapter notes strictly for Module ${mod.moduleNumber}.`
      };
      files.push(modFile);
      if (!mod.files) mod.files = [];
      mod.files.push(modFile);
    } catch (err) {
      console.error(`Error generating PDF for module ${mod.id}:`, err);
    }

    try {
      const modDocx = await generateBinaryDocx({
        title: `Module ${mod.moduleNumber}: ${mod.title}`,
        subtitle: `Module-Specific Comprehensive Study Notes`,
        subject: workspace.subject,
        learningGoal: mod.purpose,
        documentType: `Module ${mod.moduleNumber} Notes`,
        sections: modSections
      });
      const modDocxName = `Module ${mod.moduleNumber} - Notes.docx`;
      const modDocxPath = path.join(dir, modDocxName);
      fs.writeFileSync(modDocxPath, modDocx);

      const modDocxFile: WorkspaceFile = {
        file_id: `f_${workspace.id}_mod_${mod.id}_notes_docx`,
        workspace_id: workspace.id,
        module_id: mod.id,
        title: `Module ${mod.moduleNumber} Notes (Word Document)`,
        artifact_type: "detailed_notes",
        scope: "module",
        format: "docx",
        fileName: modDocxName,
        filePath: modDocxPath,
        file_path: modDocxPath,
        fileSize: modDocx.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: `Editable Microsoft Word edition of Module ${mod.moduleNumber} notes.`
      };
      files.push(modDocxFile);
      if (!mod.files) mod.files = [];
      mod.files.push(modDocxFile);
    } catch (err) {
      console.error(`Error generating DOCX for module ${mod.id}:`, err);
    }

    // Module Short Notes PDF
    try {
      const modShortSections: PdfSection[] = [
        {
          heading: `Module ${mod.moduleNumber} High-Yield Definitions & Rules`,
          paragraphs: [`Core definitions and revision rules for ${mod.title}:`],
          bullets: mod.quickNotes.coreDefinitions.map(d => `${d.term}: ${d.definition}`)
        },
        {
          heading: "Essential Formulas & Principles",
          paragraphs: ["Governing invariants for this module:"],
          bullets: mod.quickNotes.keyPrinciples
        }
      ];
      const modShortPdf = await generateBinaryPdf({
        title: `Module ${mod.moduleNumber}: Quick Revision`,
        subtitle: `Module ${mod.moduleNumber} High-Yield Summary`,
        subject: workspace.subject,
        learningGoal: mod.purpose,
        documentType: `Module ${mod.moduleNumber} Short Notes`,
        scope: "module",
        sections: modShortSections,
        finalTakeaway: mod.quickNotes.finalTakeaway
      });
      const modShortPdfName = `Module ${mod.moduleNumber} - Short Notes.pdf`;
      const modShortPdfPath = path.join(dir, modShortPdfName);
      fs.writeFileSync(modShortPdfPath, modShortPdf);

      const modShortFile: WorkspaceFile = {
        file_id: `f_${workspace.id}_mod_${mod.id}_short_pdf`,
        workspace_id: workspace.id,
        module_id: mod.id,
        title: `Module ${mod.moduleNumber} Short Notes (PDF)`,
        artifact_type: "short_notes",
        scope: "module",
        format: "pdf",
        fileName: modShortPdfName,
        filePath: modShortPdfPath,
        file_path: modShortPdfPath,
        fileSize: modShortPdf.length,
        status: "ready",
        createdAt: now,
        updatedAt: now,
        description: `High-yield revision sheet strictly for Module ${mod.moduleNumber}.`
      };
      files.push(modShortFile);
      if (!mod.files) mod.files = [];
      mod.files.push(modShortFile);
    } catch (err) {
      console.error(`Error generating short notes PDF for module ${mod.id}:`, err);
    }

    // Module Quiz PDF
    if (mod.quizzes && mod.quizzes.length) {
      try {
        const quizSections: PdfSection[] = mod.quizzes.map((q, idx) => ({
          heading: `Question ${idx + 1} (${(q.type || "quiz").toUpperCase()})`,
          subheading: `Concept: ${q.conceptTested || "Core Knowledge"}`,
          paragraphs: [q.question],
          bullets: q.options.map(opt => `${opt === q.correctAnswer ? "[✓] " : "[ ] "} ${opt}`),
          callout: `Correct Answer: ${q.correctAnswer} — ${q.explanation}`
        }));

        const quizPdf = await generateBinaryPdf({
          title: `Module ${mod.moduleNumber}: Assessment Quiz`,
          subtitle: `Module-Specific Assessment & Model Solutions`,
          subject: workspace.subject,
          learningGoal: mod.purpose,
          documentType: `Module ${mod.moduleNumber} Quiz`,
          scope: "module",
          sections: quizSections
        });
        const quizPdfName = `Module ${mod.moduleNumber} - Quiz.pdf`;
        const quizPdfPath = path.join(dir, quizPdfName);
        fs.writeFileSync(quizPdfPath, quizPdf);

        const quizFile: WorkspaceFile = {
          file_id: `f_${workspace.id}_mod_${mod.id}_quiz_pdf`,
          workspace_id: workspace.id,
          module_id: mod.id,
          title: `Module ${mod.moduleNumber} Quiz (PDF)`,
          artifact_type: "quiz",
          scope: "module",
          format: "pdf",
          fileName: quizPdfName,
          filePath: quizPdfPath,
          file_path: quizPdfPath,
          fileSize: quizPdf.length,
          status: "ready",
          createdAt: now,
          updatedAt: now,
          description: `Assessment quiz with answer key for Module ${mod.moduleNumber}.`
        };
        files.push(quizFile);
        if (!mod.files) mod.files = [];
        mod.files.push(quizFile);
      } catch (err) {
        console.error(`Error generating quiz PDF for module ${mod.id}:`, err);
      }
    }

    // Module Flashcards PDF & DOCX
    if (mod.flashcards && mod.flashcards.length) {
      try {
        const modFcSections: PdfSection[] = [
          {
            heading: `Module ${mod.moduleNumber} Active Recall Cards`,
            paragraphs: [`Targeted flashcard collection covering ${mod.flashcards.length} essential concepts for ${mod.title}:`],
            table: {
              headers: ["Card #", "Prompt / Question (Front)", "Target Concept", "Retrieval Answer (Back)"],
              rows: mod.flashcards.map((fc, idx) => [
                `#${idx + 1}`,
                fc.front.slice(0, 36),
                fc.relatedConcept.slice(0, 18),
                fc.back.slice(0, 45)
              ])
            }
          }
        ];

        const modFcPdf = await generateBinaryPdf({
          title: `Module ${mod.moduleNumber}: Flashcards`,
          subtitle: `Active Recall Deck (${mod.flashcards.length} Cards)`,
          subject: workspace.subject,
          learningGoal: mod.purpose,
          documentType: `Module ${mod.moduleNumber} Flashcards`,
          scope: "module",
          sections: modFcSections
        });
        const modFcPdfName = `Module ${mod.moduleNumber} - Flashcards.pdf`;
        const modFcPdfPath = path.join(dir, modFcPdfName);
        fs.writeFileSync(modFcPdfPath, modFcPdf);

        const modFcFile: WorkspaceFile = {
          file_id: `f_${workspace.id}_mod_${mod.id}_flashcards_pdf`,
          workspace_id: workspace.id,
          module_id: mod.id,
          title: `Module ${mod.moduleNumber} Flashcards (PDF)`,
          artifact_type: "flashcards",
          scope: "module",
          format: "pdf",
          fileName: modFcPdfName,
          filePath: modFcPdfPath,
          file_path: modFcPdfPath,
          fileSize: modFcPdf.length,
          status: "ready",
          createdAt: now,
          updatedAt: now,
          description: `Active recall study deck for Module ${mod.moduleNumber}.`
        };
        files.push(modFcFile);
        if (!mod.files) mod.files = [];
        mod.files.push(modFcFile);
      } catch (err) {
        console.error(`Error generating flashcards PDF for module ${mod.id}:`, err);
      }
    }

    // Module Mind Map PDF
    if (mod.mindMapGraph) {
      try {
        const modMmPdf = await compileMindMapToPdf(
          `Module ${mod.moduleNumber}: ${mod.title}`,
          workspace.subject,
          mod.mindMapGraph
        );
        const modMmPdfName = `Module ${mod.moduleNumber} - Mind Map.pdf`;
        const modMmPdfPath = path.join(dir, modMmPdfName);
        fs.writeFileSync(modMmPdfPath, modMmPdf);

        const modMmFile: WorkspaceFile = {
          file_id: `f_${workspace.id}_mod_${mod.id}_mindmap_pdf`,
          workspace_id: workspace.id,
          module_id: mod.id,
          title: `Module ${mod.moduleNumber} Mind Map (PDF)`,
          artifact_type: "mind_map_export",
          scope: "module",
          format: "pdf",
          fileName: modMmPdfName,
          filePath: modMmPdfPath,
          file_path: modMmPdfPath,
          fileSize: modMmPdf.length,
          status: "ready",
          createdAt: now,
          updatedAt: now,
          description: `Knowledge tree hierarchy and concept mechanics for Module ${mod.moduleNumber}.`
        };
        files.push(modMmFile);
        if (!mod.files) mod.files = [];
        mod.files.push(modMmFile);
      } catch (err) {
        console.error(`Error generating mind map PDF for module ${mod.id}:`, err);
      }
    }
  }

  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPILED MIND MAP PDF GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export async function compileMindMapToPdf(
  title: string,
  subject: string,
  graph: MindMapGraph,
  exploredNodeIds?: string[]
): Promise<Buffer> {
  const exploredSet = new Set(exploredNodeIds || Object.keys(graph.nodes));
  const root = graph.nodes[graph.root_id];

  const sections: PdfSection[] = [];

  const visitNode = (nodeId: string, level: number) => {
    const node = graph.nodes[nodeId];
    if (!node || !exploredSet.has(nodeId)) return;

    const indent = "  ".repeat(level);
    const bullets: string[] = [];

    if (node.mechanics) bullets.push(`Mechanics: ${node.mechanics}`);
    if (node.keyRule) bullets.push(`Governing Rule: ${node.keyRule}`);
    if (node.knowledge_reference) bullets.push(`Reference: ${node.knowledge_reference}`);

    sections.push({
      heading: `${indent}${level === 0 ? "✦ " : level === 1 ? "↳ " : "• "}${node.title} (${node.node_type.toUpperCase()})`,
      paragraphs: [node.mechanics || `Explored concept node in ${subject}`],
      bullets: bullets.length ? bullets : undefined
    });

    for (const childId of node.children_ids) {
      visitNode(childId, level + 1);
    }
  };

  if (root) {
    visitNode(root.node_id, 0);
  }

  return generateBinaryPdf({
    title: `${title}: Compiled Mind Map`,
    subtitle: `Structured Knowledge Hierarchy & Concept Links`,
    subject,
    documentType: "Compiled Knowledge Map",
    scope: "course",
    sections: sections.length ? sections : [
      {
        heading: "Knowledge Structure",
        paragraphs: ["Explored concept branches captured from interactive map."],
        bullets: Object.values(graph.nodes).slice(0, 15).map(n => `${n.title} (${n.node_type})`)
      }
    ]
  });
}
