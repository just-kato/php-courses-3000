import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are helping create study material for the NMLS Mortgage Loan Originator licensing exam. Given raw lesson text, produce:

1. Clean markdown study notes with tables for any dates/dollar thresholds and bold key terms
2. A "Why It Matters" explainer: 3–5 paragraphs of plain-language causal prose. For each institution, law, date, or concept, explain the problem it solved and the cause-and-effect that makes it make sense. Connect ideas. Tie to why it matters for a mortgage loan originator. No bullet lists — flowing prose only.
3. Flashcards phrased description→answer so they test recall in the exam's direction
4. Exam-style multiple-choice questions with one correct answer and a brief explanation for each

Focus on testable details: dates, agency responsibilities, dollar thresholds, timing rules. Aim for 8–15 flashcards and 4–8 quiz questions per lesson. Return strict JSON only — no markdown fences, no preamble, no trailing text.

The JSON shape must be exactly:
{
  "notesMarkdown": "string",
  "whyItMatters": "string",
  "flashcards": [{ "question": "string", "answer": "string" }],
  "quizQuestions": [{ "prompt": "string", "choices": ["string", "string", "string", "string"], "correctIndex": 0, "explanation": "string" }]
}`;

export type GenerateResponse = {
  notesMarkdown: string;
  whyItMatters: string;
  flashcards: Array<{ question: string; answer: string }>;
  quizQuestions: Array<{
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const { title, chapter, rawContent } = await request.json() as {
      title: string;
      chapter: string;
      rawContent: string;
    };

    if (!rawContent?.trim()) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 });
    }

    const userMessage = `Lesson: ${chapter} — ${title}\n\n${rawContent.trim()}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
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
      // Sometimes the model adds a markdown fence despite the instruction; strip it
      const fenceStripped = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(fenceStripped);
    }

    if (
      typeof parsed.notesMarkdown !== 'string' ||
      typeof parsed.whyItMatters !== 'string' ||
      !Array.isArray(parsed.flashcards) ||
      !Array.isArray(parsed.quizQuestions)
    ) {
      throw new Error('Response JSON did not match expected shape');
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[generate]', err);
    const message = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
