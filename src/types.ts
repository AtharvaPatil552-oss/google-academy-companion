export interface Resource {
  _id: string;
  title: string;
  content: string;
  url: string;
  category: string;
  fileType?: string; // pdf, docx, pptx, md, txt, url, image, note
  userId: string;
  workspaceId?: string;
  createdAt: string;
  status: string;
  intelligence?: {
    summary?: string;
    keyTopics?: string[];
    prerequisites?: string[];
    difficulty?: string;
    relevance?: string;
    nextStep?: string;
    processedAt?: string;
  };
}

export interface ProjectTask {
  id: string;
  title: string;
  done: boolean;
  phase?: "LEARN" | "PLAN" | "BUILD" | "TEST" | "IMPROVE";
}

export interface LearningStep {
  step: number;
  title: string;
  resource: string;
  status: "completed" | "active" | "upcoming";
  reason: string;
  keyTopics?: string[];
}

export interface ConversationMessage {
  role: "user" | "model";
  text: string;
  timestamp: string;
}

export interface StudyMaterial {
  id: string;
  type: "note" | "summary" | "key_concept" | "mindmap" | "flashcard" | "quiz" | "question";
  title: string;
  content: string;
  moduleId?: string;
  moduleTitle?: string;
  details?: {
    front?: string;
    back?: string;
    options?: string[];
    correctAnswer?: string;
    explanation?: string;
    nodes?: { id: string; label: string; parent?: string }[];
  };
  createdAt: string;
}

export interface ModuleMindMapNode {
  id: string;
  label: string;
  description?: string;
  parentId?: string;
  category?: "central" | "major" | "sub" | "detail";
}

export interface ModuleMindMapEdge {
  from: string;
  to: string;
  relation?: string;
}

export interface ModuleMindMap {
  title: string;
  centralTopic: string;
  nodes: ModuleMindMapNode[];
  edges?: ModuleMindMapEdge[];
}

export interface ModuleFlashcard {
  id: string;
  front: string;
  back: string;
  relatedConcept: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  sourceResourceId?: string;
  sourceResourceTitle?: string;
}

export interface QuizQuestion {
  id: string;
  type?: "multiple_choice" | "true_false" | "conceptual" | "scenario";
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  conceptTested?: string;
  sourceResourceId?: string;
  sourceResourceTitle?: string;
}

export interface ModuleQuizAttempt {
  attemptId: string;
  timestamp: string;
  score: number;
  total: number;
  correctAnswers: number;
  incorrectAnswers: number;
  weakConcepts: string[];
}

export interface PracticeTask {
  id: string;
  title: string;
  instruction: string;
  scenario?: string;
  deliverable?: string;
  expectedOutcome?: string;
  hint?: string;
  solutionWalkthrough?: string;
  done: boolean;
}

export interface StageSummary {
  whatWasLearned: string[];
  mostImportantConcepts: string[];
  importantRelationships: string[];
  importantFormulasOrDefinitions: string[];
  commonMistakes: string[];
  quickRevisionBullets: string[];
  selfCheckQuestions: string[];
  readinessIndicator: {
    ready: boolean;
    message: string;
    recommendedScore: string;
  };
}

export interface ModuleSummary {
  text?: string;
  whatWasLearned?: string[];
  mostImportantConcepts?: string[];
  connectionsBetweenConcepts?: string;
  competenciesGained?: string[];
  revisionChecklist?: string[];
  nextSteps?: string;
  keyTakeaways?: string[];
}

export interface QuickNotes {
  coreDefinitions: { term: string; definition: string }[];
  essentialFormulasOrRules: string[];
  keyPrinciples: string[];
  importantDistinctions: string[];
  criticalFacts: string[];
  finalTakeaway: string;
}

export interface TopicVisualExplanation {
  type: "diagram" | "table" | "flowchart" | "timeline" | "formula_block" | "concept_map";
  title: string;
  caption?: string;
  content: string; // Markdown table, flowchart text/diagram, formula derivation, or structured visual
}

export interface ModuleTopic {
  id: string;
  topicNumber: number;
  title: string;
  overview: string;
  detailedNotes: string; // Complete textbook-like study document
  learningObjectives: string[];
  coreDefinitions?: { term: string; definition: string }[];
  principlesOrLaws?: string[];
  workedExamples?: {
    title: string;
    problem: string;
    stepByStepSolution: string[];
    commonTraps?: string;
  }[];
  visualExplanation?: TopicVisualExplanation;
  quickRevision?: string[];
  practiceQuestions?: {
    question: string;
    type?: string;
    answer: string;
    explanation?: string;
  }[];
}

export interface WorkspaceFile {
  file_id: string;
  workspace_id: string;
  module_id?: string;
  title: string;
  artifact_type: "detailed_notes" | "short_notes" | "slide_deck" | "practice_set" | "practice_worksheet" | "quiz" | "flashcards" | "mind_map" | "summary" | "mind_map_export";
  scope: "course" | "module";
  format: "pdf" | "docx" | "pptx";
  fileName: string;
  file_name?: string;
  filePath?: string;
  file_path?: string;
  file_type?: "pdf" | "docx" | "pptx";
  fileSize?: number;
  size_bytes?: number;
  status: "ready" | "generating" | "failed";
  createdAt: string;
  updatedAt: string;
  source_artifacts?: string[];
  description?: string;
}

