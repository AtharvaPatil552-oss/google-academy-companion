import { Workspace, LearningModule, WorkspaceFile, MindMapGraph, CourseStudyMaterials } from "../types.js";

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

export interface QuizQuestionItem {
  questionNumber: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  conceptTested?: string;
  type?: string;
}

export interface FlashcardItem {
  cardNumber: number;
  front: string;
  back: string;
  relatedConcept?: string;
}

export interface PracticeExerciseItem {
  exerciseNumber: number;
  title: string;
  difficulty?: string;
  scenario: string;
  problemStatement: string;
  deliverable: string;
  solutionWalkthrough: string;
  hint?: string;
}

export interface MindMapNodeItem {
  id: string;
  title: string;
  level: number;
  nodeType: string;
  mechanics?: string;
  keyRule?: string;
  reference?: string;
}

export interface SlideItem {
  slideNumber: number;
  title: string;
  category?: string;
  bullets: string[];
  keyTakeaway?: string;
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
  // Specialized component data
  quizQuestions?: QuizQuestionItem[];
  flashcards?: FlashcardItem[];
  practiceExercises?: PracticeExerciseItem[];
  mindMapTree?: {
    rootTitle: string;
    nodes: MindMapNodeItem[];
  };
  slides?: SlideItem[];
}

export interface DocxOptions {
  title: string;
  subtitle?: string;
  subject: string;
  learningGoal?: string;
  overview?: string;
  documentType: string;
  sections: PdfSection[];
  tableOfContents?: string[];
  finalTakeaway?: string;
  // Specialized component data
  quizQuestions?: QuizQuestionItem[];
  flashcards?: FlashcardItem[];
  practiceExercises?: PracticeExerciseItem[];
}

export interface PptxOptions {
  title: string;
  subtitle?: string;
  subject: string;
  learningGoal: string;
  slides: SlideItem[];
}
