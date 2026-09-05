import type {
  Workspace,
  Resource,
  StudyMaterial,
  SessionOverview,
  LearningStep,
  ProjectTask,
  WorkspaceAnalytics,
  LearningIntent,
  LearningModule,
  ModuleTopic,
  StageSummary,
  ModuleFlashcard,
  QuizQuestion,
  ModuleMindMap,
  PracticeTask,
  ModuleSummary,
  QuickNotes,
  MindMapGraph,
  MindMapGraphNode,
  CourseStudyMaterials,
  WorkspaceFile
} from "./types.js";
import { generateAllWorkspaceFiles } from "./documentGenerator.js";

export type GeminiCaller = (
  contents: string,
  systemPrompt?: string,
  customApiKey?: string
) => Promise<{ text: string; modelUsed: string; error?: string }>;

export function extractJsonFromMarkdown(text: string): any {
  if (!text) return null;
  let clean = text.trim();
  if (clean.startsWith("```")) {
    const lines = clean.split("\n");
    if (lines[0].startsWith("```")) {
      lines.shift();
    }
    if (lines.length && lines[lines.length - 1].startsWith("```")) {
      lines.pop();
    }
    clean = lines.join("\n").trim();
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      } catch (e2) {}
    }
    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(clean.slice(firstBracket, lastBracket + 1));
      } catch (e3) {}
    }
    return null;
  }
}

/**
 * Dynamic flashcard generator with zero fixed limits.
 * Identifies all learnable concepts across topics, definitions, worked examples, formulas, distinctions, and takeaways.
 */
export function generateDynamicFlashcardsForModule(
  modId: string,
  modTitle: string,
  topics: ModuleTopic[],
  quickNotes: QuickNotes,
  subject: string,
  goal: string,
  sourceTitle: string
): ModuleFlashcard[] {
  const cards: ModuleFlashcard[] = [];
  const seenPrompts = new Set<string>();

  const addCard = (
    front: string,
    back: string,
    concept: string,
    difficulty: "Beginner" | "Intermediate" | "Advanced"
  ) => {
    const key = front.toLowerCase().trim();
    if (seenPrompts.has(key)) return;
    seenPrompts.add(key);
    cards.push({
      id: `${modId}_fc_${cards.length + 1}`,
      front: front.trim(),
      back: back.trim(),
      relatedConcept: concept.trim(),
      difficulty,
      sourceResourceTitle: sourceTitle
    });
  };

  // 1. Definition cards from topics & quick notes
  for (const def of quickNotes.coreDefinitions) {
    addCard(
      `What is the precise definition of "${def.term}" in ${modTitle}?`,
      `${def.term}: ${def.definition}`,
      def.term,
      "Beginner"
    );
    addCard(
      `Why is understanding "${def.term}" essential to mastering ${subject}?`,
      `It serves as an authoritative domain building block, defining invariant operational boundaries.`,
      def.term,
      "Intermediate"
    );
  }

  // 2. Topic-specific deep cards
  for (const top of topics) {
    addCard(
      `State the primary objective and mental model for "${top.title}".`,
      top.overview,
      top.title,
      "Beginner"
    );

    if (top.principlesOrLaws) {
      for (const p of top.principlesOrLaws) {
        addCard(
          `What fundamental governing principle is established in ${top.title}?`,
          p,
          "Governing Law",
          "Intermediate"
        );
      }
    }

    if (top.workedExamples) {
      for (const we of top.workedExamples) {
        addCard(
          `How do you solve: "${we.title}"?`,
          `Steps:\n${we.stepByStepSolution.join(" -> ")}${we.commonTraps ? `\n\nWatch out for: ${we.commonTraps}` : ""}`,
          we.title,
          "Advanced"
        );
      }
    }

    if (top.coreDefinitions) {
      for (const cd of top.coreDefinitions) {
        addCard(
          `Define: ${cd.term}`,
          cd.definition,
          cd.term,
          "Beginner"
        );
      }
    }
  }

  // 3. Formulas and Invariants
  for (const rule of quickNotes.essentialFormulasOrRules) {
    addCard(
      `State the operational formula or rule for: ${rule.split(":")[0] || "Core Invariant"}`,
      rule,
      "Essential Rule",
      "Intermediate"
    );
  }

  // 4. Critical Distinctions
  for (const dist of quickNotes.importantDistinctions) {
    addCard(
      `What is the critical distinction regarding: ${dist.slice(0, 45)}?`,
      dist,
      "Distinctions & Boundaries",
      "Intermediate"
    );
  }

  // 5. Critical Facts
  for (const fact of quickNotes.criticalFacts) {
    addCard(
      `What critical fact must be accounted for in ${modTitle}?`,
      fact,
      "Critical Fact",
      "Advanced"
    );
  }

  // 6. Common Misconceptions & Edge Cases
  addCard(
    `What is the most prevalent cognitive pitfall when applying ${modTitle}?`,
    `Assuming idealized noise-free conditions and ignoring boundary limits where non-linear breakdown occurs.`,
    "Common Pitfalls",
    "Advanced"
  );

  // 7. Executive Takeaway & Alignment
  addCard(
    `Synthesize the single most important takeaway from ${modTitle}.`,
    quickNotes.finalTakeaway,
    "Synthesis",
    "Beginner"
  );

  addCard(
    `How does ${modTitle} directly connect to your goal: "${goal}"?`,
    `It provides the foundational mechanisms and problem-solving rules necessary to achieve targeted mastery.`,
    "Goal Alignment",
    "Beginner"
  );

  return cards;
}

/**
 * Builds a progressive hierarchical Mind Map graph for a module.
 * Initial state: Only root is expanded, showing immediate topics in a clean compact view.
 * All descendants start collapsed with interactive (+) controls.
 */
export function buildProgressiveMindMapGraph(
  module: { id: string; moduleNumber: number; title: string; purpose: string; topicsCovered: string[]; topics?: ModuleTopic[] },
  subject: string
): MindMapGraph {
  const rootId = `mm_${module.id}_root`;
  const nodes: Record<string, MindMapGraphNode> = {};

  // Root node: Module Title (Only root starts with expanded: true)
  nodes[rootId] = {
    node_id: rootId,
    parent_id: null,
    children_ids: [],
    title: module.title,
    node_type: "root",
    module_id: module.id,
    expanded: true,
    explored: true,
    depth: 0,
    mechanics: module.purpose,
    knowledge_reference: `Module ${module.moduleNumber}: ${module.title}`
  };

  const topics = module.topics && module.topics.length ? module.topics : module.topicsCovered.map((tc, idx) => ({
    id: `${module.id}_top_${idx + 1}`,
    topicNumber: idx + 1,
    title: tc,
    overview: `Foundations of ${tc}`,
    detailedNotes: "",
    learningObjectives: []
  }));

  topics.forEach((t: any, tIdx: number) => {
    const topicNodeId = `mm_${module.id}_top_${tIdx + 1}`;
    nodes[rootId].children_ids.push(topicNodeId);

    nodes[topicNodeId] = {
      node_id: topicNodeId,
      parent_id: rootId,
      children_ids: [],
      title: t.title,
      node_type: "topic",
      module_id: module.id,
      topic_id: t.id,
      expanded: false, // Compact initially!
      explored: false,
      depth: 1,
      mechanics: t.overview || `Core focus area in ${module.title}`,
      knowledge_reference: `Topic ${t.topicNumber || tIdx + 1}: ${t.title}`
    };

    // Subtopics & Core Concepts
    const concepts: { title: string; mechanics: string; keyRule?: string; details: string[] }[] = [];

    if (t.coreDefinitions && t.coreDefinitions.length) {
      t.coreDefinitions.forEach((d: any) => {
        concepts.push({
          title: d.term,
          mechanics: d.definition,
          keyRule: "Foundational Invariant",
          details: ["Domain Definition", "Boundary Context"]
        });
      });
    }

    if (t.principlesOrLaws && t.principlesOrLaws.length) {
      t.principlesOrLaws.forEach((p: any) => {
        concepts.push({
          title: typeof p === "string" ? p.slice(0, 32) : "Principle",
          mechanics: typeof p === "string" ? p : JSON.stringify(p),
          keyRule: "Governing Law",
          details: ["Causal Driver", "Validation Rule"]
        });
      });
    }

    if (t.workedExamples && t.workedExamples.length) {
      t.workedExamples.forEach((we: any) => {
        concepts.push({
          title: we.title,
          mechanics: we.problem,
          keyRule: we.commonTraps || "Step-by-step solution",
          details: Array.isArray(we.stepByStepSolution) ? we.stepByStepSolution : [we.solution || "Solution steps"]
        });
      });
    }

    if (!concepts.length) {
      concepts.push(
        {
          title: "Mechanics & Formulations",
          mechanics: `Underlying causal rules and mechanisms governing ${t.title}.`,
          keyRule: "Conservation & Invariants",
          details: ["Parameter Interaction", "System Bounds"]
        },
        {
          title: "Operational Applications",
          mechanics: `Practical execution and problem solving in ${t.title}.`,
          keyRule: "Boundary Verification",
          details: ["Real-world Scenarios", "Diagnostic Traps"]
        }
      );
    }

    concepts.forEach((c, cIdx) => {
      const conceptNodeId = `${topicNodeId}_c_${cIdx + 1}`;
      nodes[topicNodeId].children_ids.push(conceptNodeId);

      nodes[conceptNodeId] = {
        node_id: conceptNodeId,
        parent_id: topicNodeId,
        children_ids: [],
        title: c.title,
        node_type: "concept",
        module_id: module.id,
        topic_id: t.id,
        expanded: false,
        explored: false,
        depth: 2,
        mechanics: c.mechanics,
        keyRule: c.keyRule,
        knowledge_reference: `${t.title} -> ${c.title}`
      };

      c.details.forEach((det, detIdx) => {
        const detailNodeId = `${conceptNodeId}_d_${detIdx + 1}`;
        nodes[conceptNodeId].children_ids.push(detailNodeId);

        nodes[detailNodeId] = {
          node_id: detailNodeId,
          parent_id: conceptNodeId,
          children_ids: [],
          title: det,
          node_type: "detail",
          module_id: module.id,
          topic_id: t.id,
          expanded: false,
          explored: false,
          depth: 3,
          mechanics: `Detailed rule and specification for ${det}`,
          knowledge_reference: `${c.title} -> ${det}`
        };
      });
    });
  });

  return {
    graph_id: `graph_${module.id}`,
    title: `${module.title} Knowledge Map`,
    root_id: rootId,
    nodes
  };
}

/**
 * Builds the complete course knowledge map uniting all learning modules.
 */
