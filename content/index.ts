import mod1 from './mod-1';
import type { ContentPackage } from './types';

export const allContent: ContentPackage[] = [mod1];

export const allModules = allContent.map((c) => c.module);
export const allFlashcards = allContent.flatMap((c) => c.flashcards);
export const allQuizQuestions = allContent.flatMap((c) => c.quizQuestions);

export function getModule(moduleId: string) {
  return allModules.find((m) => m.id === moduleId) ?? null;
}

export function getLesson(moduleId: string, lessonId: string) {
  const mod = getModule(moduleId);
  return mod?.lessons.find((l) => l.id === lessonId) ?? null;
}

export function getFlashcardsForModule(moduleId: string) {
  return allFlashcards.filter((c) => c.moduleId === moduleId);
}

export function getQuestionsForModule(moduleId: string) {
  return allQuizQuestions.filter((q) => q.moduleId === moduleId);
}