export interface MindMapGraphNode {
  node_id: string;
  parent_id?: string | null;
  children_ids: string[];
  title: string;
  node_type: "root" | "topic" | "subtopic" | "concept" | "detail";
  module_id?: string;
  topic_id?: string;
  knowledge_reference?: string;
  source_reference?: string;
  expanded?: boolean;
  explored?: boolean;
  depth?: number;
  mechanics?: string;
  keyRule?: string;
}

export interface MindMapGraph {
  graph_id: string;
  title: string;
  root_id: string;
  nodes: Record<string, MindMapGraphNode>;
  compiled_at?: string;
}

export interface CourseStudyMaterials {
  detailedNotes: {
    title: string;
    overview: string;
    tableOfContents: string[];
    sections: {
      heading: string;
      subheading?: string;
      content: string;
      visualExplanation?: TopicVisualExplanation;
      keyPrinciples?: string[];
      callout?: string;
      examples?: { title: string; scenario: string; solution: string }[];
    }[];
    synthesisAndConclusion: string;
    sourceReferences: string[];
  };
  shortNotes: {
    title: string;
    courseScope: string;
    coreTaxonomyAndDefinitions: { term: string; definition: string; moduleContext?: string }[];
    governingAxiomsAndFormulas: string[];
    criticalDistinctions: { conceptA: string; conceptB: string; keyDifference: string }[];
    highYieldRevisionBullets: string[];
    overarchingTakeaway: string;
  };
  slideDeck: {
    title: string;
    subtitle: string;
    courseSubject: string;
    slides: {
      slideNumber: number;
      title: string;
      category?: string;
      bullets: string[];
      keyTakeaway?: string;
      visualDescription?: string;
      callout?: string;
    }[];
  };
  practiceSet: {
    title: string;
    exercises: {
      id: string;
      exerciseNumber: number;
      title: string;
      scenario: string;
      problemStatement: string;
      deliverable: string;
      hint?: string;
      solutionWalkthrough: string;
      difficulty: "Foundational" | "Applied" | "Advanced Synthesis";
    }[];
  };
  courseFlashcards?: ModuleFlashcard[];
  interactiveMindMap?: MindMapGraph;
}

export interface LearningModule {
  id: string;
  moduleNumber: number;
  title: string;
  purpose: string;
  stageName?: string; // e.g. "Stage 1 — Foundations"
  topicsCovered: string[];
  learningObjectives: string[];
  prerequisites: string[];
  estimatedEffort: string;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  sourceResourceIds: string[];
  sourceResourceTitles: string[];

  // Hierarchical topics inside the module
  topics: ModuleTopic[];

  // Comprehensive Module-Level Textbook Notes
  comprehensiveNotes: string;

  // Short Notes (Quick revision sheet)
  quickNotes: QuickNotes;

  // Flashcards (Comprehensive active recall collection - no artificial limit)
  flashcards: ModuleFlashcard[];

  // Quizzes (Varied types: multiple choice, true/false, conceptual, scenario, numerical)
  quizzes: QuizQuestion[];
  quizAttempts?: ModuleQuizAttempt[];

  // Mind Map (Visual hierarchical nodes & edges with pan/zoom/expand)
  mindMap: ModuleMindMap;
  mindMapGraph?: MindMapGraph;

  // Practice Tasks
  practiceTasks: PracticeTask[];

  // Stage Summary (Comprehensive end-of-stage synthesis)
  stageSummary: StageSummary;
  summary: ModuleSummary;

  // Real document files generated for this module
  files?: WorkspaceFile[];

  createdAt: string;
  updatedAt: string;
}

export interface SessionOverview {
  summary: string;
  topicsCovered: string[];
  whatLearned: string[];
  discoveries: string[];
  questionsDiscussed: string[];
  aiObservations: string;
  recommendedNextActions: string[];
  lastUpdated: string;
}

export interface WorkspaceAnalytics {
  overallProgress: number; // 0-100
  milestonesTotal: number;
  milestonesDone: number;
  tasksTotal: number;
  tasksDone: number;
  strengths: string[];
  areasToWork: string[];
  recommendedTopics: string[];
  studyStreakDays: number;
  projectModePhase: "LEARN" | "PLAN" | "BUILD" | "TEST" | "IMPROVE";
}

export interface LearningIntent {
  goal: string;
  targetAchievement?: string;
  specificIntent?: string;
  intentFromResources?: string;
  depth?: "overview" | "understanding" | "mastery";
}

export interface Workspace {
  id: string;
  userId: string;
  title: string;
  subject: string;
  learningGoal: string;
  learningIntent?: LearningIntent;
  resources: Resource[];
  conversation: ConversationMessage[];
  learningModules?: LearningModule[];
  studyMaterials: StudyMaterial[];
  courseMaterials?: CourseStudyMaterials;
  files?: WorkspaceFile[];
  sessionOverview: SessionOverview;
  learningPath: LearningStep[];
  tasks: ProjectTask[];
  analytics: WorkspaceAnalytics;
  createdAt: string;
  updatedAt: string;
}