export function buildCourseMindMapGraph(workspace: Workspace, modules: LearningModule[]): MindMapGraph {
  const rootId = `mm_course_${workspace.id}_root`;
  const nodes: Record<string, MindMapGraphNode> = {};

  nodes[rootId] = {
    node_id: rootId,
    parent_id: null,
    children_ids: [],
    title: workspace.title,
    node_type: "root",
    expanded: true,
    explored: true,
    depth: 0,
    mechanics: `Comprehensive Curriculum Knowledge Map for "${workspace.learningGoal}"`,
    knowledge_reference: `Complete Course: ${workspace.title}`
  };

  modules.forEach((m, mIdx) => {
    const modNodeId = `mm_course_mod_${mIdx + 1}`;
    nodes[rootId].children_ids.push(modNodeId);

    nodes[modNodeId] = {
      node_id: modNodeId,
      parent_id: rootId,
      children_ids: [],
      title: `Module ${m.moduleNumber}: ${m.title}`,
      node_type: "topic",
      module_id: m.id,
      expanded: false,
      explored: false,
      depth: 1,
      mechanics: m.purpose,
      knowledge_reference: `Module ${m.moduleNumber}: ${m.title}`
    };

    const topics = m.topics && m.topics.length ? m.topics : m.topicsCovered.map((tc, i) => ({
      id: `${m.id}_t_${i}`,
      topicNumber: i + 1,
      title: tc,
      overview: `Study focus on ${tc}`,
      detailedNotes: "",
      learningObjectives: []
    }));

    topics.forEach((top, topIdx) => {
      const topNodeId = `${modNodeId}_top_${topIdx + 1}`;
      nodes[modNodeId].children_ids.push(topNodeId);

      nodes[topNodeId] = {
        node_id: topNodeId,
        parent_id: modNodeId,
        children_ids: [],
        title: top.title,
        node_type: "subtopic",
        module_id: m.id,
        topic_id: top.id,
        expanded: false,
        explored: false,
        depth: 2,
        mechanics: top.overview,
        knowledge_reference: `Module ${m.moduleNumber} -> ${top.title}`
      };

      const topAny = top as any;
      const concepts: any[] = (topAny.coreDefinitions && topAny.coreDefinitions.length)
        ? topAny.coreDefinitions
        : [{ term: "Core Mechanism", definition: `Foundational law and principles in ${top.title}` }];

      concepts.forEach((c: any, cIdx: number) => {
        const cNodeId = `${topNodeId}_c_${cIdx + 1}`;
        nodes[topNodeId].children_ids.push(cNodeId);

        nodes[cNodeId] = {
          node_id: cNodeId,
          parent_id: topNodeId,
          children_ids: [],
          title: c.term || `Concept ${cIdx + 1}`,
          node_type: "concept",
          module_id: m.id,
          topic_id: top.id,
          expanded: false,
          explored: false,
          depth: 3,
          mechanics: c.definition,
          keyRule: "Foundational Invariant",
          knowledge_reference: `${top.title} -> ${c.term}`
        };
      });
    });
  });

  return {
    graph_id: `graph_course_${workspace.id}`,
    title: `${workspace.title} Complete Course Map`,
    root_id: rootId,
    nodes
  };
}

/**
 * Dynamic Master Flashcards covering the complete course.
 */
export function generateDynamicFlashcardsForCourse(workspace: Workspace, modules: LearningModule[]): ModuleFlashcard[] {
  const cards: ModuleFlashcard[] = [];
  const seen = new Set<string>();

  const add = (front: string, back: string, concept: string, diff: "Beginner" | "Intermediate" | "Advanced") => {
    const k = front.toLowerCase().trim();
    if (seen.has(k)) return;
    seen.add(k);
    cards.push({
      id: `course_fc_${cards.length + 1}`,
      front: front.trim(),
      back: back.trim(),
      relatedConcept: concept.trim(),
      difficulty: diff,
      sourceResourceTitle: "Complete Course Curriculum"
    });
  };

  add(
    `What is the overarching learning goal of "${workspace.title}"?`,
    workspace.learningGoal,
    "Course Architecture",
    "Beginner"
  );

  add(
    `Explain the primary trajectory connecting Stages 1 through ${modules.length}.`,
    `Stage 1 anchors foundational invariants, intermediate stages build causal mechanisms and problem solving, and the final stage synthesizes real-world application.`,
    "Curriculum Trajectory",
    "Intermediate"
  );

  for (const m of modules) {
    for (const fc of m.flashcards) {
      add(fc.front, fc.back, fc.relatedConcept, fc.difficulty);
    }
  }

  if (modules.length >= 2) {
    add(
      `How does ${modules[0].title} directly support the problem-solving requirements of ${modules[1].title}?`,
      `Stage 1 establishes the definitions and invariants that Stage 2 manipulates during applied procedures.`,
      "Cross-Module Integration",
      "Advanced"
    );
  }

  return cards;
}

/**
 * Generates complete-course study materials covering all resources and all modules.
 */
export async function generateCourseStudyMaterials(
  workspace: Workspace,
  modules: LearningModule[],
  callGemini?: GeminiCaller,
  customApiKey?: string
): Promise<CourseStudyMaterials> {
  const subject = workspace.subject;
  const goal = workspace.learningGoal;
  const resourceTitles = workspace.resources.map(r => r.title);

  const toc: string[] = [
    "Course Overview & Curriculum Trajectory",
    ...modules.map(m => `Stage ${m.moduleNumber}: ${m.title} — ${m.purpose.slice(0, 60)}`),
    "Cross-Module Synthesis, Boundary Invariants & Final Conclusion"
  ];

  const sections = [
    {
      heading: `Course Curriculum Overview: System Architecture in ${subject}`,
      subheading: `Systematic Analytical Framework for "${goal}"`,
      content: `This course textbook provides an exhaustive, authoritative, source-grounded curriculum designed to guide the learner from foundational axioms to advanced synthesis in ${subject}.\n\nThe complete curriculum is structured across ${modules.length} progressive learning stages. Each stage establishes prerequisite mental models, derives governing equations and causal mechanisms, validates limits through boundary and asymptotic tests, and bridges theoretical formulation with real-world problem solving.`,
      keyPrinciples: [
        `First Principles Invariance: Isolate elementary physical or mathematical laws before applying formulas.`,
        `Causal Directionality: Distinguish underlying mechanistic drivers from surface statistical correlations.`,
        `Boundary Envelope Verification: Every operational model fails when pushed past its assumptions.`
      ],
      callout: `Target Achievement: ${workspace.learningIntent?.targetAchievement || goal}`
    },
    ...modules.map(m => ({
      heading: `Stage ${m.moduleNumber}: ${m.title}`,
      subheading: m.purpose,
      content: m.comprehensiveNotes,
      visualExplanation: m.topics[0]?.visualExplanation,
      keyPrinciples: m.quickNotes.keyPrinciples,
      callout: `Stage ${m.moduleNumber} Essential Rule: ${m.quickNotes.essentialFormulasOrRules[0] || m.quickNotes.finalTakeaway}`,
      examples: m.topics[0]?.workedExamples?.map(we => ({
        title: we.title,
        scenario: we.problem,
        solution: we.stepByStepSolution.join("; ")
      }))
    })),
    {
      heading: `Cross-Module Synthesis & Unified Boundary Invariants`,
      subheading: `Holistic Integration of Stages 1 through ${modules.length}`,
      content: `System mastery requires connecting individual module stages into a unified mental model. The concepts derived in the foundational stages govern the operational parameters of intermediate problem-solving and advanced synthesis.\n\nWhen diagnosing complex, real-world problems or solving high-stakes examination questions, always traverse the conceptual hierarchy from first principles down to specific algorithms, continually validating dimensional consistency and boundary invariants.`,
      keyPrinciples: [
        "Unify individual stage mechanisms into a coherent causal workflow.",
        "Perform order-of-magnitude and asymptotic checks before finalizing any analytical conclusion.",
        "Maintain active retrieval practice across the entire curriculum to ensure permanent retention."
      ],
      callout: `Overarching Principle: System-level robustness is achieved when every sub-component satisfies its governing boundary constraints.`
    }
  ];

  const allDefs: { term: string; definition: string; moduleContext?: string }[] = [];
  const allAxioms: string[] = [];
  const allDistinctions: { conceptA: string; conceptB: string; keyDifference: string }[] = [];
  const allRevisionBullets: string[] = [];

  modules.forEach(m => {
    m.quickNotes.coreDefinitions.forEach(d => {
      if (!allDefs.some(x => x.term.toLowerCase() === d.term.toLowerCase())) {
        allDefs.push({ term: d.term, definition: d.definition, moduleContext: `Module ${m.moduleNumber}` });
      }
    });
    m.quickNotes.essentialFormulasOrRules.forEach(r => {
      if (!allAxioms.includes(r)) allAxioms.push(r);
    });
    m.quickNotes.importantDistinctions.forEach(dist => {
      const parts = dist.split(":");
      allDistinctions.push({
        conceptA: parts[0] ? parts[0].slice(0, 30) : `Stage ${m.moduleNumber} Rule`,
        conceptB: parts[1] ? parts[1].slice(0, 30) : `Standard Pitfall`,
        keyDifference: dist
      });
    });
    m.stageSummary.quickRevisionBullets.forEach(b => {
      if (!allRevisionBullets.includes(b)) allRevisionBullets.push(b);
    });
  });

  const slides = [
    {
      slideNumber: 1,
      title: `${workspace.title}: Curriculum Trajectory`,
      category: "Course Architecture",
      bullets: [
        `Systematic progression across ${modules.length} targeted learning stages`,
        `Subject domain: ${subject}`,
        `Oriented towards mastery of: ${goal.slice(0, 65)}`,
        `Grounded in verified source resources and rigorous analytical frameworks`
      ],
      keyTakeaway: "A complete end-to-end curriculum built for active mastery."
    },
    ...modules.map((m, idx) => ({
      slideNumber: idx + 2,
      title: `Stage ${m.moduleNumber}: ${m.title}`,
      category: m.stageName || `Stage ${m.moduleNumber}`,
      bullets: [
        `Purpose: ${m.purpose}`,
        `Topics Covered: ${m.topicsCovered.slice(0, 3).join(", ")}`,
        `Governing Law: ${m.quickNotes.keyPrinciples[0] || m.quickNotes.essentialFormulasOrRules[0] || "Foundational Invariant"}`,
        `Common Trap: ${m.quickNotes.importantDistinctions[0] || "Exceeding boundary limits without validation"}`
      ],
      keyTakeaway: m.quickNotes.finalTakeaway
    })),
    {
      slideNumber: modules.length + 2,
      title: "Course Synthesis & Mastery Checkpoint",
      category: "Synthesis",
      bullets: [
        "All stages successfully synthesized into an integrated mental model",
        "Active retrieval flashcards ready for distributed practice",
        "Practice problem worksheets covering foundational to advanced synthesis",
        "Diagnostic error detection routines established for all boundary traps"
      ],
      keyTakeaway: "Fluency achieved through first principles and active recall."
    }
  ];

  const exercises: CourseStudyMaterials["practiceSet"]["exercises"] = modules.flatMap((m, idx) => [
    {
      id: `ex_${workspace.id}_${idx + 1}_foundational`,
      exerciseNumber: (idx * 2) + 1,
      title: `${m.title}: Foundational Invariant Problem`,
      scenario: `A baseline operational condition is presented in ${m.title} with known boundary variables.`,
      problemStatement: `Deconstruct the scenario using first principles: identify the primary invariant, list the governing equations, and solve for the equilibrium state.`,
      deliverable: "A step-by-step mathematical or logical proof with boundary validation.",
      hint: `Reference: ${m.quickNotes.essentialFormulasOrRules[0] || "Foundational Invariant"}`,
      solutionWalkthrough: `1. Define system parameters.\n2. Apply the invariant equation.\n3. Verify units and limits (parameter -> 0 and infinity).\n4. Confirm equilibrium.`,
      difficulty: "Foundational" as const
    },
    {
      id: `ex_${workspace.id}_${idx + 1}_applied`,
      exerciseNumber: (idx * 2) + 2,
      title: `${m.title}: Edge-Case & Perturbation Challenge`,
      scenario: `The system encounters an unexpected external perturbation or non-standard constraint that challenges idealized assumptions.`,
      problemStatement: `Determine whether the system operates within its safe boundary envelope or enters a failure mode. Propose the corrective parameter adjustment.`,
      deliverable: "Diagnostic report explaining the mechanism of breakdown and the exact parameter fix.",
      hint: `Look for non-linear effects and examine: ${m.quickNotes.importantDistinctions[0] || "Boundary breakdown"}`,
      solutionWalkthrough: `1. Calculate the critical threshold.\n2. Demonstrate that the perturbation exceeds linear assumptions.\n3. Show how applying damping or adjusting constraints restores system stability.`,
      difficulty: "Applied" as const
    }
  ]);

  exercises.push({
    id: `ex_${workspace.id}_capstone`,
    exerciseNumber: exercises.length + 1,
    title: `Capstone Comprehensive Synthesis: System Design in ${subject}`,
    scenario: `A multi-stage real-world project requires combining the core mechanisms of Modules 1 through ${modules.length} into a unified operational deployment.`,
    problemStatement: `Synthesize an end-to-end design addressing requirements from all stages, identifying potential inter-module friction points and verifying system stability.`,
    deliverable: "Complete end-to-end architecture specification and validation test suite.",
    hint: "Cross-reference the Stage Summaries and ensure no conflicting assumptions between modules.",
    solutionWalkthrough: `1. Integrate foundational invariants.\n2. Cascade stage-by-stage outputs.\n3. Formulate the composite verification test.\n4. Document final robustness margins.`,
    difficulty: "Advanced Synthesis" as const
  });

  const courseFlashcards = generateDynamicFlashcardsForCourse(workspace, modules);
  const interactiveMindMap = buildCourseMindMapGraph(workspace, modules);

  return {
    detailedNotes: {
      title: `${workspace.title}: Comprehensive Course Notes`,
      overview: `A complete, textbook-grade analytical study guide covering the entire curriculum for ${workspace.title}. Grounded in verified source resources, this guide provides foundational definitions, governing laws, worked mathematical proofs, diagrams, and cross-stage synthesis.`,
      tableOfContents: toc,
      sections,
      synthesisAndConclusion: `In conclusion, systematic mastery of ${subject} requires fluent mental models that withstand rigorous edge-case testing. By utilizing active recall across this complete curriculum, you build lasting domain agility and problem-solving competence.`,
      sourceReferences: resourceTitles.length ? resourceTitles : ["Authoritative Domain Curriculum"]
    },
    shortNotes: {
      title: `${workspace.title}: Complete Course Revision Sheet`,
      courseScope: `Exhaustive high-yield summary of all ${modules.length} learning modules, consolidating definitions, invariants, critical distinctions, and rapid review checklists.`,
      coreTaxonomyAndDefinitions: allDefs,
      governingAxiomsAndFormulas: allAxioms,
      criticalDistinctions: allDistinctions,
      highYieldRevisionBullets: allRevisionBullets,
      overarchingTakeaway: `True mastery in ${subject} is the ability to reconstruct solutions from first principles under novel boundary constraints without hesitating or relying on rote memory.`
    },
    slideDeck: {
      title: workspace.title,
      subtitle: `Complete Course Slide Deck • ${subject}`,
      courseSubject: subject,
      slides
    },
    practiceSet: {
      title: `${workspace.title}: Course Practice & Worksheet Set`,
      exercises
    },
    courseFlashcards,
    interactiveMindMap
  };
}

