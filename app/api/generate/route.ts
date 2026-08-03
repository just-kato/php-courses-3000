import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/utils/supabase/server';
import * as db from '@/lib/db';
import type { QuestionMix } from '@/lib/db-types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(questionMix: QuestionMix, questionCount: number): string {
  const factualCount = Math.round(questionCount * questionMix.factual);
  const scenarioCount = Math.round(questionCount * questionMix.scenario);
  const calcCount = questionCount - factualCount - scenarioCount;

  return `You are building study material for the NMLS Mortgage Loan Originator (MLO) licensing exam.

Given a lesson title and source text, produce:
1. A short "why it matters" paragraph (2–4 sentences) explaining why this topic appears on the NMLS exam and what a working MLO needs to know.
2. Exactly ${questionCount} multiple-choice questions: ${factualCount} factual, ${scenarioCount} scenario, ${calcCount} calculation.
3. 8–20 flashcards (description→term direction, i.e. front describes a concept/situation, back gives the precise term/rule/number).

Requirements for questions:
- Use named fictional borrowers (Maria, James, etc.) in scenario questions.
- All four options must be plausible; wrong answers should be true facts about related topics, not obvious nonsense (true-but-incomplete distractors).
- Vary qualifiers: avoid starting every stem with "Which of the following".
- Explanation must say why the correct answer is right AND why the best wrong answer fails.
- For calculation questions, show the full worked arithmetic in the explanation.
- source_anchor: include a short verbatim quote (≤30 words) from the source text that supports the correct answer.

Question type definitions:
- factual: tests specific rule, date, threshold, or agency role
- scenario: describes a realistic situation with a named borrower; asks what the MLO must do
- calculation: requires arithmetic (APR, DTI, loan amounts, timing, etc.)

Return strict JSON only — no markdown fences, no preamble:
{
  "whyItMatters": "string",
  "questions": [
    {
      "question_type": "factual" | "scenario" | "calculation",
      "stem": "string",
      "options": ["string", "string", "string", "string"],
      "correct_index": 0,
      "explanation": "string",
      "source_anchor": "string"
    }
  ],
  "flashcards": [
    {
      "front": "string",
      "back": "string",
      "source_anchor": "string"
    }
  ]
}`;
}

export type GenerateResponse = {
  whyItMatters: string;
  questions: Array<{
    question_type: 'factual' | 'scenario' | 'calculation';
    stem: string;
    options: string[];
    correct_index: number;
    explanation: string;
    source_anchor: string;
  }>;
  flashcards: Array<{
    front: string;
    back: string;
    source_anchor: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const { lessonId, title, sourceContent, questionMix } = await request.json() as {
      lessonId: string;
      title: string;
      sourceContent: string;
      questionMix: QuestionMix;
    };

    if (!sourceContent?.trim()) {
      return NextResponse.json({ error: 'No source content provided' }, { status: 400 });
    }
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId required' }, { status: 400 });
    }

    const wordCount = sourceContent.trim().split(/\s+/).length;
    const questionCount = Math.max(12, Math.min(30, Math.round(wordCount / 130)));

    const systemPrompt = buildSystemPrompt(questionMix, questionCount);
    const userMessage = `Lesson: ${title}\n\n${sourceContent.trim()}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const block = message.content[0];
    if (block.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type from model' }, { status: 500 });
    }

    const text = block.text.trim();
    let parsed: GenerateResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      const fenceStripped = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(fenceStripped);
    }

    if (
      typeof parsed.whyItMatters !== 'string' ||
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.flashcards)
    ) {
      throw new Error('Response JSON did not match expected shape');
    }

    // Persist to Supabase
    const supabase = await createClient();

    await db.updateLessonGenerated(supabase, lessonId, {
      why_it_matters: parsed.whyItMatters,
      generated_at: new Date().toISOString(),
    });

    await db.deleteFlashcardsForLesson(supabase, lessonId);
    await db.deleteQuestionsForLesson(supabase, lessonId);

    await db.insertFlashcards(
      supabase,
      parsed.flashcards.map((c) => ({
        lesson_id: lessonId,
        front: c.front,
        back: c.back,
        source_anchor: c.source_anchor ?? null,
      }))
    );

    await db.insertQuestions(
      supabase,
      parsed.questions.map((q) => ({
        lesson_id: lessonId,
        question_type: q.question_type,
        stem: q.stem,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
        source_anchor: q.source_anchor ?? null,
      }))
    );

    return NextResponse.json({ ok: true, whyItMatters: parsed.whyItMatters });
  } catch (err) {
    console.error('[generate]', err);
    const message = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
