import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  LearningModule,
  WorkspaceFile,
  MindMapGraph,
  CourseStudyMaterials
} from "./types.js";
import {
  PdfDocOptions,
  PdfSection,
  DocxOptions,
  PptxOptions,
  QuizQuestionItem,
  FlashcardItem,
  PracticeExerciseItem,
  MindMapNodeItem,
  SlideItem
} from "./documentGenerator/types.js";
import { generateBinaryPdf, sanitizePdfText } from "./documentGenerator/pdfEngine.js";
import { generateBinaryDocx } from "./documentGenerator/docxEngine.js";
import { generateBinaryPptx } from "./documentGenerator/pptxEngine.js";

export * from "./documentGenerator/types.js";
export { generateBinaryPdf, sanitizePdfText } from "./documentGenerator/pdfEngine.js";
export { generateBinaryDocx } from "./documentGenerator/docxEngine.js";
export { generateBinaryPptx } from "./documentGenerator/pptxEngine.js";

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
// DETAILED NOTES PDF COMPILER
// ─────────────────────────────────────────────────────────────────────────────
export async function generateDetailedNotesPdf(workspace: Workspace): Promise<Buffer> {
  const materials = workspace.courseMaterials;
  const detailed = materials?.detailedNotes;

  let sections: PdfSection[] = [];
  let tableOfContents: string[] = [];
  let title = `${workspace.title}: Comprehensive Course Notes`;
  let subtitle = `Complete Course Textbook & Reference Material`;
  let overview = `Exhaustive first-principles notes and conceptual breakdown for ${workspace.title}.`;
  let finalTakeaway: string | undefined;
  let sourceReferences: string[] = workspace.resources.map(r => r.title);

  if (detailed && detailed.sections && detailed.sections.length) {
    title = detailed.title || title;
    overview = detailed.overview || overview;
    tableOfContents = detailed.tableOfContents || detailed.sections.map(s => s.heading);
    finalTakeaway = detailed.synthesisAndConclusion;
    sourceReferences = detailed.sourceReferences || sourceReferences;

    sections = detailed.sections.map(s => ({
      heading: s.heading,
      subheading: s.subheading,
      paragraphs: [s.content],
      callout: s.callout,
      bullets: s.keyPrinciples,
      examples: s.examples
    }));
  } else {
    const modules = workspace.learningModules || [];
    tableOfContents = modules.map(m => m.title);
    sections = modules.map(m => ({
      heading: `Module ${m.moduleNumber}: ${m.title}`,
      subheading: m.purpose,
      paragraphs: [m.comprehensiveNotes || m.purpose],
      callout: m.quickNotes?.finalTakeaway ? `Final Takeaway: ${m.quickNotes.finalTakeaway}` : undefined,
      bullets: m.quickNotes?.keyPrinciples || []
    }));
  }

  return generateBinaryPdf({
    title,
    subtitle,
    subject: workspace.subject,
    learningGoal: workspace.learningGoal,
    overview,
    documentType: "Comprehensive Course Notes",
    scope: "course",
    sections,
    tableOfContents,
    finalTakeaway,
    sourceReferences
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MIND MAP PDF COMPILER
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
  const mindMapNodes: MindMapNodeItem[] = [];

  const visitNode = (nodeId: string, level: number) => {
    const node = graph.nodes[nodeId];
    if (!node || !exploredSet.has(nodeId)) return;

    mindMapNodes.push({
      id: node.node_id,
      title: node.title,
      level,
      nodeType: node.node_type,
      mechanics: node.mechanics,
      keyRule: node.keyRule,
      reference: node.knowledge_reference
    });

    const indent = "  ".repeat(level);
    const bullets: string[] = [];
    if (node.mechanics) bullets.push(`Mechanics: ${node.mechanics}`);
    if (node.keyRule) bullets.push(`Governing Rule: ${node.keyRule}`);
    if (node.knowledge_reference) bullets.push(`Reference: ${node.knowledge_reference}`);

    sections.push({
      heading: `${indent}${level === 0 ? "✦ " : level === 1 ? "├── " : "└── "}${node.title} (${node.node_type.toUpperCase()})`,
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
    ],
    mindMapTree: {
      rootTitle: root ? root.title : title,
      nodes: mindMapNodes
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE FILES GENERATOR (All Course & Module Artifacts)
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
    examples: s.examples
  }));

  try {
    const detailedPdf = await generateBinaryPdf({
      title: courseMaterials.detailedNotes.title,
      subtitle: `Complete Course Textbook & Reference Material`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      overview: courseMaterials.detailedNotes.overview,
      documentType: "Comprehensive Course Notes",
      scope: "course",
      sections: detailedSections,
      tableOfContents: courseMaterials.detailedNotes.tableOfContents,
      finalTakeaway: courseMaterials.detailedNotes.synthesisAndConclusion,
      sourceReferences: courseMaterials.detailedNotes.sourceReferences
    });
    const detailedPdfName = "Complete Course Notes.pdf";
    const detailedPdfPath = path.join(dir, detailedPdfName);
    fs.writeFileSync(detailedPdfPath, detailedPdf);

    files.push({
      file_id: `f_${workspace.id}_detailed_notes_pdf`,
      workspace_id: workspace.id,
      title: "Complete Course Notes",
      artifact_type: "detailed_notes",
      scope: "course",
      format: "pdf",
      fileName: detailedPdfName,
      filePath: detailedPdfPath,
      file_path: detailedPdfPath,
      fileSize: detailedPdf.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Exhaustive textbook-grade course notes with diagrams, examples, and deep proofs."
    });

    const detailedDocx = await generateBinaryDocx({
      title: courseMaterials.detailedNotes.title,
      subtitle: `Complete Course Textbook & Reference Material`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      overview: courseMaterials.detailedNotes.overview,
      documentType: "Comprehensive Course Notes",
      sections: detailedSections,
      tableOfContents: courseMaterials.detailedNotes.tableOfContents,
      finalTakeaway: courseMaterials.detailedNotes.synthesisAndConclusion
    });
    const detailedDocxName = "Complete Course Notes.docx";
    const detailedDocxPath = path.join(dir, detailedDocxName);
    fs.writeFileSync(detailedDocxPath, detailedDocx);

    files.push({
      file_id: `f_${workspace.id}_detailed_notes_docx`,
      workspace_id: workspace.id,
      title: "Complete Course Notes (Word Document)",
      artifact_type: "detailed_notes",
      scope: "course",
      format: "docx",
      fileName: detailedDocxName,
      filePath: detailedDocxPath,
      file_path: detailedDocxPath,
      fileSize: detailedDocx.length,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      description: "Microsoft Word editable edition of complete course notes."
    });
  } catch (err) {
    console.error("Error generating detailed notes PDF/DOCX:", err);
  }

  // 2. Short / Revision Notes (PDF & DOCX)
  try {
    const shortSections: PdfSection[] = [
      {
        heading: "Core Taxonomy & High-Yield Definitions",
        paragraphs: ["Fundamental vocabulary and formal terminology:"],
        bullets: courseMaterials.shortNotes.coreTaxonomyAndDefinitions.map(d => `${d.term}: ${d.definition}`)
      },
      {
        heading: "Governing Axioms & Mathematical Rules",
        paragraphs: ["Universal invariants and governing formulas:"],
        bullets: courseMaterials.shortNotes.governingAxiomsAndFormulas
      },
      {
        heading: "Critical Conceptual Distinctions",
        paragraphs: ["Side-by-side comparison of frequently conflated principles:"],
        table: courseMaterials.shortNotes.criticalDistinctions.length ? {
          headers: ["Concept A", "Concept B", "Distinguishing Criterion"],
          rows: courseMaterials.shortNotes.criticalDistinctions.map(cd => [cd.conceptA, cd.conceptB, cd.keyDifference])
        } : undefined
      },
      {
        heading: "Rapid Review & High-Yield Facts",
        paragraphs: ["Fast retrieval checkpoints for exam preparation:"],
        bullets: courseMaterials.shortNotes.highYieldRevisionBullets
      }
    ];

    const shortPdf = await generateBinaryPdf({
      title: courseMaterials.shortNotes.title,
      subtitle: `Executive Revision Guide & Core Axioms`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Short Revision Notes",
      scope: "course",
      sections: shortSections,
      finalTakeaway: courseMaterials.shortNotes.overarchingTakeaway
    });
    const shortPdfName = "Course Short Notes.pdf";
    const shortPdfPath = path.join(dir, shortPdfName);
    fs.writeFileSync(shortPdfPath, shortPdf);

    files.push({
      file_id: `f_${workspace.id}_short_notes_pdf`,
      workspace_id: workspace.id,
      title: "Course Short Notes",
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
      description: "Condensed high-yield cheat sheet with governing formulas and definitions."
    });

    const shortDocx = await generateBinaryDocx({
      title: courseMaterials.shortNotes.title,
      subtitle: `Executive Revision Guide & Core Axioms`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Short Revision Notes",
      sections: shortSections,
      finalTakeaway: courseMaterials.shortNotes.overarchingTakeaway
    });
    const shortDocxName = "Course Short Notes.docx";
    const shortDocxPath = path.join(dir, shortDocxName);
    fs.writeFileSync(shortDocxPath, shortDocx);

    files.push({
      file_id: `f_${workspace.id}_short_notes_docx`,
      workspace_id: workspace.id,
      title: "Course Short Notes (Word Document)",
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
    console.error("Error generating short notes PDF/DOCX:", err);
  }

  // 3. Complete Slide Deck (PPTX & PDF)
  try {
    const pptxBuffer = await generateBinaryPptx({
      title: workspace.title,
      subtitle: courseMaterials.slideDeck.subtitle || "Complete Course Presentation",
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

    const slidePdf = await generateBinaryPdf({
      title: `${workspace.title}: Presentation Slides`,
      subtitle: `Complete Course Slide Deck Document`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Slide Deck Document",
      scope: "course",
      sections: [],
      slides: courseMaterials.slideDeck.slides
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
    const practiceExercises: PracticeExerciseItem[] = courseMaterials.practiceSet.exercises.map(ex => ({
      exerciseNumber: ex.exerciseNumber,
      title: ex.title,
      difficulty: ex.difficulty,
      scenario: ex.scenario,
      problemStatement: ex.problemStatement,
      deliverable: ex.deliverable,
      solutionWalkthrough: ex.solutionWalkthrough,
      hint: ex.hint
    }));

    const practiceSections: PdfSection[] = courseMaterials.practiceSet.exercises.map(ex => ({
      heading: `Exercise ${ex.exerciseNumber}: ${ex.title}`,
      subheading: `Difficulty: ${ex.difficulty}`,
      paragraphs: [
        `Scenario: ${ex.scenario}`,
        `Problem Statement: ${ex.problemStatement}`,
        `Expected Deliverable: ${ex.deliverable}`
      ],
      callout: ex.hint ? `Hint: ${ex.hint}` : undefined,
      bullets: [`Solution Walkthrough: ${ex.solutionWalkthrough}`]
    }));

    const practicePdf = await generateBinaryPdf({
      title: `${workspace.title}: Comprehensive Practice Worksheets`,
      subtitle: `Hands-on Exercises, Scenario Analyses, and Model Solutions`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Practice Worksheets",
      scope: "course",
      sections: practiceSections,
      practiceExercises
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

    const practiceDocx = await generateBinaryDocx({
      title: `${workspace.title}: Comprehensive Practice Worksheets`,
      subtitle: `Hands-on Exercises, Scenario Analyses, and Model Solutions`,
      subject: workspace.subject,
      learningGoal: workspace.learningGoal,
      documentType: "Practice Worksheets",
      sections: practiceSections,
      practiceExercises
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
    const flashcardItems: FlashcardItem[] = courseMaterials.courseFlashcards.map((fc, idx) => ({
      cardNumber: idx + 1,
      front: fc.front,
      back: fc.back,
      relatedConcept: fc.relatedConcept
    }));

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
        sections: flashcardSections,
        flashcards: flashcardItems
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
        sections: flashcardSections,
        flashcards: flashcardItems
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
        const quizQuestions: QuizQuestionItem[] = mod.quizzes.map((q, idx) => ({
          questionNumber: idx + 1,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          conceptTested: q.conceptTested,
          type: q.type
        }));

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
          sections: quizSections,
          quizQuestions
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
        const modFcItems: FlashcardItem[] = mod.flashcards.map((fc, idx) => ({
          cardNumber: idx + 1,
          front: fc.front,
          back: fc.back,
          relatedConcept: fc.relatedConcept
        }));

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
          sections: modFcSections,
          flashcards: modFcItems
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