/**
 * Creates high-yield default/fallback modules tailored to user's goal & subject
 * to guarantee that every module has comprehensive notes, multiple flashcards,
 * multiple quizzes, full mind map, and rich quick notes.
 */
export function buildTailoredFallbackModules(
  goal: string,
  subject: string,
  learningIntent?: LearningIntent,
  resources: Resource[] = []
): LearningModule[] {
  const depth = learningIntent?.depth || "understanding";
  const achievement = learningIntent?.targetAchievement || `Master concepts in ${subject}`;
  const specific = learningIntent?.specificIntent || learningIntent?.intentFromResources || goal;

  const resourceTitles = resources.map(r => r.title);
  const baseId = "mod_" + Date.now();

  const moduleBlueprints = [
    {
      num: 1,
      stageName: "Stage 1: Foundations & Governing Axioms",
      title: `Foundations & Governing Principles of ${subject}`,
      purpose: `Establish intuitive mental models, essential terminology, governing axioms, and foundational relationships needed to master ${goal}.`,
      topics: [
        {
          num: 1,
          title: `Fundamental Concepts & Terminology of ${subject}`,
          overview: `Core terminology, foundational taxonomy, and the mental models required to navigate ${subject}.`,
          definitions: [
            { term: "Foundational Invariant", definition: "An unchanging property or condition that remains conserved across all transformations." },
            { term: "Primary Parameter", definition: "The fundamental variable or input whose variation dictates system response." },
            { term: "Boundary Condition", definition: "The physical, logical, or mathematical constraint delineating the valid domain of operation." }
          ],
          principles: [
            "First Principles Primacy: Every complex phenomenon can be decomposed into foundational axioms.",
            "Conservation & Continuity: Changes within a system must account for input, storage, and dissipation channels."
          ]
        },
        {
          num: 2,
          title: `Governing Rules, Laws & Conceptual Relationships`,
          overview: `The primary laws, equations, and causal links governing behavior within ${subject}.`,
          definitions: [
            { term: "Operational Transfer", definition: "The rule or equation mapping an input stimulus to an observable output state." },
            { term: "State Equilibrium", definition: "The balance state reached when competing forces, rates, or influences equalize." }
          ],
          principles: [
            "Causality Rule: Isolate independent drivers from reactive dependent symptoms.",
            "Threshold Response: Systems often remain stable until a critical threshold parameter is breached."
          ]
        }
      ],
      objectives: [
        `Define all key foundational terms related to ${goal}`,
        "Differentiate basic principles from advanced special cases",
        "Explain the conceptual baseline without consulting notes",
        "Predict system behavior using governing first principles"
      ],
      prereqs: ["General curiosity and analytical reasoning"],
      effort: "45-60 mins"
    },
    {
      num: 2,
      stageName: "Stage 2: Core Mechanics & Analytical Procedures",
      title: `Core Mechanics, Problem-Solving & Analysis`,
      purpose: `Break down the inner mechanisms, workflows, analytical derivations, and logical connections to build genuine problem-solving capability.`,
      topics: [
        {
          num: 1,
          title: `Step-by-Step Analytical Frameworks & Methods`,
          overview: `Standardized problem-solving workflows, derivations, and execution methods in ${subject}.`,
          definitions: [
            { term: "Analytical Decomposition", definition: "The process of breaking down an ambiguous problem into solvable sub-components." },
            { term: "Verification Metric", definition: "A quantifiable check used to confirm that a solution satisfies governing constraints." }
          ],
          principles: [
            "Consistent Coordinate / Reference Frame: Establish sign conventions and baseline units before calculating.",
            "Sanity Checks: Validate dimensional consistency and limiting-case asymptotic behavior."
          ]
        },
        {
          num: 2,
          title: `Inter-concept Dependencies & Edge-Case Traps`,
          overview: `Common traps, misconceptions, and subtle failure modes encountered in complex problems.`,
          definitions: [
            { term: "Coupled State", definition: "A scenario where two or more parameters influence each other simultaneously." },
            { term: "Singularity / Edge Case", definition: "An extreme condition where standard assumptions break down." }
          ],
          principles: [
            "Correlation ≠ Causation: Two variables moving together does not imply direct mechanistic linkage.",
            "Assumptions Verification: Always state assumptions explicitly prior to applying formulas or rules."
          ]
        }
      ],
      objectives: [
        `Execute standard problem-solving methodologies for ${subject}`,
        "Predict outcomes when system parameters or variables change",
        "Diagnose common mistakes and misconception traps",
        "Synthesize multi-step analytical derivations accurately"
      ],
      prereqs: [`Foundations & Governing Principles of ${subject}`],
      effort: "60-75 mins"
    },
    {
      num: 3,
      stageName: "Stage 3: Applied Synthesis & Practical Mastery",
      title: `Applied Synthesis, Real-World Scenarios & Assessment`,
      purpose: `Apply knowledge to real-world scenarios, complex challenges, exam problems, and projects aligned with: "${achievement}".`,
      topics: [
        {
          num: 1,
          title: `Real-World Case Studies & Applied Problem Solving`,
          overview: `Comprehensive scenario-based problem solving and practical implementation in ${subject}.`,
          definitions: [
            { term: "Real-World Heuristic", definition: "A practical rule of thumb balancing optimal precision against computational or operational cost." },
            { term: "System Robustness", definition: "The ability of an applied solution to remain functional despite real-world perturbations and noise." }
          ],
          principles: [
            "Graceful Degradation: Well-designed systems degrade predictively rather than experiencing catastrophic failure.",
            "Iterative Refinement: Successive approximations converge rapidly when grounded in true physical or logical invariants."
          ]
        },
        {
          num: 2,
          title: `Synthesis, Trade-off Evaluation & Exam Readiness`,
          overview: `Evaluating trade-offs, synthesis across sub-domains, and final comprehensive verification.`,
          definitions: [
            { term: "Trade-off Frontier", definition: "The locus of points where optimizing one metric necessitates conceding another." },
            { term: "Mastery Criterion", definition: "The threshold of fluency where retrieval is instantaneous and synthesis is effortless." }
          ],
          principles: [
            "Holistic Optimization: Local sub-optimization can impair overall system performance.",
            "Deliberate Retrieval: Testing knowledge under timed or novel conditions cements long-term memory traces."
          ]
        }
      ],
      objectives: [
        `Solve exam-level and industry-standard problems in ${subject}`,
        `Synthesize deliverables supporting target: "${achievement}"`,
        "Formulate independent evaluations and trade-off decisions",
        "Demonstrate complete mastery across all curriculum milestones"
      ],
      prereqs: ["Core Mechanics, Problem-Solving & Analysis"],
      effort: "75-90 mins"
    }
  ];

  return moduleBlueprints.map((bp, idx) => {
    const modId = `${baseId}_${bp.num}`;

    // Build hierarchical topics
    const topics: ModuleTopic[] = bp.topics.map((t) => {
      const topicId = `${modId}_top_${t.num}`;
      const detailedNotes = `# ${t.title}

## 1. Introduction & Context
Understanding **${t.title}** is an essential stepping stone toward your goal: *"${goal}"*. In this section, we move beyond superficial memorization into first-principles intuition. Whether you are preparing for academic examinations, engineering challenges, or professional application, this guide provides the foundational mechanics, derivations, and practical examples necessary for true mastery.

${specific ? `> **Learning Directive**: Integrating focus on *${specific}* throughout our explanations and problem-solving examples.` : ""}

---

## 2. Learning Objectives
By the end of this study document, you will be able to:
- Clearly define and contextualize all core terminology and operational invariants.
- Explain the governing mechanisms and causal pathways from first principles.
- Apply step-by-step problem-solving methods to both standard and boundary-case scenarios.
- Identify and avoid subtle pitfalls, traps, and common misconceptions.
- Self-check your understanding with worked questions and rapid review points.

---

## 3. Core Terminology & Fundamental Definitions
Precise language is the foundation of clear reasoning in ${subject}. Familiarize yourself with these foundational constructs:

${t.definitions.map(d => `### **${d.term}**
- **Formal Definition**: ${d.definition}
- **Intuitive Explanation**: Think of this as the reference boundary against which all subsequent behaviors and derivations are measured. If this parameter shifts, all downstream relationships must be recalibrated.`).join("\n\n")}

---

## 4. In-Depth Mechanics & Explanations
When analyzing any problem or scenario in ${subject}, consider the following operational trajectory:

1. **Baseline State & Invariants**:
   Every stable system operates under baseline conservation rules. Before calculating or making inferences, identify what remains constant (e.g., energy, mass, logical truth, syntax invariants).
2. **Dynamic Perturbation & Response**:
   When an external factor or parameter changes, the system responds according to governing laws. Isolate the independent driver from secondary, dependent effects.
3. **Causal Progression Pipeline**:
   - *Phase 1 (Input / Pre-condition)*: Establish initial parameters and check that boundary constraints are satisfied.
   - *Phase 2 (Transformation / Execution)*: Apply the primary analytical rules or formulas.
   - *Phase 3 (Post-condition / Verification)*: Verify that the result satisfies physical, logical, or numerical sanity checks.

---

## 5. Principles, Laws & Governing Rules
${t.principles.map((p, pIdx) => `#### Rule ${pIdx + 1}: ${p}`).join("\n")}

---

## 6. Worked Example & Step-by-Step Breakdown
To understand how to apply these ideas in practice, let us examine a concrete scenario.

### **Problem Statement**:
Consider a typical problem where you are asked to evaluate system behavior or predict outcomes for **${t.title}** under constrained conditions.

### **Step-by-Step Method**:
1. **Identify Given Data & Required Outcome**:
   - *Given*: Initial state parameters and operating constraints.
   - *Goal*: Determine the final state or verify equilibrium.
2. **Select Governing Relationship**:
   - Choose the fundamental formula, law, or rule that connects the given inputs to the desired output without introducing unverified assumptions.
3. **Algebraic / Conceptual Substitution**:
   - Substitute known values into the governing relationship, keeping units and reference directions consistent.
4. **Validation Check**:
   - Check the extreme limits: If the input tends to zero or infinity, does the equation yield physically or logically plausible behavior?

> **Common Trap**: Students often plug numbers into equations before verifying whether the boundary conditions allow that specific formula to be applied. Always verify assumptions first!

---

## 7. Comparative Analysis & Key Distinctions
| Aspect | Nominal / Standard Operation | Extreme / Boundary Case |
| :--- | :--- | :--- |
| **System Predictability** | High; linear or standard behavior | Non-linear; edge-case effects emerge |
| **Governing Assumptions** | Standard simplifications hold | Simplifications fail; return to first principles |
| **Common Student Error** | Formula misapplication | Overlooking hidden constraints |

---

## 8. Common Misconceptions & Pitfalls
- **Misconception**: Assuming that memorizing the final formula is sufficient.
  *Reality*: Assessment questions and real-world tasks alter initial conditions, breaking memorized shortcuts. Deriving relationships from first principles protects against this trap.
- **Misconception**: Confusing symptoms with root causes.
  *Reality*: Always trace back to the independent variable driving the perturbation.

---

## 9. Key Takeaways & Quick Revision
- **Governing Anchor**: Always ground your analysis in first principles and confirmed invariants.
- **Verification Rule**: Never accept a solution without a sanity check on units, signs, and asymptotic limits.
- **Fluency Metric**: If you can explain the core mechanism out loud in under 2 minutes without referencing notes, you have achieved conceptual mastery.

---

## 10. Self-Check Practice Questions
1. **Conceptual Challenge**: How would the system behavior change if the primary parameter doubled while boundary conditions remained fixed?
2. **Diagnostic Trap**: Under what circumstances does the standard governing rule fail, and what first principle must you return to?`;

      return {
        id: topicId,
        topicNumber: t.num,
        title: t.title,
        overview: t.overview,
        detailedNotes,
        learningObjectives: [
          `Master core definitions for ${t.title}`,
          "Explain the causal mechanism from first principles",
          "Solve typical and edge-case problems step-by-step"
        ],
        coreDefinitions: t.definitions,
        principlesOrLaws: t.principles,
        workedExamples: [
          {
            title: `Step-by-Step Analysis of ${t.title}`,
            problem: `Apply the governing principles of ${t.title} to determine the system response when input parameters are modified by 50%.`,
            stepByStepSolution: [
              "Step 1: Write down the primary governing equation or logical relationship.",
              "Step 2: Isolate the dependent output variable on one side of the relation.",
              "Step 3: Substitute the altered parameter value into the relation.",
              "Step 4: Compute the resulting ratio and verify dimensional consistency."
            ],
            commonTraps: "Forgetting to square or invert non-linear parameters."
          }
        ],
        visualExplanation: {
          type: "diagram",
          title: `${t.title} Concept & Process Architecture`,
          caption: "Logical flow from initial state through governing invariants to final output",
          content: `+-------------------------------------------------------------+
|               ${t.title.toUpperCase().slice(0, 40)}               |
+-------------------------------------------------------------+
                              |
                              v
    [ Input State / Parameters ] ---> [ Boundary Checks ]
                              |
                              v
    [ Governing Invariant / Law ] <--- (Axioms & Constraints)
                              |
                              v
    [ Mechanism / Transformation ]
                              |
                              v
    [ Validated Solution / State ] <--- (Sanity & Unit Checks)`
        },
        quickRevision: [
          `Key principle: ${t.principles[0]}`,
          `Essential anchor: ${t.definitions[0]?.term} (${t.definitions[0]?.definition})`,
          "Always test boundary conditions before finalizing any calculation."
        ],
        practiceQuestions: [
          {
            question: `In ${t.title}, what is the role of the ${t.definitions[0]?.term}?`,
            type: "conceptual",
            answer: t.definitions[0]?.definition || "Governs baseline behavior",
            explanation: "It serves as the invariant anchor from which all dynamic calculations propagate."
          }
        ]
      };
    });

    // Comprehensive Module Chapter Synthesis
    const comprehensiveNotes = `# ${bp.title}
*${bp.stageName} • Target Goal: "${goal}"*

---

## Executive Curriculum Overview
This study module covers **${bp.title}**, representing **${bp.stageName}** of your structured learning path. 
Our pedagogical design adheres strictly to academic textbook standards:
- **Depth**: Designed for *${depth}* retention and practical fluency.
- **Target Achievement**: *"${achievement}"*.
- **Topics Included**:
${topics.map(tp => `  - **Topic ${tp.topicNumber}**: ${tp.title}`).join("\n")}

---

${topics.map(tp => `## Topic ${tp.topicNumber}: ${tp.title}

### 1. Conceptual Foundation
${tp.overview}

### 2. Core Terminology & Glossary
${(tp.coreDefinitions || []).map((d: { term: string; definition: string }) => `- **${d.term}**: ${d.definition}`).join("\n")}

### 3. Governing Principles & Laws
${(tp.principlesOrLaws || []).map((p: string) => `> ✦ **${p}**`).join("\n\n")}

### 4. Step-by-Step Analytical Execution
${tp.workedExamples?.[0] ? `
**Worked Problem**: ${tp.workedExamples[0].problem}

${tp.workedExamples[0].stepByStepSolution.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}

*Common Trap*: ${tp.workedExamples[0].commonTraps || "Overlooking boundary conditions."}
` : "Apply the foundational invariants to verify the system output."}

### 5. Concept Architecture
\`\`\`
${tp.visualExplanation?.content || "Input -> Transform -> Output"}
\`\`\`
`).join("\n---\n\n")}

---

## Module Synthesis & Integration
Connecting the topics of this module creates a unified mental framework:
1. **Continuity**: The terms and invariants established in Topic 1 provide the mathematical and conceptual language used to execute analysis in Topic 2.
2. **Causal Reasoning**: Rather than treating these topics as separate silos, treat them as phases of an integrated problem-solving pipeline.
3. **Assessment Readiness**: Review the quick revision checklist, practice the active recall flashcards, and complete the module quiz before advancing to subsequent stages.`;

    // Quick Notes (Revision Sheet)
    const quickNotes: QuickNotes = {
      coreDefinitions: [
        { term: bp.topics[0]?.definitions?.[0]?.term || "Foundational Invariant", definition: bp.topics[0]?.definitions?.[0]?.definition || "Core constant that remains unchanged." },
        { term: bp.topics[0]?.definitions?.[1]?.term || "Primary Parameter", definition: bp.topics[0]?.definitions?.[1]?.definition || "The main independent variable." },
        { term: bp.topics[1]?.definitions?.[0]?.term || "Operational Transfer", definition: bp.topics[1]?.definitions?.[0]?.definition || "The mapping between inputs and outputs." },
        { term: "Boundary Condition", definition: "The threshold beyond which standard linear assumptions fail." }
      ],
      essentialFormulasOrRules: [
        "First Principles Primacy: Deconstruct complex questions into elementary axioms.",
        "Dimensional Consistency: Check that units and scales match across equations.",
        "Sanity Verification: Evaluate limiting-case behavior when parameters approach zero or infinity."
      ],
      keyPrinciples: [
        `Governing baseline for ${subject}: Maintain consistency with verified invariants.`,
        "Causality isolation: Separate true driving variables from correlated symptoms.",
        "System stability: Verify parameters remain within stable operating envelopes."
      ],
      importantDistinctions: [
        "Theoretical Formulation vs. Real-World Implementation: Ideal models exclude noise; practical work accounts for perturbations.",
        "Necessity vs. Sufficiency: A required condition does not guarantee the final outcome by itself."
      ],
      criticalFacts: [
        `Module ${bp.num} establishes the conceptual bedrock for "${achievement}".`,
        "Active retrieval practice produces 2-3x longer retention compared to passive rereading."
      ],
      finalTakeaway: `True mastery in ${subject} comes from understanding the causal mechanics behind each relationship, enabling you to solve unfamiliar problems on demand.`
    };

    // UNLIMITED DYNAMIC FLASHCARDS: Identified dynamically across all topics, definitions, worked examples, and formulas
    const flashcards: ModuleFlashcard[] = generateDynamicFlashcardsForModule(
      modId,
      bp.title,
      topics,
      quickNotes,
      subject,
      goal,
      resourceTitles[0] || "Foundational Reference Material"
    );

    // VARIED QUIZZES: Multiple Choice, True/False, Conceptual, Scenario, Application
    const quizzes: QuizQuestion[] = [
      {
        id: `${modId}_qz_1`,
        type: "multiple_choice",
        question: `What is the primary purpose of establishing foundational invariants in ${subject}?`,
        options: [
          "To serve as constant reference anchors that remain true across all problem transformations",
          "To make calculations appear more complex and academic",
          "To replace the need for experimental verification entirely",
          "To restrict problem solving only to trivial situations"
        ],
        correctAnswer: "To serve as constant reference anchors that remain true across all problem transformations",
        explanation: "Foundational invariants provide the unshakeable bedrock of truth; any calculation that violates an invariant is immediately flagged as invalid.",
        difficulty: "Beginner",
        conceptTested: "Foundational Invariants"
      },
      {
        id: `${modId}_qz_2`,
        type: "true_false",
        question: `True or False: In ${subject}, observing that two variables correlate over time proves that one variable is the mechanistic cause of the other.`,
        options: ["True", "False"],
        correctAnswer: "False",
        explanation: "Correlation does not imply causation. A third lurking variable or common external driver could be perturbing both simultaneously.",
        difficulty: "Beginner",
        conceptTested: "Causality vs Correlation"
      },
      {
        id: `${modId}_qz_3`,
        type: "conceptual",
        question: `When testing the validity of a mathematical or logical model in ${subject}, what does evaluating limiting cases (e.g., parameter -> 0 or -> infinity) achieve?`,
        options: [
          "It reveals whether the equation behaves in accordance with intuitive physical or logical boundaries",
          "It guarantees that arithmetic errors are automatically corrected",
          "It eliminates the need to measure initial conditions",
          "It transforms non-linear equations into linear ones permanently"
        ],
        correctAnswer: "It reveals whether the equation behaves in accordance with intuitive physical or logical boundaries",
        explanation: "Asymptotic analysis verifies that equations do not generate nonsensical infinities or zero-divisions under extreme boundary scenarios.",
        difficulty: "Intermediate",
        conceptTested: "Asymptotic Sanity Checking"
      },
      {
        id: `${modId}_qz_4`,
        type: "scenario",
        question: `Scenario: You are solving a problem in ${bp.title} and your calculated answer has the wrong units or magnitude by a factor of 1000. What is the recommended first diagnostic step?`,
        options: [
          "Re-verify the initial parameter units and baseline coordinate/sign conventions before re-running algebra",
          "Assume the question has a typographical error and proceed anyway",
          "Multiply your final answer by 1000 to match expectations without checking reasons",
          "Abandon the foundational principles and guess an answer"
        ],
        correctAnswer: "Re-verify the initial parameter units and baseline coordinate/sign conventions before re-running algebra",
        explanation: "Unit mismatches and orders-of-magnitude errors almost always stem from unharmonized input scales or sign conventions at the setup phase.",
        difficulty: "Intermediate",
        conceptTested: "Systematic Error Diagnosis"
      },
      {
        id: `${modId}_qz_5`,
        type: "multiple_choice",
        question: `Which learning practice is proven by cognitive science to create the strongest long-term retention for ${subject}?`,
        options: [
          "Active retrieval practice through flashcards and self-check quiz challenges",
          "Passively rereading textbook chapters multiple times with highlighters",
          "Cramming all study material the night before an assessment",
          "Only reviewing answers without attempting to reconstruct them first"
        ],
        correctAnswer: "Active retrieval practice through flashcards and self-check quiz challenges",
        explanation: "Active retrieval forces neural reconstruction of memory pathways, cementing long-term synaptic connections and preventing decay.",
        difficulty: "Beginner",
        conceptTested: "Cognitive Retrieval Science"
      },
      {
        id: `${modId}_qz_6`,
        type: "conceptual",
        question: `Under what circumstance do standard idealized models in ${subject} typically break down?`,
        options: [
          "When system parameters reach boundary thresholds where non-linear perturbations dominate",
          "Whenever the problem is tested on an exam",
          "Only when operating under room temperature",
          "Never; idealized models are universally valid across all scales"
        ],
        correctAnswer: "When system parameters reach boundary thresholds where non-linear perturbations dominate",
        explanation: "Every model relies on simplifications (e.g., frictionlessness, linearity); when pushed to extreme limits, these simplifications fail.",
        difficulty: "Advanced",
        conceptTested: "Model Operating Envelopes"
      }
    ];

    // Proper visual Mind Map (Hierarchical nodes & edges)
    const mindMap: ModuleMindMap = {
      title: `${bp.title} Conceptual Map`,
      centralTopic: bp.title,
      nodes: [
        { id: `${modId}_root`, label: bp.title, category: "central", description: bp.purpose },
        { id: `${modId}_n1`, label: "Core Principles", parentId: `${modId}_root`, category: "major", description: "Invariants and primary axioms" },
        { id: `${modId}_n2`, label: "Mechanisms & Logic", parentId: `${modId}_root`, category: "major", description: "Operational rules and processes" },
        { id: `${modId}_n3`, label: "Applications & Practice", parentId: `${modId}_root`, category: "major", description: "Real-world scenarios and exam problems" },
        { id: `${modId}_n1_sub1`, label: bp.topics[0]?.title || "Definitions", parentId: `${modId}_n1`, category: "sub" },
        { id: `${modId}_n1_sub2`, label: bp.topics[1]?.title || "Axioms", parentId: `${modId}_n1`, category: "sub" },
        { id: `${modId}_n2_sub1`, label: "Step-by-Step Trajectory", parentId: `${modId}_n2`, category: "sub" },
        { id: `${modId}_n2_sub2`, label: "Boundary Traps", parentId: `${modId}_n2`, category: "sub" },
        { id: `${modId}_n3_sub1`, label: `Goal: ${achievement.slice(0, 24)}`, parentId: `${modId}_n3`, category: "detail" }
      ],
      edges: [
        { from: `${modId}_root`, to: `${modId}_n1`, relation: "anchors" },
        { from: `${modId}_root`, to: `${modId}_n2`, relation: "governs" },
        { from: `${modId}_root`, to: `${modId}_n3`, relation: "enables" },
        { from: `${modId}_n1`, to: `${modId}_n1_sub1`, relation: "defines" },
        { from: `${modId}_n1`, to: `${modId}_n1_sub2`, relation: "establishes" },
        { from: `${modId}_n2`, to: `${modId}_n2_sub1`, relation: "sequences" },
        { from: `${modId}_n2`, to: `${modId}_n2_sub2`, relation: "constrains" },
        { from: `${modId}_n3`, to: `${modId}_n3_sub1`, relation: "realizes" }
      ]
    };

    // Practice Tasks
    const practiceTasks: PracticeTask[] = [
      {
        id: `${modId}_task_1`,
        title: `Explain ${bp.topics[0]?.title} from memory`,
        instruction: `Write a concise 4-sentence explanation of ${bp.topics[0]?.title} without consulting notes, explicitly stating the governing invariant and one edge-case trap.`,
        scenario: `Imagine explaining the concept to a junior peer who is confused by terminology.`,
        expectedOutcome: "A clear, intuitive summary free of circular definitions.",
        hint: "Start with what remains constant, then explain how changes propagate.",
        solutionWalkthrough: "Define the invariant first, outline the perturbation mechanism, and show the boundary test.",
        done: false
      },
      {
        id: `${modId}_task_2`,
        title: `Conduct an Error Diagnosis on a Common Trap`,
        instruction: `Identify a common pitfall students encounter in ${bp.title} and write down the rigorous first-principles correction.`,
        scenario: `An exam problem presents a tricky distractor where units or limiting assumptions do not match.`,
        expectedOutcome: "A bulleted checklist to catch this specific trap during tests.",
        hint: "Review section 8 of the detailed notes on common misconceptions.",
        solutionWalkthrough: "Verify sign conventions, dimension units, and ensure boundary limits hold.",
        done: false
      },
      {
        id: `${modId}_task_3`,
        title: `Complete Flashcards & Achieve ≥80% on Module Quiz`,
        instruction: `Run through all ${flashcards.length} flashcards using active retrieval, then complete the quiz to verify conceptual fluency.`,
        scenario: `Final mastery validation before progressing to the next stage of the curriculum.`,
        expectedOutcome: "Score of 80% or higher with zero unreviewed incorrect answers.",
        hint: "Retake any missed quiz questions and read the detailed explanation.",
        solutionWalkthrough: "Review the quick revision sheet for any formula or definition you hesitated on.",
        done: false
      }
    ];

    // Stage Summary (Comprehensive end-of-stage synthesis)
    const stageSummary: StageSummary = {
      whatWasLearned: [
        `Foundational mental models, vocabulary, and axioms for ${bp.title}`,
        "First-principles causal logic versus superficial formula memorization",
        "Key operational constraints, boundary conditions, and diagnostic workflows"
      ],
      mostImportantConcepts: [
        bp.topics[0]?.title || "Core Invariants",
        bp.topics[1]?.title || "Process Mechanics",
        "Asymptotic Sanity Verification & Error Traps"
      ],
      importantRelationships: [
        "System response is proportional to independent parameter stimulus within valid boundaries.",
        "Violating boundary constraints triggers non-linear failures."
      ],
      importantFormulasOrDefinitions: [
        "Foundational Invariant: Conservation of key properties across transformations.",
        "Asymptotic Test: Testing limits at 0 and infinity to confirm equation validity."
      ],
      commonMistakes: [
        "Plugging numbers into equations before validating boundary conditions.",
        "Confusing correlation with causation in system diagnosis."
      ],
      quickRevisionBullets: [
        `Review the ${topics.length} topic study documents in this module.`,
        `Practice all ${flashcards.length} flashcards until instantaneous recall is achieved.`,
        `Complete all ${quizzes.length} quiz questions with full understanding of explanations.`
      ],
      selfCheckQuestions: [
        "Can you explain the primary mechanism of this module out loud in under 2 minutes without referencing notes?",
        "Do you know the exact failure mode that occurs when boundary conditions are exceeded?",
        "Are you able to diagnose an order-of-magnitude error systematically?"
      ],
      readinessIndicator: {
        ready: idx === 0,
        message: idx < 2 ? `You have built the essential foundation. Advance to Module ${bp.num + 1} to deepen analytical mastery.` : "You have completed the full curriculum stages! Proceed to comprehensive synthesis.",
        recommendedScore: "≥80% on Module Quiz"
      }
    };

    // Legacy module summary
    const summary: ModuleSummary = {
      whatWasLearned: stageSummary.whatWasLearned,
      mostImportantConcepts: stageSummary.mostImportantConcepts,
      connectionsBetweenConcepts: `The core invariants established in this module directly govern the operational behavior of analytical procedures in subsequent stages.`,
      competenciesGained: [
        `Fluency in defining and applying core concepts in ${subject}`,
        `Confidence in identifying boundary errors and logical pitfalls`,
        `Preparedness for ${bp.num < 3 ? `Module ${bp.num + 1}` : "holistic subject mastery"}`
      ],
      revisionChecklist: [
        "Review key definitions in Quick Notes",
        "Verify 100% accuracy on foundational flashcards",
        "Explain the primary mechanism out loud to test fluency"
      ],
      nextSteps: bp.num < 3 ? `Proceed to Module ${bp.num + 1} to apply these principles to deeper problem solving.` : `Review all module summaries and attempt comprehensive synthesis.`
    };

    return {
      id: modId,
      moduleNumber: bp.num,
      stageName: bp.stageName,
      title: bp.title,
      purpose: bp.purpose,
      topicsCovered: bp.topics.map(t => t.title),
      learningObjectives: bp.objectives,
      prerequisites: bp.prereqs,
      estimatedEffort: bp.effort,
      status: idx === 0 ? "in_progress" : "not_started",
      progress: idx === 0 ? 25 : 0,
      sourceResourceIds: resources.map(r => r._id),
      sourceResourceTitles: resourceTitles.length ? resourceTitles : ["Foundational Reference Material"],
      topics,
      comprehensiveNotes,
      quickNotes,
      flashcards,
      quizzes,
      mindMap,
      mindMapGraph: buildProgressiveMindMapGraph({
        id: modId,
        moduleNumber: bp.num,
        title: bp.title,
        purpose: bp.purpose,
        topicsCovered: bp.topics.map(t => t.title),
        topics
      }, subject),
      practiceTasks,
      stageSummary,
      summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
}

/**
 * AI-powered Learning Module Generation Pipeline
 * Analyzes uploaded resources, user intent, depth, and crafts comprehensive modules.
 */
export async function generateLearningModules(
  workspace: Workspace,
  callGemini?: GeminiCaller,
  customApiKey?: string
): Promise<LearningModule[]> {
  const goal = workspace.learningGoal || workspace.title;
  const subject = workspace.subject || "General Studies";
  const intent = workspace.learningIntent;
  const resources = workspace.resources || [];

  const resourceSummaries = resources.map((r, i) => {
    const snippet = (r.content || r.url || "").slice(0, 1500);
    return `Resource ${i + 1}: [${r.fileType || "doc"}] "${r.title}"\nContent Preview:\n${snippet}\n---`;
  }).join("\n\n");

  const prompt = `You are a World-Class Learning Architect and Master Educator.
Upgrade the learning plan for this workspace into a complete, structured curriculum composed of logical LEARNING MODULES.

WORKFLOW RULES:
1. Break the subject into the natural, appropriate number of sequential MODULES (e.g., 2 to 5 modules depending on depth and resources). DO NOT HARDCODE OR ARBITRARILY LIMIT MODULES.
2. For EVERY module, generate:
   - Module title & clear purpose
   - Topics covered & prerequisites
   - Learning objectives & estimated study effort
   - Comprehensive Notes (NotebookLM-style: detailed, explanatory, multi-section markdown with overviews, core definitions, deep mechanics, examples, misconceptions, and key takeaways)
   - Quick Notes (revision: core definitions, formulas/rules, key principles, important distinctions, critical facts, final takeaway)
   - Multiple Flashcards (NO 1-CARD LIMIT! Provide 4 to 8 high-yield retrieval-practice flashcards per module)
   - Multiple Quizzes (NO 1-QUESTION LIMIT! Provide 4 to 6 questions per module across multiple choice, conceptual, and scenario types with options, correct answer, and detailed explanation)
   - Proper Visual Mind Map structure (centralTopic, hierarchical nodes with categories: central, major, sub, detail, and parentId links)
   - Practice Tasks (actionable exercises)
   - Module Summary (what was learned, most important concepts, connections, competencies gained, revision checklist, next steps)
3. Map which resources contribute to each module.

LEARNER SPECIFICATIONS:
- Subject: ${subject}
- Primary Learning Goal: "${goal}"
- Target Achievement: "${intent?.targetAchievement || "Comprehensive understanding and practical mastery"}"
- Specific Intent from Resources: "${intent?.specificIntent || intent?.intentFromResources || "Master core concepts and solve problems"}"
- Learning Depth: "${intent?.depth || "understanding"}" (overview / solid understanding / deep mastery)

AVAILABLE RESOURCES:
${resourceSummaries || "No external files uploaded yet. Ground the curriculum in authoritative, first-principles subject knowledge."}

Return ONLY valid JSON matching this schema:
{
  "modules": [
    {
      "moduleNumber": 1,
      "title": "Module Title",
      "purpose": "Clear pedagogical purpose",
      "topicsCovered": ["Topic A", "Topic B", "Topic C"],
      "learningObjectives": ["Objective 1", "Objective 2"],
      "prerequisites": ["None or previous module"],
      "estimatedEffort": "45 mins",
      "sourceResourceTitles": ["Resource Title A"],
      "comprehensiveNotes": "# Module Title\\n\\n## 1. Executive Overview\\n...\\n## 2. Key Concepts & Definitions\\n...\\n## 3. In-Depth Explanations & Mechanics\\n...\\n## 4. Examples & Case Studies\\n...\\n## 5. Common Misconceptions & Distinctions\\n...\\n## 6. Practical Applications & Rules\\n...\\n## 7. Key Takeaways",
      "quickNotes": {
        "coreDefinitions": [{ "term": "Term", "definition": "Definition" }],
        "essentialFormulasOrRules": ["Rule 1"],
        "keyPrinciples": ["Principle 1"],
        "importantDistinctions": ["Distinction 1"],
        "criticalFacts": ["Fact 1"],
        "finalTakeaway": "Takeaway sentence"
      },
      "flashcards": [
        {
          "front": "Question or prompt?",
          "back": "Detailed retrieval answer",
          "relatedConcept": "Concept name",
          "difficulty": "Beginner" | "Intermediate" | "Advanced"
        }
      ],
      "quizzes": [
        {
          "question": "Question text?",
          "type": "multiple_choice" | "conceptual" | "scenario",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option A",
          "explanation": "Detailed step-by-step why this is correct",
          "difficulty": "Beginner" | "Intermediate" | "Advanced",
          "conceptTested": "Core Concept"
        }
      ],
      "mindMap": {
        "title": "Module Mind Map",
        "centralTopic": "Module Name",
        "nodes": [
          { "id": "1", "label": "Central Concept", "category": "central" },
          { "id": "2", "label": "Major Topic", "parentId": "1", "category": "major" },
          { "id": "3", "label": "Sub Concept", "parentId": "2", "category": "sub" },
          { "id": "4", "label": "Application / Detail", "parentId": "3", "category": "detail" }
        ],
        "edges": [
          { "from": "1", "to": "2", "relation": "subdivides" },
          { "from": "2", "to": "3", "relation": "details" }
        ]
      },
      "practiceTasks": [
        {
          "title": "Practice task title",
          "instruction": "Detailed task instructions",
          "deliverable": "Expected output"
        }
      ],
      "summary": {
        "whatWasLearned": ["Point 1", "Point 2"],
        "mostImportantConcepts": ["Concept 1"],
        "connectionsBetweenConcepts": "How concepts connect",
        "competenciesGained": ["Competency 1"],
        "revisionChecklist": ["Item to verify"],
        "nextSteps": "What to study next"
      }
    }
  ]
}`;

  if (callGemini) {
    try {
      const response = await callGemini(
        prompt,
        "You are an elite educational AI engine. You generate comprehensive, source-grounded learning modules with rich multi-item study materials. Output ONLY valid JSON.",
        customApiKey
      );
      if (response.text) {
        const parsed = extractJsonFromMarkdown(response.text);
        if (parsed && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
          const generated = parsed.modules.map((m: any, idx: number) => {
            const modId = "mod_" + Date.now() + "_" + (idx + 1);
            const topicsCovered = Array.isArray(m.topicsCovered) ? m.topicsCovered : [subject];

            // Build hierarchical ModuleTopic[]
            const topics: ModuleTopic[] = Array.isArray(m.topics) && m.topics.length > 0
              ? m.topics.map((t: any, tIdx: number) => ({
                  id: `${modId}_top_${tIdx + 1}`,
                  topicNumber: t.topicNumber || tIdx + 1,
                  title: t.title || topicsCovered[tIdx] || `Topic ${tIdx + 1}`,
                  overview: t.overview || `Overview and core focus of ${t.title || topicsCovered[tIdx]}`,
                  detailedNotes: t.detailedNotes || `# ${t.title || topicsCovered[tIdx]}\n\nComprehensive academic textbook notes explaining core principles, mechanisms, and examples.`,
                  learningObjectives: Array.isArray(t.learningObjectives) ? t.learningObjectives : ["Understand core concepts and principles"],
                  coreDefinitions: Array.isArray(t.coreDefinitions) ? t.coreDefinitions : [],
                  principlesOrLaws: Array.isArray(t.principlesOrLaws) ? t.principlesOrLaws : [],
                  workedExamples: Array.isArray(t.workedExamples) ? t.workedExamples : [],
                  visualExplanation: t.visualExplanation || undefined,
                  quickRevision: Array.isArray(t.quickRevision) ? t.quickRevision : [],
                  practiceQuestions: Array.isArray(t.practiceQuestions) ? t.practiceQuestions : []
                }))
              : topicsCovered.map((tc: string, tIdx: number) => ({
                  id: `${modId}_top_${tIdx + 1}`,
                  topicNumber: tIdx + 1,
                  title: tc,
                  overview: `Foundational and analytical breakdown of ${tc}.`,
                  detailedNotes: `# ${tc}\n\n## 1. Overview\nComprehensive textbook guide for **${tc}** within ${m.title || subject}.\n\n## 2. In-Depth Mechanics\nDetailed explanations, causal drivers, and boundary conditions.\n\n## 3. Key Takeaways\nCrucial mental models and problem-solving rules.`,
                  learningObjectives: [`Master key definitions and relationships in ${tc}`],
                  coreDefinitions: [{ term: tc, definition: `Primary subject domain concept in ${m.title || subject}.` }],
                  principlesOrLaws: [`Governing law: Ground analysis in first principles.`],
                  workedExamples: [{
                    title: `Worked Analysis of ${tc}`,
                    problem: `Apply first principles to analyze system response in ${tc}.`,
                    stepByStepSolution: ["Identify governing assumptions", "Isolate variables", "Validate boundary conditions"],
                    commonTraps: "Overlooking hidden constraints."
                  }],
                  quickRevision: [`Anchor concept: ${tc}`, "Sanity check limiting conditions."]
                }));

            const stageSummary: StageSummary = m.stageSummary || {
              whatWasLearned: Array.isArray(m.summary?.whatWasLearned) ? m.summary.whatWasLearned : ["Core principles and terminology", "Operational mechanics"],
              mostImportantConcepts: Array.isArray(m.summary?.mostImportantConcepts) ? m.summary.mostImportantConcepts : topicsCovered,
              importantRelationships: ["Interconnected causal mechanisms governing system dynamics."],
              importantFormulasOrDefinitions: ["Foundational Invariant: Conservation of key properties."],
              commonMistakes: ["Applying formulas before validating boundary conditions."],
              quickRevisionBullets: [`Review topics in ${m.title || "this module"}.`, "Verify active recall with flashcards."],
              selfCheckQuestions: ["Can you explain the primary mechanism out loud without notes?"],
              readinessIndicator: {
                ready: idx === 0,
                message: idx < (parsed.modules.length - 1) ? `Ready to advance to Module ${idx + 2}.` : "Curriculum complete!",
                recommendedScore: "≥80% on Module Quiz"
              }
            };

            return {
              id: modId,
              moduleNumber: m.moduleNumber || idx + 1,
              stageName: m.stageName || `Stage ${idx + 1}: ${m.title || "Core Concepts"}`,
              title: m.title || `Module ${idx + 1}: Core Concepts`,
              purpose: m.purpose || `Deepen understanding in ${subject}`,
              topicsCovered,
              learningObjectives: Array.isArray(m.learningObjectives) ? m.learningObjectives : ["Master core principles"],
              prerequisites: Array.isArray(m.prerequisites) ? m.prerequisites : ["None"],
              estimatedEffort: m.estimatedEffort || "45 mins",
              status: idx === 0 ? "in_progress" : "not_started",
              progress: idx === 0 ? 20 : 0,
              sourceResourceIds: resources.map(r => r._id),
              sourceResourceTitles: Array.isArray(m.sourceResourceTitles) && m.sourceResourceTitles.length ? m.sourceResourceTitles : resources.map(r => r.title),
              topics,
              stageSummary,
              comprehensiveNotes: m.comprehensiveNotes || `# ${m.title}\n\nDetailed study notes for this module.`,
              quickNotes: m.quickNotes || {
                coreDefinitions: [{ term: "Core Concept", definition: "Primary anchor of the module." }],
                essentialFormulasOrRules: ["Verify constraints before applying formulas."],
                keyPrinciples: ["First principles analysis prevents misinterpretation."],
                importantDistinctions: ["Distinguish theory from applied edge cases."],
                criticalFacts: ["This module establishes foundational retention."],
                finalTakeaway: "Consolidate core mechanisms before progressing."
              },
              flashcards: (() => {
                const aiCards = Array.isArray(m.flashcards) && m.flashcards.length ? m.flashcards.map((fc: any, fIdx: number) => ({
                  id: `${modId}_fc_${fIdx + 1}`,
                  front: fc.front || "Question prompt",
                  back: fc.back || "Answer explanation",
                  relatedConcept: fc.relatedConcept || "Concept",
                  difficulty: fc.difficulty || "Intermediate",
                  sourceResourceTitle: m.sourceResourceTitles?.[0] || resources[0]?.title || "Source Reference"
                })) : [];
                const dynamic = generateDynamicFlashcardsForModule(
                  modId,
                  m.title || `Module ${idx + 1}`,
                  topics,
                  m.quickNotes || {
                    coreDefinitions: [{ term: topicsCovered[0] || subject, definition: `Primary concept in ${m.title || subject}` }],
                    essentialFormulasOrRules: ["Verify constraints before proceeding"],
                    keyPrinciples: ["Deconstruct problems to first principles"],
                    importantDistinctions: ["Distinguish definition from applied boundary limits"],
                    criticalFacts: ["Active retrieval improves long-term consolidation"],
                    finalTakeaway: "Master foundational invariants before edge-case testing"
                  },
                  subject,
                  goal,
                  resources[0]?.title || "Course Material"
                );
                // Combine and deduplicate
                const combined = [...aiCards];
                for (const d of dynamic) {
                  if (!combined.some(c => c.front.toLowerCase() === d.front.toLowerCase())) {
                    combined.push(d);
                  }
                }
                return combined;
              })(),
              quizzes: Array.isArray(m.quizzes) && m.quizzes.length ? m.quizzes.map((q: any, qIdx: number) => ({
                id: `${modId}_qz_${qIdx + 1}`,
                type: q.type || "multiple_choice",
                question: q.question || "Assessment question?",
                options: Array.isArray(q.options) && q.options.length ? q.options : ["Correct answer", "Distractor 1", "Distractor 2", "Distractor 3"],
                correctAnswer: q.correctAnswer || (q.options?.[0] || "Correct answer"),
                explanation: q.explanation || "Detailed reason why this answer is correct.",
                difficulty: q.difficulty || "Intermediate",
                conceptTested: q.conceptTested || "Core Concept"
              })) : [
                {
                  id: `${modId}_qz_1`,
                  type: "multiple_choice" as const,
                  question: `What is the primary objective of ${m.title}?`,
                  options: [m.purpose || `Master concepts in ${subject}`, "Option B", "Option C", "Option D"],
                  correctAnswer: m.purpose || `Master concepts in ${subject}`,
                  explanation: "Aligns with the core module objective.",
                  difficulty: "Beginner" as const,
                  conceptTested: "Objective"
                }
              ],
              mindMap: m.mindMap && Array.isArray(m.mindMap.nodes) ? m.mindMap : {
                title: `${m.title} Mind Map`,
                centralTopic: m.title,
                nodes: [
                  { id: `${modId}_root`, label: m.title, category: "central" },
                  { id: `${modId}_n1`, label: "Core Principles", parentId: `${modId}_root`, category: "major" },
                  { id: `${modId}_n2`, label: "Applications", parentId: `${modId}_root`, category: "major" }
                ],
                edges: [
                  { from: `${modId}_root`, to: `${modId}_n1`, relation: "anchors" },
                  { from: `${modId}_root`, to: `${modId}_n2`, relation: "applies" }
                ]
              },
              mindMapGraph: buildProgressiveMindMapGraph({
                id: modId,
                moduleNumber: m.moduleNumber || idx + 1,
                title: m.title || `Module ${idx + 1}: Core Concepts`,
                purpose: m.purpose || `Deepen understanding in ${subject}`,
                topicsCovered,
                topics
              }, subject),
              practiceTasks: Array.isArray(m.practiceTasks) && m.practiceTasks.length ? m.practiceTasks.map((pt: any, ptIdx: number) => ({
                id: `${modId}_pt_${ptIdx + 1}`,
                title: pt.title || `Exercise ${ptIdx + 1}`,
                instruction: pt.instruction || "Practice and summarize key ideas.",
                deliverable: pt.deliverable || "Completed reflection",
                done: false
              })) : [
                {
                  id: `${modId}_pt_1`,
                  title: "Review notes and complete quiz",
                  instruction: "Read through comprehensive notes, test memory with flashcards, then complete the quiz.",
                  deliverable: "Quiz score ≥80%",
                  done: false
                }
              ],
              summary: m.summary || {
                whatWasLearned: ["Core terminology", "Primary operational mechanisms"],
                mostImportantConcepts: [m.topicsCovered?.[0] || "Foundational concepts"],
                connectionsBetweenConcepts: "Integrates core invariants with practical application.",
                competenciesGained: ["Conceptual fluency", "Active retrieval capability"],
                revisionChecklist: ["Review Quick Notes", "Practice flashcard deck"],
                nextSteps: "Proceed to next module upon quiz completion."
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as LearningModule;
          });
          return generated;
        }
      }
    } catch (err) {
      console.warn("[generateLearningModules] Gemini error, using tailored fallback modules:", err);
    }
  }

  return buildTailoredFallbackModules(goal, subject, intent, resources);
}

