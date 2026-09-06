import PptxGenJS from "pptxgenjs";
import { PptxOptions, SlideItem } from "./types.js";

export async function generateBinaryPptx(opts: PptxOptions): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  // Master Slide Palette (Academic Dark Minimalist)
  const BG_COLOR = "09090b";
  const CARD_BG = "141417";
  const CARD_BORDER = "27272a";
  const TEXT_PRIMARY = "fafafa";
  const TEXT_MUTED = "a1a1aa";
  const ACCENT_COLOR = "60a5fa";

  // 1. Title Slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: BG_COLOR };

  titleSlide.addText("GOOGLE ACADEMY COMPANION  •  CURRICULUM SLIDES", {
    x: 0.8,
    y: 1.0,
    fontSize: 11,
    color: ACCENT_COLOR,
    fontFace: "Arial",
    bold: true
  });

  titleSlide.addText(opts.title, {
    x: 0.8,
    y: 1.6,
    w: 11.5,
    fontSize: 34,
    color: TEXT_PRIMARY,
    fontFace: "Arial",
    bold: true
  });

  titleSlide.addText(opts.subtitle || `Complete Course Curriculum • ${opts.subject}`, {
    x: 0.8,
    y: 3.2,
    w: 11.0,
    fontSize: 16,
    color: TEXT_MUTED,
    fontFace: "Arial"
  });

  // Metadata Card
  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 4.6,
    w: 11.5,
    h: 1.4,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 }
  });

  titleSlide.addText(`Target Goal: ${opts.learningGoal.slice(0, 95)}`, {
    x: 1.1,
    y: 4.85,
    fontSize: 12,
    color: TEXT_PRIMARY,
    fontFace: "Arial",
    bold: true
  });

  titleSlide.addText(`Subject Domain: ${opts.subject}   |   Curriculum Stages: ${opts.slides.length} Modules   |   Executive Presentation Format`, {
    x: 1.1,
    y: 5.35,
    fontSize: 10.5,
    color: TEXT_MUTED,
    fontFace: "Arial"
  });

  // 2. Agenda / Curriculum Trajectory Slide
  const agendaSlide = pptx.addSlide();
  agendaSlide.background = { color: BG_COLOR };

  agendaSlide.addText("CURRICULUM TRAJECTORY", {
    x: 0.8,
    y: 0.7,
    fontSize: 11,
    color: ACCENT_COLOR,
    bold: true
  });
  agendaSlide.addText("Course Stages & Knowledge Modules", {
    x: 0.8,
    y: 1.1,
    fontSize: 24,
    color: TEXT_PRIMARY,
    bold: true
  });

  // Render first 8 modules across 2 columns
  const firstCol = opts.slides.slice(0, 4);
  const secondCol = opts.slides.slice(4, 8);

  firstCol.forEach((s, idx) => {
    agendaSlide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 2.0 + (idx * 1.1),
      w: 5.6,
      h: 0.9,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 }
    });
    agendaSlide.addText(`Stage ${s.slideNumber}: ${s.title.slice(0, 40)}`, {
      x: 1.0,
      y: 2.15 + (idx * 1.1),
      fontSize: 12,
      color: TEXT_PRIMARY,
      bold: true
    });
    agendaSlide.addText(s.category || "Module Core", {
      x: 1.0,
      y: 2.5 + (idx * 1.1),
      fontSize: 9.5,
      color: TEXT_MUTED
    });
  });

  secondCol.forEach((s, idx) => {
    agendaSlide.addShape(pptx.ShapeType.rect, {
      x: 6.7,
      y: 2.0 + (idx * 1.1),
      w: 5.6,
      h: 0.9,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 }
    });
    agendaSlide.addText(`Stage ${s.slideNumber}: ${s.title.slice(0, 40)}`, {
      x: 6.9,
      y: 2.15 + (idx * 1.1),
      fontSize: 12,
      color: TEXT_PRIMARY,
      bold: true
    });
    agendaSlide.addText(s.category || "Module Core", {
      x: 6.9,
      y: 2.5 + (idx * 1.1),
      fontSize: 9.5,
      color: TEXT_MUTED
    });
  });

  // 3. Content Slides
  opts.slides.forEach((s) => {
    const slide = pptx.addSlide();
    slide.background = { color: BG_COLOR };

    slide.addText((s.category || "MODULE CORE").toUpperCase(), {
      x: 0.8,
      y: 0.65,
      fontSize: 11,
      color: ACCENT_COLOR,
      bold: true
    });

    slide.addText(s.title, {
      x: 0.8,
      y: 1.05,
      w: 11.5,
      fontSize: 22,
      color: TEXT_PRIMARY,
      bold: true
    });

    // Content Card
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.7,
      w: 11.5,
      h: 4.4,
      fill: { color: CARD_BG },
      line: { color: CARD_BORDER, width: 1 }
    });

    // If bullets > 4, render in 2 balanced columns
    if (s.bullets.length > 4) {
      const mid = Math.ceil(s.bullets.length / 2);
      const col1 = s.bullets.slice(0, mid).map(b => ({
        text: b,
        options: { fontSize: 12.5, color: "e4e4e7", bullet: true }
      }));
      const col2 = s.bullets.slice(mid).map(b => ({
        text: b,
        options: { fontSize: 12.5, color: "e4e4e7", bullet: true }
      }));

      slide.addText(col1, {
        x: 1.1,
        y: 2.0,
        w: 5.2,
        h: 2.7
      });
      slide.addText(col2, {
        x: 6.6,
        y: 2.0,
        w: 5.2,
        h: 2.7
      });
    } else {
      const bulletItems = s.bullets.map(b => ({
        text: b,
        options: { fontSize: 13.5, color: "e4e4e7", bullet: true }
      }));

      slide.addText(bulletItems, {
        x: 1.2,
        y: 2.1,
        w: 10.7,
        h: 2.7
      });
    }

    // Key Takeaway Card at bottom
    if (s.keyTakeaway) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.2,
        y: 5.1,
        w: 10.7,
        h: 0.8,
        fill: { color: "18181b" },
        line: { color: "3f3f46", width: 1 }
      });
      slide.addText(`KEY TAKEAWAY: ${s.keyTakeaway}`, {
        x: 1.4,
        y: 5.25,
        w: 10.3,
        fontSize: 11,
        color: TEXT_PRIMARY,
        bold: true
      });
    }

    // Running slide number
    slide.addText(`Slide ${s.slideNumber + 2} of ${opts.slides.length + 3}`, {
      x: 10.5,
      y: 6.8,
      fontSize: 9,
      color: TEXT_MUTED
    });
  });

  // 4. Wrap-up / Synthesis Slide
  const wrapSlide = pptx.addSlide();
  wrapSlide.background = { color: BG_COLOR };

  wrapSlide.addText("CURRICULUM COMPLETE", {
    x: 0.8,
    y: 1.0,
    fontSize: 11,
    color: ACCENT_COLOR,
    bold: true
  });
  wrapSlide.addText("Mastery & Active Retrieval Checkpoint", {
    x: 0.8,
    y: 1.4,
    w: 11.5,
    fontSize: 26,
    color: TEXT_PRIMARY,
    bold: true
  });

  wrapSlide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 2.2,
    w: 11.5,
    h: 4.2,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 }
  });

  wrapSlide.addText([
    { text: "Complete Course Study Notes and Short Revision Sheets are available in the Library.", options: { fontSize: 13.5, color: "e4e4e7", bullet: true } },
    { text: "Test conceptual recall through the Full Course Flashcard collection.", options: { fontSize: 13.5, color: "e4e4e7", bullet: true } },
    { text: "Explore inter-module relationships in the Progressive Interactive Mind Map.", options: { fontSize: 13.5, color: "e4e4e7", bullet: true } },
    { text: "Apply first-principles problem solving in the Course Practice Worksheets.", options: { fontSize: 13.5, color: "e4e4e7", bullet: true } }
  ], {
    x: 1.2,
    y: 2.6,
    w: 10.7,
    h: 3.2
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}
