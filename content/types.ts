export type Module = {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
};

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  body: string; // markdown
};

export type Flashcard = {
  id: string;
  moduleId: string;
  question: string;
  answer: string;
};

export type QuizQuestion = {
  id: string;
  moduleId: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type ContentPackage = {
  module: Module;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
};