/**
 * Regenerates an individual section of a module (e.g. notes, flashcards, quiz, mind map, etc.)
 */
export async function regenerateModuleSection(
  module: LearningModule,
  section: "notes" | "quick_notes" | "flashcards" | "quizzes" | "mindmap" | "summary" | "practice",
  workspace: Workspace,
  callGemini?: GeminiCaller,
  customApiKey?: string
): Promise<any> {
  const subject = workspace.subject;
  const goal = workspace.learningGoal;
  const resourcesContext = workspace.resources.map(r => `- ${r.title}: ${(r.content || r.url).slice(0, 400)}`).join("\n");

  const prompt = `You are a Master Educator in ${subject}.
WORKSPACE GOAL: "${goal}"
MODULE: "${module.title}" (Module ${module.moduleNumber})
PURPOSE: ${module.purpose}
TOPICS: ${module.topicsCovered.join(", ")}
SOURCE RESOURCES:
${resourcesContext || "Standard reference curriculum"}

Task: Regenerate high-yield, comprehensive learning material specifically for section: "${section}".
Ensure deep pedagogical structure, source grounding, and active retrieval practice.

Return ONLY a valid JSON object:
${section === "notes" ? `{"comprehensiveNotes": "# Rich markdown notes with Overview, Definitions, Mechanics, Examples, Misconceptions, and Takeaways"}` : ""}
${section === "quick_notes" ? `{"quickNotes": {"coreDefinitions": [{"term": "...", "definition": "..."}], "essentialFormulasOrRules": ["..."], "keyPrinciples": ["..."], "importantDistinctions": ["..."], "criticalFacts": ["..."], "finalTakeaway": "..."}}` : ""}
${section === "flashcards" ? `{"flashcards": [{"front": "...", "back": "...", "relatedConcept": "...", "difficulty": "Beginner" | "Intermediate" | "Advanced"}]}` : ""}
${section === "quizzes" ? `{"quizzes": [{"question": "...", "type": "multiple_choice" | "conceptual" | "scenario", "options": ["..."], "correctAnswer": "...", "explanation": "...", "difficulty": "Intermediate", "conceptTested": "..."}]}` : ""}
${section === "mindmap" ? `{"mindMap": {"title": "...", "centralTopic": "...", "nodes": [{"id": "1", "label": "...", "category": "central"}], "edges": [{"from": "1", "to": "2"}]}}` : ""}
${section === "summary" ? `{"summary": {"whatWasLearned": ["..."], "mostImportantConcepts": ["..."], "connectionsBetweenConcepts": "...", "competenciesGained": ["..."], "revisionChecklist": ["..."], "nextSteps": "..."}}` : ""}
${section === "practice" ? `{"practiceTasks": [{"title": "...", "instruction": "...", "deliverable": "..."}]}` : ""}`;

  if (callGemini) {
    try {
      const resp = await callGemini(prompt, "Output ONLY valid JSON.", customApiKey);
      if (resp.text) {
        const parsed = extractJsonFromMarkdown(resp.text);
        if (parsed) return parsed;
      }
    } catch (e) {
      console.warn("[regenerateModuleSection] Gemini error:", e);
    }
  }

  // Fallback generation for section
  if (section === "notes") {
    return {
      comprehensiveNotes: `# ${module.title}\n\n## 1. Overview\nComprehensive notes updated for ${module.title}.\n\n## 2. Core Concepts\n- Key principle: First-principles understanding in ${subject}.\n- Operational invariant: Rules that govern behavior.\n\n## 3. Deep Mechanics & Analysis\nEvery mechanism in ${subject} follows defined causality. Trace inputs through transforms to final states.\n\n## 4. Misconceptions & Corrections\nAvoid confusing correlation with root cause.\n\n## 5. Key Takeaways\nMaster the governing principles to handle both standard and novel problems.`
    };
  } else if (section === "flashcards") {
    return {
      flashcards: [
        {
          id: `${module.id}_fc_new_1`,
          front: `What is the core principle of ${module.title}?`,
          back: module.purpose,
          relatedConcept: "Foundations",
          difficulty: "Beginner"
        },
        {
          id: `${module.id}_fc_new_2`,
          front: `How do you diagnose boundary condition failures in ${module.topicsCovered[0] || subject}?`,
          back: "By checking whether assumptions regarding linearity or conservation hold at extreme parameter values.",
          relatedConcept: "Boundary Analysis",
          difficulty: "Intermediate"
        },
        {
          id: `${module.id}_fc_new_3`,
          front: `Why is active retrieval superior to passive review for ${module.title}?`,
          back: "Active recall forces reconstruction of memory traces, significantly increasing retrieval speed and long-term consolidation.",
          relatedConcept: "Learning Science",
          difficulty: "Intermediate"
        },
        {
          id: `${module.id}_fc_new_4`,
          front: `State the primary distinction between theoretical formulation and practical application in this module.`,
          back: "Theoretical models assume idealized noise-free conditions, whereas practical implementations require tolerance for perturbations and edge cases.",
          relatedConcept: "Distinctions",
          difficulty: "Advanced"
        }
      ]
    };
  } else if (section === "quizzes") {
    return {
      quizzes: [
        {
          id: `${module.id}_qz_new_1`,
          type: "multiple_choice",
          question: `Which approach best validates understanding of ${module.title}?`,
          options: [
            "Predicting system behavior under altered constraints",
            "Memorizing bullet points verbatim without application",
            "Ignoring failure modes and edge cases",
            "Assuming every problem matches an exact pre-seen template"
          ],
          correctAnswer: "Predicting system behavior under altered constraints",
          explanation: "True conceptual understanding enables accurate prediction under novel constraints.",
          difficulty: "Intermediate",
          conceptTested: "Conceptual Prediction"
        },
        {
          id: `${module.id}_qz_new_2`,
          type: "conceptual",
          question: `In ${subject}, what indicates that an analytical model has exceeded its valid operating domain?`,
          options: [
            "Outputs diverge from observable conservation or physical laws",
            "Calculations require more than two steps",
            "The model matches real observations perfectly",
            "The model has been published in a textbook"
          ],
          correctAnswer: "Outputs diverge from observable conservation or physical laws",
          explanation: "Divergence from fundamental invariants signals that the model's boundary conditions have been violated.",
          difficulty: "Advanced",
          conceptTested: "Model Validity"
        }
      ]
    };
  } else if (section === "mindmap") {
    return {
      mindMap: {
        title: `${module.title} Mind Map`,
        centralTopic: module.title,
        nodes: [
          { id: `${module.id}_root`, label: module.title, category: "central" },
          { id: `${module.id}_n1`, label: "Core Principles", parentId: `${module.id}_root`, category: "major" },
          { id: `${module.id}_n2`, label: "Problem Solving", parentId: `${module.id}_root`, category: "major" },
          { id: `${module.id}_n3`, label: "Synthesis", parentId: `${module.id}_root`, category: "major" }
        ],
        edges: [
          { from: `${module.id}_root`, to: `${module.id}_n1`, relation: "anchors" },
          { from: `${module.id}_root`, to: `${module.id}_n2`, relation: "executes" },
          { from: `${module.id}_root`, to: `${module.id}_n3`, relation: "synthesizes" }
        ]
      }
    };
  } else if (section === "summary") {
    return {
      summary: {
        whatWasLearned: [`Core foundations of ${module.title}`, "Mechanics and edge-case behaviors"],
        mostImportantConcepts: module.topicsCovered.slice(0, 3),
        connectionsBetweenConcepts: "Connects first-principles definitions with concrete problem-solving execution.",
        competenciesGained: ["Problem-solving agility", "Retrieval-backed fluency"],
        revisionChecklist: ["Review Quick Notes", "Retest quiz questions"],
        nextSteps: "Apply concepts to practical tasks or proceed to next stage."
      }
    };
  }

  return {};
}

