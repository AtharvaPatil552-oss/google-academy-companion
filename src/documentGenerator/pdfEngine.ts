import { PDFDocument, StandardFonts, rgb, grayscale, PDFPage, PDFFont } from "pdf-lib";
import {
  PdfDocOptions,
  PdfSection,
  QuizQuestionItem,
  FlashcardItem,
  PracticeExerciseItem,
  MindMapNodeItem,
  SlideItem
} from "./types.js";

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

export function wrapTextByWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizePdfText(text).trim();
  if (!clean) return [""];
  const words = clean.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
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
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 54;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // Palette: Academic, restrained, high-contrast
  const INK_PRIMARY = rgb(0.08, 0.08, 0.10);
  const INK_SECONDARY = rgb(0.32, 0.34, 0.38);
  const CARD_BG = rgb(0.97, 0.98, 0.99);
  const CARD_BORDER = rgb(0.86, 0.88, 0.92);
  const ACCENT_BAR = rgb(0.18, 0.28, 0.46);

  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const addNewPage = () => {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < MARGIN + 40) {
      addNewPage();
    }
  };

  const ensureHeadingSpace = (linesCount: number, level: 1 | 2 | 3) => {
    const needed = (linesCount * 18) + (level === 1 ? 80 : level === 2 ? 60 : 45);
    if (y - needed < MARGIN + 40) {
      addNewPage();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. COVER / TITLE PAGE
  // ─────────────────────────────────────────────────────────────────────────────
  // Scope / Category pill
  const scopeTag = opts.scope === "course"
    ? `GOOGLE ACADEMY COMPANION  •  ACADEMIC STUDY GUIDE`
    : `GOOGLE ACADEMY COMPANION  •  MODULE STUDY GUIDE`;

  currentPage.drawRectangle({
    x: MARGIN,
    y: y - 16,
    width: 250,
    height: 18,
    color: rgb(0.93, 0.94, 0.96)
  });
  currentPage.drawText(sanitizePdfText(scopeTag), {
    x: MARGIN + 8,
    y: y - 12,
    size: 7.5,
    font: fontBold,
    color: INK_PRIMARY
  });
  y -= 34;

  // Dark accent bar
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 4,
    color: INK_PRIMARY
  });
  y -= 24;

  // Document Title
  const titleLines = wrapTextByWidth(opts.title, fontBold, 21, CONTENT_WIDTH);
  for (const line of titleLines) {
    currentPage.drawText(sanitizePdfText(line), {
      x: MARGIN,
      y,
      size: 21,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 26;
  }
  y -= 4;

  // Subtitle / Subject
  if (opts.subtitle) {
    const subLines = wrapTextByWidth(opts.subtitle, fontOblique, 10.5, CONTENT_WIDTH);
    for (const line of subLines) {
      currentPage.drawText(sanitizePdfText(line), {
        x: MARGIN,
        y,
        size: 10.5,
        font: fontOblique,
        color: INK_SECONDARY
      });
      y -= 15;
    }
    y -= 6;
  }

  // Overview / Scope Statement
  if (opts.overview) {
    const ovLines = wrapTextByWidth(opts.overview, fontRegular, 9, CONTENT_WIDTH);
    for (const oline of ovLines) {
      currentPage.drawText(sanitizePdfText(oline), {
        x: MARGIN,
        y,
        size: 9,
        font: fontRegular,
        color: INK_SECONDARY
      });
      y -= 13;
    }
    y -= 8;
  }

  // Metadata Card
  y -= 10;
  const metaCardHeight = 74;
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - metaCardHeight,
    width: CONTENT_WIDTH,
    height: metaCardHeight,
    color: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 0.75
  });
  currentPage.drawRectangle({
    x: MARGIN,
    y: y - metaCardHeight,
    width: 3.5,
    height: metaCardHeight,
    color: ACCENT_BAR
  });

  const metaRows = [
    { label: "Subject Domain:", val: opts.subject },
    { label: "Learning Target:", val: (opts.learningGoal || "Comprehensive Curriculum Mastery").slice(0, 75) },
    { label: "Format & Scope:", val: `${opts.documentType}  •  ${opts.scope.toUpperCase()} LEVEL` },
    { label: "Generation Date:", val: `${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}  •  Academic Engine v2.0` }
  ];

  let my = y - 15;
  for (const mr of metaRows) {
    currentPage.drawText(sanitizePdfText(mr.label), {
      x: MARGIN + 14,
      y: my,
      size: 8,
      font: fontBold,
      color: INK_PRIMARY
    });
    currentPage.drawText(sanitizePdfText(mr.val), {
      x: MARGIN + 115,
      y: my,
      size: 8,
      font: fontRegular,
      color: INK_SECONDARY
    });
    my -= 14;
  }
  y -= metaCardHeight + 24;

  // Table of Contents on Cover (if provided)
  if (opts.tableOfContents && opts.tableOfContents.length) {
    currentPage.drawText("CURRICULUM TRAJECTORY & CHAPTER INDEX", {
      x: MARGIN,
      y,
      size: 8.5,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 14;

    currentPage.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_WIDTH, y },
      thickness: 0.5,
      color: CARD_BORDER
    });
    y -= 14;

    opts.tableOfContents.slice(0, 10).forEach((item, idx) => {
      if (y < MARGIN + 50) return;
      const chNum = `Chapter ${idx + 1}`;
      currentPage.drawText(chNum, {
        x: MARGIN,
        y,
        size: 8,
        font: fontBold,
        color: ACCENT_BAR
      });
      currentPage.drawText(sanitizePdfText(item.slice(0, 65)), {
        x: MARGIN + 60,
        y,
        size: 8,
        font: fontRegular,
        color: INK_PRIMARY
      });
      y -= 13;
    });
  }

  // Break to fresh page for Chapter 1 / Body content
  addNewPage();

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SPECIALIZED LAYOUT: ASSESSMENT QUIZZES
  // ─────────────────────────────────────────────────────────────────────────────
  if (opts.quizQuestions && opts.quizQuestions.length) {
    currentPage.drawText("EXAMINATION ASSESSMENT & MODEL SOLUTIONS", {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 18;

    currentPage.drawText("Complete assessment questions with conceptual rationale and solution walkthroughs.", {
      x: MARGIN,
      y,
      size: 9,
      font: fontOblique,
      color: INK_SECONDARY
    });
    y -= 24;

    for (const q of opts.quizQuestions) {
      const qLines = wrapTextByWidth(q.question, fontBold, 9.5, CONTENT_WIDTH - 20);
      const optLines = q.options.map(opt => wrapTextByWidth(opt, fontRegular, 8.5, CONTENT_WIDTH - 40));
      const expLines = wrapTextByWidth(q.explanation, fontRegular, 8, CONTENT_WIDTH - 24);

      const estimatedHeight = 24 + (qLines.length * 14) + (optLines.length * 15) + (expLines.length * 12) + 40;
      ensureSpace(Math.min(estimatedHeight, 220));

      // Question Header Card
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: rgb(0.93, 0.94, 0.96)
      });
      currentPage.drawText(`QUESTION ${q.questionNumber}`, {
        x: MARGIN + 8,
        y: y - 13,
        size: 8.5,
        font: fontBold,
        color: INK_PRIMARY
      });
      if (q.conceptTested) {
        currentPage.drawText(sanitizePdfText(`CONCEPT: ${q.conceptTested.toUpperCase()}`), {
          x: MARGIN + 120,
          y: y - 13,
          size: 7.5,
          font: fontBold,
          color: ACCENT_BAR
        });
      }
      y -= 28;

      // Question Stem
      for (const ql of qLines) {
        ensureSpace(14);
        currentPage.drawText(sanitizePdfText(ql), {
          x: MARGIN + 8,
          y,
          size: 9.5,
          font: fontBold,
          color: INK_PRIMARY
        });
        y -= 14;
      }
      y -= 6;

      // Options List
      q.options.forEach((opt, oi) => {
        const letter = String.fromCharCode(65 + oi);
        const isCorrect = opt === q.correctAnswer;
        ensureSpace(14);
        currentPage.drawText(`[ ${letter} ]`, {
          x: MARGIN + 12,
          y,
          size: 8.5,
          font: fontBold,
          color: isCorrect ? rgb(0.1, 0.45, 0.2) : INK_SECONDARY
        });
        currentPage.drawText(sanitizePdfText(opt.slice(0, 85)), {
          x: MARGIN + 42,
          y,
          size: 8.5,
          font: fontRegular,
          color: INK_PRIMARY
        });
        y -= 14;
      });
      y -= 6;

      // Model Answer Card
      const solBoxHeight = (expLines.length * 12) + 26;
      ensureSpace(solBoxHeight + 8);

      currentPage.drawRectangle({
        x: MARGIN + 6,
        y: y - solBoxHeight,
        width: CONTENT_WIDTH - 12,
        height: solBoxHeight,
        color: CARD_BG,
        borderColor: CARD_BORDER,
        borderWidth: 0.75
      });
      currentPage.drawRectangle({
        x: MARGIN + 6,
        y: y - solBoxHeight,
        width: 3,
        height: solBoxHeight,
        color: rgb(0.1, 0.45, 0.2)
      });

      currentPage.drawText(sanitizePdfText(`MODEL ANSWER: ${q.correctAnswer}`), {
        x: MARGIN + 16,
        y: y - 14,
        size: 8,
        font: fontBold,
        color: rgb(0.1, 0.45, 0.2)
      });

      let ey = y - 26;
      for (const el of expLines) {
        currentPage.drawText(sanitizePdfText(el), {
          x: MARGIN + 16,
          y: ey,
          size: 8,
          font: fontRegular,
          color: INK_PRIMARY
        });
        ey -= 12;
      }
      y -= solBoxHeight + 16;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SPECIALIZED LAYOUT: ACTIVE RETRIEVAL FLASHCARDS
  // ─────────────────────────────────────────────────────────────────────────────
  else if (opts.flashcards && opts.flashcards.length) {
    currentPage.drawText("ACTIVE RETRIEVAL FLASHCARD MASTER DECK", {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 18;

    currentPage.drawText(`Complete collection of ${opts.flashcards.length} spaced-retrieval cards with concept tagging.`, {
      x: MARGIN,
      y,
      size: 9,
      font: fontOblique,
      color: INK_SECONDARY
    });
    y -= 24;

    for (const fc of opts.flashcards) {
      const promptLines = wrapTextByWidth(fc.front, fontBold, 9, CONTENT_WIDTH - 30);
      const answerLines = wrapTextByWidth(fc.back, fontRegular, 8.5, CONTENT_WIDTH - 30);

      const cardHeight = 22 + (promptLines.length * 13) + 12 + (answerLines.length * 12) + 16;
      ensureSpace(cardHeight + 14);

      // Card Container
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - cardHeight,
        width: CONTENT_WIDTH,
        height: cardHeight,
        color: CARD_BG,
        borderColor: CARD_BORDER,
        borderWidth: 0.75
      });

      // Card Top Header
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: rgb(0.92, 0.94, 0.96)
      });
      currentPage.drawText(`CARD #${fc.cardNumber}`, {
        x: MARGIN + 10,
        y: y - 13,
        size: 7.5,
        font: fontBold,
        color: INK_PRIMARY
      });
      if (fc.relatedConcept) {
        currentPage.drawText(sanitizePdfText(`CONCEPT: ${fc.relatedConcept.toUpperCase()}`), {
          x: MARGIN + 80,
          y: y - 13,
          size: 7.5,
          font: fontBold,
          color: ACCENT_BAR
        });
      }

      // Prompt Section
      let cy = y - 30;
      currentPage.drawText("PROMPT / QUESTION:", {
        x: MARGIN + 10,
        y: cy,
        size: 7,
        font: fontBold,
        color: INK_SECONDARY
      });
      cy -= 12;

      for (const pl of promptLines) {
        currentPage.drawText(sanitizePdfText(pl), {
          x: MARGIN + 10,
          y: cy,
          size: 9,
          font: fontBold,
          color: INK_PRIMARY
        });
        cy -= 13;
      }

      // Divider hairline
      cy -= 4;
      currentPage.drawLine({
        start: { x: MARGIN + 10, y: cy },
        end: { x: MARGIN + CONTENT_WIDTH - 10, y: cy },
        thickness: 0.5,
        color: CARD_BORDER
      });
      cy -= 12;

      // Answer Section
      currentPage.drawText("RETRIEVAL TARGET & MODEL ANSWER:", {
        x: MARGIN + 10,
        y: cy,
        size: 7,
        font: fontBold,
        color: rgb(0.1, 0.4, 0.2)
      });
      cy -= 12;

      for (const al of answerLines) {
        currentPage.drawText(sanitizePdfText(al), {
          x: MARGIN + 10,
          y: cy,
          size: 8.5,
          font: fontRegular,
          color: INK_PRIMARY
        });
        cy -= 12;
      }

      y -= cardHeight + 14;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SPECIALIZED LAYOUT: HANDS-ON PRACTICE WORKSHEETS
  // ─────────────────────────────────────────────────────────────────────────────
  else if (opts.practiceExercises && opts.practiceExercises.length) {
    currentPage.drawText("COMPREHENSIVE PRACTICE WORKSHEETS", {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 18;

    currentPage.drawText("Scenario analyses, problem statements, deliverables, and model solution walkthroughs.", {
      x: MARGIN,
      y,
      size: 9,
      font: fontOblique,
      color: INK_SECONDARY
    });
    y -= 24;

    for (const ex of opts.practiceExercises) {
      ensureHeadingSpace(2, 1);

      // Exercise Banner
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 20,
        width: CONTENT_WIDTH,
        height: 20,
        color: INK_PRIMARY
      });
      currentPage.drawText(sanitizePdfText(`EXERCISE ${ex.exerciseNumber}: ${ex.title}`), {
        x: MARGIN + 10,
        y: y - 14,
        size: 9,
        font: fontBold,
        color: rgb(0.98, 0.98, 0.99)
      });
      if (ex.difficulty) {
        currentPage.drawText(sanitizePdfText(`[ ${ex.difficulty.toUpperCase()} ]`), {
          x: MARGIN + CONTENT_WIDTH - 90,
          y: y - 14,
          size: 7.5,
          font: fontBold,
          color: rgb(0.85, 0.88, 0.92)
        });
      }
      y -= 30;

      // Scenario Block
      currentPage.drawText("1. SCENARIO CONTEXT", {
        x: MARGIN,
        y,
        size: 8,
        font: fontBold,
        color: ACCENT_BAR
      });
      y -= 13;

      const scLines = wrapTextByWidth(ex.scenario, fontRegular, 8.5, CONTENT_WIDTH);
      for (const sl of scLines) {
        ensureSpace(13);
        currentPage.drawText(sanitizePdfText(sl), {
          x: MARGIN,
          y,
          size: 8.5,
          font: fontRegular,
          color: INK_PRIMARY
        });
        y -= 13;
      }
      y -= 8;

      // Problem Statement
      currentPage.drawText("2. PROBLEM STATEMENT", {
        x: MARGIN,
        y,
        size: 8,
        font: fontBold,
        color: ACCENT_BAR
      });
      y -= 13;

      const psLines = wrapTextByWidth(ex.problemStatement, fontBold, 8.5, CONTENT_WIDTH);
      for (const psl of psLines) {
        ensureSpace(13);
        currentPage.drawText(sanitizePdfText(psl), {
          x: MARGIN,
          y,
          size: 8.5,
          font: fontBold,
          color: INK_PRIMARY
        });
        y -= 13;
      }
      y -= 8;

      // Deliverable
      currentPage.drawText("3. EXPECTED DELIVERABLE", {
        x: MARGIN,
        y,
        size: 8,
        font: fontBold,
        color: ACCENT_BAR
      });
      y -= 13;

      const delLines = wrapTextByWidth(ex.deliverable, fontOblique, 8.5, CONTENT_WIDTH);
      for (const dl of delLines) {
        ensureSpace(13);
        currentPage.drawText(sanitizePdfText(dl), {
          x: MARGIN,
          y,
          size: 8.5,
          font: fontOblique,
          color: INK_SECONDARY
        });
        y -= 13;
      }
      y -= 8;

      // Solution Walkthrough Card
      const solLines = wrapTextByWidth(ex.solutionWalkthrough, fontRegular, 8, CONTENT_WIDTH - 24);
      const solHeight = (solLines.length * 12) + 26;
      ensureSpace(solHeight + 10);

      currentPage.drawRectangle({
        x: MARGIN,
        y: y - solHeight,
        width: CONTENT_WIDTH,
        height: solHeight,
        color: CARD_BG,
        borderColor: CARD_BORDER,
        borderWidth: 0.75
      });
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - solHeight,
        width: 3.5,
        height: solHeight,
        color: ACCENT_BAR
      });

      currentPage.drawText("MODEL SOLUTION & PROOF WALKTHROUGH:", {
        x: MARGIN + 12,
        y: y - 14,
        size: 8,
        font: fontBold,
        color: INK_PRIMARY
      });

      let sy = y - 26;
      for (const sl of solLines) {
        currentPage.drawText(sanitizePdfText(sl), {
          x: MARGIN + 12,
          y: sy,
          size: 8,
          font: fontRegular,
          color: INK_PRIMARY
        });
        sy -= 12;
      }
      y -= solHeight + 18;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SPECIALIZED LAYOUT: HIERARCHICAL MIND MAP TREE
  // ─────────────────────────────────────────────────────────────────────────────
  else if (opts.mindMapTree && opts.mindMapTree.nodes.length) {
    currentPage.drawText("COMPILED KNOWLEDGE MAP & CONCEPT MECHANICS", {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: INK_PRIMARY
    });
    y -= 18;

    currentPage.drawText(`Hierarchical knowledge tree for ${opts.mindMapTree.rootTitle} with governing rules and citations.`, {
      x: MARGIN,
      y,
      size: 9,
      font: fontOblique,
      color: INK_SECONDARY
    });
    y -= 24;

    for (const node of opts.mindMapTree.nodes) {
      const indent = Math.min(node.level * 18, 90);
      const nodeWidth = CONTENT_WIDTH - indent;

      ensureSpace(45);

      // Node classification badge
      const badge = `[ ${(node.nodeType || "CONCEPT").toUpperCase()} ]`;
      currentPage.drawText(badge, {
        x: MARGIN + indent,
        y,
        size: 7.5,
        font: fontBold,
        color: ACCENT_BAR
      });

      // Tree Branch Symbol & Title
      const branchPrefix = node.level === 0 ? "✦ " : node.level === 1 ? "├── " : "└── ";
      currentPage.drawText(sanitizePdfText(`${branchPrefix}${node.title}`), {
        x: MARGIN + indent + 60,
        y,
        size: 9.5,
        font: fontBold,
        color: INK_PRIMARY
      });
      y -= 14;

      if (node.mechanics) {
        const mLines = wrapTextByWidth(`Mechanics: ${node.mechanics}`, fontRegular, 8, nodeWidth - 10);
        for (const ml of mLines) {
          ensureSpace(12);
          currentPage.drawText(sanitizePdfText(ml), {
            x: MARGIN + indent + 12,
            y,
            size: 8,
            font: fontRegular,
            color: INK_PRIMARY
          });
          y -= 12;
        }
      }

      if (node.keyRule) {
        const rLines = wrapTextByWidth(`Governing Rule: ${node.keyRule}`, fontOblique, 8, nodeWidth - 10);
        for (const rl of rLines) {
          ensureSpace(12);
          currentPage.drawText(sanitizePdfText(rl), {
            x: MARGIN + indent + 12,
            y,
            size: 8,
            font: fontOblique,
            color: rgb(0.2, 0.35, 0.55)
          });
          y -= 12;
        }
      }
      y -= 6;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SPECIALIZED LAYOUT: PRESENTATION SLIDE DECK (PDF)
  // ─────────────────────────────────────────────────────────────────────────────
  else if (opts.slides && opts.slides.length) {
    for (const s of opts.slides) {
      ensureHeadingSpace(2, 1);

      // Slide Outer Card
      const bulletLines = s.bullets.flatMap(b => wrapTextByWidth(b, fontRegular, 9, CONTENT_WIDTH - 40));
      const takeawayLines = s.keyTakeaway ? wrapTextByWidth(s.keyTakeaway, fontBold, 8.5, CONTENT_WIDTH - 30) : [];
      const slideHeight = 50 + (bulletLines.length * 15) + (takeawayLines.length ? (takeawayLines.length * 13) + 24 : 0) + 16;

      ensureSpace(Math.min(slideHeight, 350));

      currentPage.drawRectangle({
        x: MARGIN,
        y: y - slideHeight,
        width: CONTENT_WIDTH,
        height: slideHeight,
        color: CARD_BG,
        borderColor: CARD_BORDER,
        borderWidth: 0.75
      });

      // Top slide header
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 24,
        width: CONTENT_WIDTH,
        height: 24,
        color: INK_PRIMARY
      });
      currentPage.drawText(sanitizePdfText((s.category || "MODULE CORE").toUpperCase()), {
        x: MARGIN + 12,
        y: y - 16,
        size: 7.5,
        font: fontBold,
        color: rgb(0.7, 0.75, 0.85)
      });
      currentPage.drawText(`Slide ${s.slideNumber}`, {
        x: MARGIN + CONTENT_WIDTH - 50,
        y: y - 16,
        size: 7.5,
        font: fontBold,
        color: rgb(0.85, 0.88, 0.95)
      });

      // Slide Title
      let sy = y - 42;
      currentPage.drawText(sanitizePdfText(s.title), {
        x: MARGIN + 12,
        y: sy,
        size: 12,
        font: fontBold,
        color: INK_PRIMARY
      });
      sy -= 20;

      // Bullets
      for (const b of s.bullets) {
        const bls = wrapTextByWidth(b, fontRegular, 9, CONTENT_WIDTH - 40);
        currentPage.drawText("*", {
          x: MARGIN + 14,
          y: sy,
          size: 9,
          font: fontBold,
          color: ACCENT_BAR
        });
        currentPage.drawText(sanitizePdfText(bls[0]), {
          x: MARGIN + 26,
          y: sy,
          size: 9,
          font: fontRegular,
          color: INK_PRIMARY
        });
        sy -= 14;
        for (let bi = 1; bi < bls.length; bi++) {
          currentPage.drawText(sanitizePdfText(bls[bi]), {
            x: MARGIN + 26,
            y: sy,
            size: 9,
            font: fontRegular,
            color: INK_PRIMARY
          });
          sy -= 14;
        }
      }

      // Key Takeaway Card at bottom of slide
      if (takeawayLines.length) {
        sy -= 4;
        const tkHeight = (takeawayLines.length * 13) + 16;
        currentPage.drawRectangle({
          x: MARGIN + 10,
          y: sy - tkHeight,
          width: CONTENT_WIDTH - 20,
          height: tkHeight,
          color: rgb(0.92, 0.94, 0.97),
          borderColor: CARD_BORDER,
          borderWidth: 0.5
        });
        currentPage.drawRectangle({
          x: MARGIN + 10,
          y: sy - tkHeight,
          width: 3,
          height: tkHeight,
          color: ACCENT_BAR
        });

        currentPage.drawText("KEY TAKEAWAY:", {
          x: MARGIN + 18,
          y: sy - 12,
          size: 7,
          font: fontBold,
          color: ACCENT_BAR
        });

        let ty = sy - 24;
        for (const tl of takeawayLines) {
          currentPage.drawText(sanitizePdfText(tl), {
            x: MARGIN + 18,
            y: ty,
            size: 8.5,
            font: fontBold,
            color: INK_PRIMARY
          });
          ty -= 13;
        }
      }

      y -= slideHeight + 18;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. STANDARD CHAPTER & SECTION LAYOUT (DETAILED NOTES / SHORT NOTES / MODULES)
  // ─────────────────────────────────────────────────────────────────────────────
  else {
    for (let si = 0; si < opts.sections.length; si++) {
      const sec = opts.sections[si];

      // Major chapter begins on fresh page (except first section on page 2)
      if (si > 0) {
        addNewPage();
      }

      // Chapter Heading (H1)
      const h1Lines = wrapTextByWidth(sec.heading, fontBold, 15, CONTENT_WIDTH - 15);
      ensureHeadingSpace(h1Lines.length, 1);

      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: 3.5,
        height: (h1Lines.length * 18) + 4,
        color: ACCENT_BAR
      });

      for (const hl of h1Lines) {
        currentPage.drawText(sanitizePdfText(hl), {
          x: MARGIN + 12,
          y,
          size: 15,
          font: fontBold,
          color: INK_PRIMARY
        });
        y -= 19;
      }
      y -= 4;

      if (sec.subheading) {
        const subLines = wrapTextByWidth(sec.subheading, fontOblique, 10, CONTENT_WIDTH - 15);
        for (const sl of subLines) {
          currentPage.drawText(sanitizePdfText(sl), {
            x: MARGIN + 12,
            y,
            size: 10,
            font: fontOblique,
            color: INK_SECONDARY
          });
          y -= 15;
        }
        y -= 6;
      }

      // Callout Box if explicitly provided
      if (sec.callout) {
        const cLines = wrapTextByWidth(sec.callout, fontRegular, 8.5, CONTENT_WIDTH - 24);
        const cHeight = (cLines.length * 13) + 24;
        ensureSpace(cHeight + 8);

        currentPage.drawRectangle({
          x: MARGIN,
          y: y - cHeight,
          width: CONTENT_WIDTH,
          height: cHeight,
          color: CARD_BG,
          borderColor: CARD_BORDER,
          borderWidth: 0.75
        });
        currentPage.drawRectangle({
          x: MARGIN,
          y: y - cHeight,
          width: 3.5,
          height: cHeight,
          color: ACCENT_BAR
        });

        currentPage.drawText("KEY CONCEPT & INVARIANT", {
          x: MARGIN + 12,
          y: y - 12,
          size: 7.5,
          font: fontBold,
          color: ACCENT_BAR
        });

        let cy = y - 24;
        for (const cl of cLines) {
          currentPage.drawText(sanitizePdfText(cl), {
            x: MARGIN + 12,
            y: cy,
            size: 8.5,
            font: fontRegular,
            color: INK_PRIMARY
          });
          cy -= 13;
        }
        y -= cHeight + 14;
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
              const bHeight = (codeLines.length * 11) + 16;
              ensureSpace(bHeight + 10);
              currentPage.drawRectangle({
                x: MARGIN,
                y: y - bHeight,
                width: CONTENT_WIDTH,
                height: bHeight,
                color: rgb(0.10, 0.11, 0.14),
                borderColor: rgb(0.25, 0.26, 0.3),
                borderWidth: 0.5
              });
              let cdy = y - 13;
              for (const cl of codeLines) {
                currentPage.drawText(sanitizePdfText(cl.slice(0, 75)), {
                  x: MARGIN + 10,
                  y: cdy,
                  size: 8,
                  font: fontMono,
                  color: rgb(0.88, 0.90, 0.94)
                });
                cdy -= 11;
              }
              y -= bHeight + 10;
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
            y -= 4;
            continue;
          }

          // Markdown Sub-subheading (###)
          if (trimmed.startsWith("### ")) {
            const hText = trimmed.replace(/^###\s+/, "");
            const hLines = wrapTextByWidth(hText, fontBold, 10.5, CONTENT_WIDTH);
            ensureHeadingSpace(hLines.length, 3);
            for (const hl of hLines) {
              currentPage.drawText(sanitizePdfText(hl), {
                x: MARGIN,
                y,
                size: 10.5,
                font: fontBold,
                color: INK_PRIMARY
              });
              y -= 14;
            }
            y -= 4;
            continue;
          }

          // Markdown Subheading (##)
          if (trimmed.startsWith("## ")) {
            const hText = trimmed.replace(/^##\s+/, "");
            const hLines = wrapTextByWidth(hText, fontBold, 12, CONTENT_WIDTH);
            ensureHeadingSpace(hLines.length, 2);
            for (const hl of hLines) {
              currentPage.drawText(sanitizePdfText(hl), {
                x: MARGIN,
                y,
                size: 12,
                font: fontBold,
                color: INK_PRIMARY
              });
              y -= 16;
            }
            y -= 4;
            continue;
          }

          // Markdown Heading (#)
          if (trimmed.startsWith("# ")) {
            const hText = trimmed.replace(/^#\s+/, "");
            const hLines = wrapTextByWidth(hText, fontBold, 13.5, CONTENT_WIDTH);
            ensureHeadingSpace(hLines.length, 1);
            for (const hl of hLines) {
              currentPage.drawText(sanitizePdfText(hl), {
                x: MARGIN,
                y,
                size: 13.5,
                font: fontBold,
                color: INK_PRIMARY
              });
              y -= 17;
            }
            y -= 6;
            continue;
          }

          // Definitions block
          if (/^(\*\*)?(Definition|Term):/i.test(trimmed)) {
            const defText = trimmed.replace(/^(\*\*)?(Definition|Term):\s*(\*\*)?/i, "");
            const parts = defText.split(/[:\-–—]\s*/);
            const term = parts.length > 1 ? parts[0].trim() : "Core Principle";
            const defBody = parts.length > 1 ? parts.slice(1).join(": ").trim() : defText;

            const termLines = wrapTextByWidth(term, fontBold, 8.5, CONTENT_WIDTH - 24);
            const bodyLines = wrapTextByWidth(defBody, fontRegular, 8.5, CONTENT_WIDTH - 24);
            const dHeight = (termLines.length * 13) + (bodyLines.length * 13) + 20;

            ensureSpace(dHeight + 8);

            currentPage.drawRectangle({
              x: MARGIN,
              y: y - dHeight,
              width: CONTENT_WIDTH,
              height: dHeight,
              color: rgb(0.98, 0.98, 0.995),
              borderColor: CARD_BORDER,
              borderWidth: 0.75
            });
            currentPage.drawRectangle({
              x: MARGIN,
              y: y - dHeight,
              width: 3,
              height: dHeight,
              color: ACCENT_BAR
            });

            currentPage.drawText("DEFINITION", {
              x: MARGIN + 12,
              y: y - 12,
              size: 7,
              font: fontBold,
              color: ACCENT_BAR
            });

            let dy = y - 22;
            for (const tl of termLines) {
              currentPage.drawText(sanitizePdfText(tl), {
                x: MARGIN + 12,
                y: dy,
                size: 8.5,
                font: fontBold,
                color: INK_PRIMARY
              });
              dy -= 13;
            }
            for (const bl of bodyLines) {
              currentPage.drawText(sanitizePdfText(bl), {
                x: MARGIN + 12,
                y: dy,
                size: 8.5,
                font: fontRegular,
                color: INK_PRIMARY
              });
              dy -= 13;
            }
            y -= dHeight + 10;
            continue;
          }

          // Warning / Pitfall block
          if (/^(\*\*)?(Warning|Pitfall|Common Mistake):/i.test(trimmed)) {
            const wText = trimmed.replace(/^(\*\*)?(Warning|Pitfall|Common Mistake):\s*(\*\*)?/i, "");
            const wLines = wrapTextByWidth(wText, fontRegular, 8.5, CONTENT_WIDTH - 24);
            const wHeight = (wLines.length * 13) + 24;

            ensureSpace(wHeight + 8);

            currentPage.drawRectangle({
              x: MARGIN,
              y: y - wHeight,
              width: CONTENT_WIDTH,
              height: wHeight,
              color: rgb(0.99, 0.98, 0.96),
              borderColor: rgb(0.92, 0.86, 0.8),
              borderWidth: 0.75
            });
            currentPage.drawRectangle({
              x: MARGIN,
              y: y - wHeight,
              width: 3.5,
              height: wHeight,
              color: rgb(0.8, 0.4, 0.15)
            });

            currentPage.drawText("COMMON PITFALL & BOUNDARY WARNING", {
              x: MARGIN + 12,
              y: y - 12,
              size: 7.5,
              font: fontBold,
              color: rgb(0.8, 0.4, 0.15)
            });

            let wy = y - 24;
            for (const wl of wLines) {
              currentPage.drawText(sanitizePdfText(wl), {
                x: MARGIN + 12,
                y: wy,
                size: 8.5,
                font: fontRegular,
                color: INK_PRIMARY
              });
              wy -= 13;
            }
            y -= wHeight + 10;
            continue;
          }

          // Formula block
          if (/^(\*\*)?(Formula|Equation):/i.test(trimmed) || (trimmed.startsWith("$$") && trimmed.endsWith("$$"))) {
            const formText = trimmed.replace(/^(\*\*)?(Formula|Equation):\s*(\*\*)?/i, "").replace(/^\$\$|\$\$$/g, "").trim();
            const fLines = wrapTextByWidth(formText, fontMonoBold, 9.5, CONTENT_WIDTH - 30);
            const fHeight = (fLines.length * 14) + 22;

            ensureSpace(fHeight + 8);

            currentPage.drawRectangle({
              x: MARGIN,
              y: y - fHeight,
              width: CONTENT_WIDTH,
              height: fHeight,
              color: CARD_BG,
              borderColor: CARD_BORDER,
              borderWidth: 0.75
            });
            currentPage.drawText("FORMULA / GOVERNING INVARIANT", {
              x: MARGIN + 12,
              y: y - 12,
              size: 7,
              font: fontBold,
              color: ACCENT_BAR
            });

            let fy = y - 24;
            for (const fl of fLines) {
              currentPage.drawText(sanitizePdfText(fl), {
                x: MARGIN + 16,
                y: fy,
                size: 9.5,
                font: fontMonoBold,
                color: INK_PRIMARY
              });
              fy -= 14;
            }
            y -= fHeight + 10;
            continue;
          }

          // Markdown Blockquote / Callout (> )
          if (trimmed.startsWith("> ")) {
            const bText = trimmed.replace(/^>\s+/, "");
            const bLines = wrapTextByWidth(bText, fontOblique, 8.5, CONTENT_WIDTH - 24);
            const bHeight = (bLines.length * 13) + 16;
            ensureSpace(bHeight + 8);

            currentPage.drawRectangle({
              x: MARGIN,
              y: y - bHeight,
              width: CONTENT_WIDTH,
              height: bHeight,
              color: CARD_BG,
              borderColor: CARD_BORDER,
              borderWidth: 0.75
            });
            currentPage.drawRectangle({
              x: MARGIN,
              y: y - bHeight,
              width: 3,
              height: bHeight,
              color: ACCENT_BAR
            });

            let by = y - 12;
            for (const bl of bLines) {
              currentPage.drawText(sanitizePdfText(bl), {
                x: MARGIN + 12,
                y: by,
                size: 8.5,
                font: fontOblique,
                color: INK_PRIMARY
              });
              by -= 13;
            }
            y -= bHeight + 8;
            continue;
          }

          // Bullet list item
          if (/^[\*\-\•]\s+/.test(trimmed)) {
            const itemText = trimmed.replace(/^[\*\-\•]\s+/, "");
            const bLines = wrapTextByWidth(itemText, fontRegular, 8.5, CONTENT_WIDTH - 24);
            ensureSpace(bLines.length * 13 + 4);

            currentPage.drawText("*", {
              x: MARGIN + 6,
              y,
              size: 9,
              font: fontBold,
              color: ACCENT_BAR
            });
            currentPage.drawText(sanitizePdfText(bLines[0]), {
              x: MARGIN + 18,
              y,
              size: 8.5,
              font: fontRegular,
              color: INK_PRIMARY
            });
            y -= 13;
            for (let bi = 1; bi < bLines.length; bi++) {
              ensureSpace(13);
              currentPage.drawText(sanitizePdfText(bLines[bi]), {
                x: MARGIN + 18,
                y,
                size: 8.5,
                font: fontRegular,
                color: INK_PRIMARY
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
            const bLines = wrapTextByWidth(itemText, fontRegular, 8.5, CONTENT_WIDTH - 28);
            ensureSpace(bLines.length * 13 + 4);

            currentPage.drawText(sanitizePdfText(numPrefix), {
              x: MARGIN + 4,
              y,
              size: 8.5,
              font: fontBold,
              color: ACCENT_BAR
            });
            currentPage.drawText(sanitizePdfText(bLines[0]), {
              x: MARGIN + 22,
              y,
              size: 8.5,
              font: fontRegular,
              color: INK_PRIMARY
            });
            y -= 13;
            for (let bi = 1; bi < bLines.length; bi++) {
              ensureSpace(13);
              currentPage.drawText(sanitizePdfText(bLines[bi]), {
                x: MARGIN + 22,
                y,
                size: 8.5,
                font: fontRegular,
                color: INK_PRIMARY
              });
              y -= 13;
            }
            continue;
          }

          // Markdown Table Row (| col1 | col2 |) with text wrapping
          if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            if (/^\|[\s\-:]+\|/.test(trimmed)) {
              continue;
            }
            const cells = trimmed.slice(1, -1).split("|").map(c => c.trim());
            if (cells.length >= 2) {
              const colWidth = CONTENT_WIDTH / cells.length;
              const cellWrapped = cells.map(c => wrapTextByWidth(c, fontRegular, 8, colWidth - 10));
              const maxLinesInRow = Math.max(...cellWrapped.map(cw => cw.length));
              const rowHeight = Math.max(18, (maxLinesInRow * 11) + 8);

              ensureSpace(rowHeight + 4);

              currentPage.drawRectangle({
                x: MARGIN,
                y: y - rowHeight + 4,
                width: CONTENT_WIDTH,
                height: rowHeight,
                color: CARD_BG,
                borderColor: CARD_BORDER,
                borderWidth: 0.5
              });

              cells.forEach((_, ci) => {
                const linesForCell = cellWrapped[ci];
                let cly = y - 8;
                for (const cl of linesForCell) {
                  currentPage.drawText(sanitizePdfText(cl), {
                    x: MARGIN + (ci * colWidth) + 6,
                    y: cly,
                    size: 8,
                    font: fontRegular,
                    color: INK_PRIMARY
                  });
                  cly -= 11;
                }
              });
              y -= rowHeight;
              continue;
            }
          }

          // Standard Paragraph line with comfortable leading
          const pLines = wrapTextByWidth(trimmed, fontRegular, 8.5, CONTENT_WIDTH);
          for (const pl of pLines) {
            ensureSpace(14);
            currentPage.drawText(sanitizePdfText(pl), {
              x: MARGIN,
              y,
              size: 8.5,
              font: fontRegular,
              color: INK_PRIMARY
            });
            y -= 13.5;
          }
          y -= 3;
        }
      }

      // Additional Section Bullets
      if (sec.bullets && sec.bullets.length) {
        ensureSpace(24);
        currentPage.drawText("Key Principles & Takeaways:", {
          x: MARGIN,
          y,
          size: 9,
          font: fontBold,
          color: INK_PRIMARY
        });
        y -= 14;

        for (const b of sec.bullets) {
          const bLines = wrapTextByWidth(b, fontRegular, 8.5, CONTENT_WIDTH - 24);
          ensureSpace(bLines.length * 13 + 4);
          currentPage.drawText("*", {
            x: MARGIN + 6,
            y,
            size: 9,
            font: fontBold,
            color: ACCENT_BAR
          });
          currentPage.drawText(sanitizePdfText(bLines[0]), {
            x: MARGIN + 18,
            y,
            size: 8.5,
            font: fontRegular,
            color: INK_PRIMARY
          });
          y -= 13;
          for (let bi = 1; bi < bLines.length; bi++) {
            ensureSpace(13);
            currentPage.drawText(sanitizePdfText(bLines[bi]), {
              x: MARGIN + 18,
              y,
              size: 8.5,
              font: fontRegular,
              color: INK_PRIMARY
            });
            y -= 13;
          }
        }
        y -= 6;
      }

      // Worked Examples in standard section
      if (sec.examples && sec.examples.length) {
        for (const ex of sec.examples) {
          const scenLines = wrapTextByWidth(ex.scenario, fontOblique, 8, CONTENT_WIDTH - 24);
          const solLines = wrapTextByWidth(ex.solution, fontRegular, 8, CONTENT_WIDTH - 24);
          const exHeight = 24 + (scenLines.length * 12) + 12 + (solLines.length * 12) + 16;

          ensureSpace(Math.min(exHeight, 260));

          currentPage.drawRectangle({
            x: MARGIN,
            y: y - exHeight,
            width: CONTENT_WIDTH,
            height: exHeight,
            color: CARD_BG,
            borderColor: CARD_BORDER,
            borderWidth: 0.75
          });

          currentPage.drawRectangle({
            x: MARGIN,
            y: y - 18,
            width: CONTENT_WIDTH,
            height: 18,
            color: rgb(0.92, 0.94, 0.96)
          });
          currentPage.drawText(sanitizePdfText(`WORKED EXAMPLE: ${ex.title}`), {
            x: MARGIN + 10,
            y: y - 13,
            size: 8,
            font: fontBold,
            color: INK_PRIMARY
          });

          let ey = y - 30;
          currentPage.drawText("Problem Context / Scenario:", {
            x: MARGIN + 10,
            y: ey,
            size: 7.5,
            font: fontBold,
            color: ACCENT_BAR
          });
          ey -= 12;

          for (const sl of scenLines) {
            currentPage.drawText(sanitizePdfText(sl), {
              x: MARGIN + 10,
              y: ey,
              size: 8,
              font: fontOblique,
              color: INK_PRIMARY
            });
            ey -= 12;
          }

          ey -= 4;
          currentPage.drawText("Step-by-Step Model Solution:", {
            x: MARGIN + 10,
            y: ey,
            size: 7.5,
            font: fontBold,
            color: rgb(0.1, 0.4, 0.2)
          });
          ey -= 12;

          for (const sol of solLines) {
            currentPage.drawText(sanitizePdfText(sol), {
              x: MARGIN + 10,
              y: ey,
              size: 8,
              font: fontRegular,
              color: INK_PRIMARY
            });
            ey -= 12;
          }

          y -= exHeight + 14;
        }
      }

      // ASCII / System Diagram
      if (sec.diagram) {
        const dlines = sec.diagram.split("\n");
        const dHeight = (dlines.length * 10) + 20;
        ensureSpace(dHeight + 8);

        currentPage.drawRectangle({
          x: MARGIN,
          y: y - dHeight,
          width: CONTENT_WIDTH,
          height: dHeight,
          color: rgb(0.10, 0.11, 0.14),
          borderColor: rgb(0.25, 0.26, 0.3),
          borderWidth: 0.5
        });

        currentPage.drawText("SYSTEM ARCHITECTURE & FLOW DIAGRAM", {
          x: MARGIN + 10,
          y: y - 12,
          size: 7,
          font: fontMonoBold,
          color: rgb(0.7, 0.75, 0.85)
        });

        let dy = y - 24;
        for (const dl of dlines) {
          currentPage.drawText(sanitizePdfText(dl.slice(0, 75)), {
            x: MARGIN + 10,
            y: dy,
            size: 7.5,
            font: fontMono,
            color: rgb(0.85, 0.88, 0.92)
          });
          dy -= 10;
        }
        y -= dHeight + 12;
      }

      // Section Table
      if (sec.table && sec.table.headers.length) {
        const colCount = sec.table.headers.length;
        const colWidth = CONTENT_WIDTH / colCount;

        ensureSpace(30);

        // Table Header Row
        currentPage.drawRectangle({
          x: MARGIN,
          y: y - 16,
          width: CONTENT_WIDTH,
          height: 18,
          color: INK_PRIMARY
        });

        sec.table.headers.forEach((th, ti) => {
          currentPage.drawText(sanitizePdfText(th.slice(0, 24)), {
            x: MARGIN + (ti * colWidth) + 6,
            y: y - 12,
            size: 7.5,
            font: fontBold,
            color: rgb(0.98, 0.98, 0.99)
          });
        });
        y -= 20;

        // Data Rows with wrapping
        for (const row of sec.table.rows) {
          const rowWrapped = row.map(cell => wrapTextByWidth(cell, fontRegular, 8, colWidth - 10));
          const maxLines = Math.max(...rowWrapped.map(rw => rw.length));
          const rowH = Math.max(16, (maxLines * 11) + 6);

          ensureSpace(rowH + 4);

          currentPage.drawRectangle({
            x: MARGIN,
            y: y - rowH + 4,
            width: CONTENT_WIDTH,
            height: rowH,
            color: CARD_BG,
            borderColor: CARD_BORDER,
            borderWidth: 0.5
          });

          row.forEach((_, ci) => {
            let rly = y - 6;
            for (const line of rowWrapped[ci]) {
              currentPage.drawText(sanitizePdfText(line), {
                x: MARGIN + (ci * colWidth) + 6,
                y: rly,
                size: 8,
                font: fontRegular,
                color: INK_PRIMARY
              });
              rly -= 11;
            }
          });
          y -= rowH;
        }
        y -= 8;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. FINAL SYNTHESIS / TAKEAWAY
  // ─────────────────────────────────────────────────────────────────────────────
  if (opts.finalTakeaway) {
    const tLines = wrapTextByWidth(opts.finalTakeaway, fontRegular, 8.5, CONTENT_WIDTH - 24);
    const tHeight = (tLines.length * 13) + 24;
    ensureSpace(tHeight + 14);

    currentPage.drawRectangle({
      x: MARGIN,
      y: y - tHeight,
      width: CONTENT_WIDTH,
      height: tHeight,
      color: INK_PRIMARY
    });

    currentPage.drawText("EXECUTIVE SYNTHESIS & FINAL TAKEAWAY", {
      x: MARGIN + 12,
      y: y - 13,
      size: 7.5,
      font: fontBold,
      color: rgb(0.85, 0.88, 0.95)
    });

    let ty = y - 26;
    for (const tl of tLines) {
      currentPage.drawText(sanitizePdfText(tl), {
        x: MARGIN + 12,
        y: ty,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.96, 0.97, 0.99)
      });
      ty -= 13;
    }
    y -= tHeight + 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SOURCE GROUNDING REFERENCES
  // ─────────────────────────────────────────────────────────────────────────────
  if (opts.sourceReferences && opts.sourceReferences.length) {
    ensureSpace(40);
    currentPage.drawText("AUTHORITATIVE SOURCES & SYLLABUS REFERENCES", {
      x: MARGIN,
      y,
      size: 8,
      font: fontBold,
      color: ACCENT_BAR
    });
    y -= 13;

    for (const ref of opts.sourceReferences) {
      const rLines = wrapTextByWidth(`• ${ref}`, fontRegular, 8, CONTENT_WIDTH);
      for (const rl of rLines) {
        ensureSpace(12);
        currentPage.drawText(sanitizePdfText(rl), {
          x: MARGIN,
          y,
          size: 8,
          font: fontRegular,
          color: INK_SECONDARY
        });
        y -= 12;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. POST-PROCESSING: RUNNING HEADER & RUNNING FOOTER STAMPING
  // ─────────────────────────────────────────────────────────────────────────────
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);

    // Top running header on all pages AFTER the cover page
    if (i > 0) {
      page.drawLine({
        start: { x: MARGIN, y: PAGE_HEIGHT - 36 },
        end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 36 },
        thickness: 0.5,
        color: grayscale(0.85)
      });
      page.drawText(
        sanitizePdfText(`GOOGLE ACADEMY COMPANION  •  ${opts.subject.toUpperCase()}  •  ${opts.documentType.toUpperCase()}`),
        {
          x: MARGIN,
          y: PAGE_HEIGHT - 30,
          size: 7.5,
          font: fontBold,
          color: grayscale(0.45)
        }
      );
    }

    // Running footer on ALL pages
    page.drawLine({
      start: { x: MARGIN, y: 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: 38 },
      thickness: 0.5,
      color: grayscale(0.85)
    });

    page.drawText(
      sanitizePdfText("Google Academy Companion  •  Source Grounded Curriculum"),
      {
        x: MARGIN,
        y: 26,
        size: 7.5,
        font: fontRegular,
        color: grayscale(0.5)
      }
    );

    const pageNumText = `Page ${i + 1} of ${totalPages}`;
    const numWidth = fontRegular.widthOfTextAtSize(pageNumText, 7.5);
    page.drawText(pageNumText, {
      x: PAGE_WIDTH - MARGIN - numWidth,
      y: 26,
      size: 7.5,
      font: fontRegular,
      color: grayscale(0.5)
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