/**
 * Builds backward-compatible StudyMaterial[] projections from LearningModules
 * so that any legacy consumers, views, or endpoints get rich, module-linked materials.
 */
export function projectStudyMaterialsFromModules(modules: LearningModule[]): StudyMaterial[] {
  const materials: StudyMaterial[] = [];

  for (const mod of modules) {
    // Comprehensive Note
    materials.push({
      id: `mat_note_${mod.id}`,
      type: "note",
      title: `${mod.title}: Comprehensive Study Notes`,
      content: mod.comprehensiveNotes,
      moduleId: mod.id,
      moduleTitle: mod.title,
      createdAt: mod.createdAt
    });

    // Quick Revision Note
    const quickSummary = `### Core Definitions\n` +
      mod.quickNotes.coreDefinitions.map(d => `- **${d.term}**: ${d.definition}`).join("\n") +
      `\n\n### Essential Rules & Principles\n` +
      mod.quickNotes.keyPrinciples.map(p => `- ${p}`).join("\n") +
      `\n\n### Critical Takeaway\n> ${mod.quickNotes.finalTakeaway}`;

    materials.push({
      id: `mat_quick_${mod.id}`,
      type: "summary",
      title: `${mod.title}: Quick Revision`,
      content: quickSummary,
      moduleId: mod.id,
      moduleTitle: mod.title,
      createdAt: mod.createdAt
    });

    // Flashcards (Multiple!)
    for (const fc of mod.flashcards) {
      materials.push({
        id: `mat_fc_${fc.id}`,
        type: "flashcard",
        title: `Flashcard: ${fc.relatedConcept}`,
        content: fc.front,
        moduleId: mod.id,
        moduleTitle: mod.title,
        details: {
          front: fc.front,
          back: fc.back
        },
        createdAt: mod.createdAt
      });
    }

    // Quizzes (Multiple!)
    for (const q of mod.quizzes) {
      materials.push({
        id: `mat_qz_${q.id}`,
        type: "quiz",
        title: `Quiz: ${q.conceptTested || mod.title}`,
        content: q.question,
        moduleId: mod.id,
        moduleTitle: mod.title,
        details: {
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation
        },
        createdAt: mod.createdAt
      });
    }

    // Mind Map
    materials.push({
      id: `mat_mm_${mod.id}`,
      type: "mindmap",
      title: `${mod.title}: Concept Mind Map`,
      content: `Mind map connecting ${mod.mindMap.nodes.length} concepts in ${mod.title}`,
      moduleId: mod.id,
      moduleTitle: mod.title,
      details: {
        nodes: mod.mindMap.nodes.map(n => ({ id: n.id, label: n.label, parent: n.parentId }))
      },
      createdAt: mod.createdAt
    });
  }

  return materials;
}

export async function generateWorkspaceFromGoal(
  goal: string,
  userId: string,
  customSubject?: string,
  initialResources: Resource[] = [],
  callGemini?: GeminiCaller,
  customApiKey?: string,
  learningIntent?: LearningIntent
): Promise<Workspace> {
  const targetAchievement = learningIntent?.targetAchievement || "";
  const specificIntent = learningIntent?.specificIntent || learningIntent?.intentFromResources || "";
  const depth = learningIntent?.depth || "understanding";

  // First synthesize the subject and title
  let detectedSubject = customSubject || "General Studies";
  let workspaceTitle = goal.slice(0, 45);

  if (callGemini) {
    const titlePrompt = `Identify the primary academic/professional subject field and create a concise title for this learning goal.
GOAL: "${goal}"
SUBJECT HINT: "${customSubject || ""}"
TARGET: "${targetAchievement}"
Return ONLY JSON: {"subject": "field name", "title": "Concise 3-6 word title"}`;
    try {
      const res = await callGemini(titlePrompt, "Output ONLY valid JSON.", customApiKey);
      if (res.text) {
        const parsed = extractJsonFromMarkdown(res.text);
        if (parsed?.subject) detectedSubject = parsed.subject;
        if (parsed?.title) workspaceTitle = parsed.title;
      }
    } catch (e) {}
  }

  const wsId = "ws_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  // Partial workspace object to pass to module generation
  const tempWs: Workspace = {
    id: wsId,
    userId,
    title: workspaceTitle,
    subject: detectedSubject,
    learningGoal: goal,
    learningIntent: learningIntent || {
      goal,
      targetAchievement,
      specificIntent,
      intentFromResources: specificIntent,
      depth: (depth as any) || "understanding"
    },
    resources: initialResources.map(r => ({ ...r, workspaceId: wsId })),
    conversation: [],
    studyMaterials: [],
    sessionOverview: {
      summary: `Learning workspace initialized for: "${goal}". Ready for deep study.`,
      topicsCovered: ["Orientation", "Curriculum Setup"],
      whatLearned: ["Target objective scope defined"],
      discoveries: ["Curriculum modules scaffolded"],
      questionsDiscussed: ["How to reach stated objective efficiently"],
      aiObservations: `Focused on ${detectedSubject}. Modules generated with comprehensive notes, flashcards, and quizzes.`,
      recommendedNextActions: ["Explore Module 1", "Review Comprehensive Notes"],
      lastUpdated: new Date().toISOString()
    },
    learningPath: [],
    tasks: [],
    analytics: {
      overallProgress: 15,
      milestonesTotal: 3,
      milestonesDone: 0,
      tasksTotal: 5,
      tasksDone: 0,
      strengths: ["Clear target goal"],
      areasToWork: ["Core conceptual foundations"],
      recommendedTopics: ["Foundations"],
      studyStreakDays: 1,
      projectModePhase: "LEARN"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Generate complete learning modules
  const modules = await generateLearningModules(tempWs, callGemini, customApiKey);
  tempWs.learningModules = modules;

  // Project study materials from modules for full backward compatibility
  tempWs.studyMaterials = projectStudyMaterialsFromModules(modules);

  // Scaffolding learning steps from modules
  tempWs.learningPath = modules.map((m, idx) => ({
    step: m.moduleNumber,
    title: m.title,
    resource: m.sourceResourceTitles[0] || m.title,
    status: (idx === 0 ? "active" : "upcoming") as "completed" | "active" | "upcoming",
    reason: m.purpose,
    keyTopics: m.topicsCovered
  }));

  // Tasks aligned to the modules
  tempWs.tasks = [
    { id: `t_${wsId}_1`, title: `Review Module 1 Comprehensive Notes: ${modules[0]?.title || "Foundations"}`, done: false, phase: "LEARN" },
    { id: `t_${wsId}_2`, title: `Practice Flashcards for Module 1`, done: false, phase: "PLAN" },
    { id: `t_${wsId}_3`, title: `Complete Module 1 Assessment Quiz (Score ≥ 80%)`, done: false, phase: "BUILD" },
    { id: `t_${wsId}_4`, title: `Explore Module 2 Core Problem-Solving`, done: false, phase: "TEST" },
    { id: `t_${wsId}_5`, title: `Synthesize Final Capstone & Applied Scenarios`, done: false, phase: "IMPROVE" }
  ];

  tempWs.analytics.milestonesTotal = modules.length;
  tempWs.analytics.milestonesDone = modules.filter(m => m.status === "completed").length;
  tempWs.analytics.tasksTotal = tempWs.tasks.length;
  tempWs.analytics.tasksDone = tempWs.tasks.filter(t => t.done).length;

  // Generate course-level study materials covering all resources and modules
  tempWs.courseMaterials = await generateCourseStudyMaterials(tempWs, modules, callGemini, customApiKey);

  // Generate binary documents (PDF, DOCX, PPTX) for course and modules
  try {
    tempWs.files = await generateAllWorkspaceFiles(tempWs);
  } catch (fErr) {
    console.warn("[generateWorkspaceFromGoal] Error generating workspace files:", fErr);
    tempWs.files = [];
  }

  tempWs.conversation = [
    {
      role: "model",
      text: `Welcome to **${workspaceTitle}**!\n\nI've analyzed your goal: *" ${goal} "*\nI have structured your curriculum into **${modules.length} Learning Modules**, starting with **Module 1: ${modules[0]?.title}**.\n\nEach module includes NotebookLM-style comprehensive notes, quick revision sheets, active-recall flashcards, quizzes, visual mind maps, and practice tasks. Ready to begin?`,
      timestamp: new Date().toISOString()
    }
  ];

  return tempWs;
}

export async function generateStudyMaterial(
  workspace: Workspace,
  materialType: "note" | "summary" | "key_concept" | "mindmap" | "flashcard" | "quiz" | "question",
  topic?: string,
  callGemini?: GeminiCaller,
  customApiKey?: string
): Promise<StudyMaterial> {
  const targetTopic = topic || workspace.learningModules?.[0]?.title || workspace.learningPath.find(p => p.status === "active")?.title || workspace.subject;
  const resContext = workspace.resources.map(r => `- ${r.title}: ${(r.content || r.url).slice(0, 200)}`).join("\n");

  const prompt = `You are an expert tutor in ${workspace.subject}.
User goal: "${workspace.learningGoal}".
Target Topic: "${targetTopic}".
Resources:
${resContext || "Authoritative domain knowledge"}

Generate deep, comprehensive study material of type: "${materialType}".
For notes: Output multi-section markdown with definitions, in-depth mechanics, examples, misconceptions, and takeaways.
For flashcard: High-yield retrieval question and comprehensive answer.
For quiz: High-quality question with 4 options, exact correct answer string, and in-depth explanation.
For mindmap: Hierarchical concept nodes.

Return ONLY a valid JSON object:
{
  "title": "Clear concise title",
  "content": "Rich markdown content explaining or formatting this material in depth",
  "details": {
    "front": "For flashcard: retrieval prompt",
    "back": "For flashcard: answer and key distinction",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "explanation": "Detailed why",
    "nodes": [
      { "id": "1", "label": "Root Concept" },
      { "id": "2", "label": "Major Subtopic", "parent": "1" },
      { "id": "3", "label": "Specific Detail", "parent": "2" }
    ]
  }
}`;

  let parsed: any = null;
  if (callGemini) {
    try {
      const raw = await callGemini(
        prompt,
        `You are an expert tutor in ${workspace.subject}. Output ONLY valid JSON.`,
        customApiKey
      );
      if (raw.text) {
        parsed = extractJsonFromMarkdown(raw.text);
      }
    } catch (e) {}
  }

  const matId = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  return {
    id: matId,
    type: materialType,
    title: parsed?.title || `${materialType.replace("_", " ").toUpperCase()}: ${targetTopic}`,
    content: parsed?.content || `Comprehensive study notes for ${targetTopic}.`,
    details: parsed?.details || {},
    createdAt: new Date().toISOString()
  };
}
