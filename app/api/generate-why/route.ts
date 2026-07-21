import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You produce a "Why It Matters" explainer for NMLS Mortgage Loan Originator exam content.

Given the lesson notes, write a plain-language causal story that explains WHY each institution, law, date, or concept exists — the problem it was solving and the cause-and-effect that makes it make sense. Connect ideas to each other. Tie everything to why it matters for a mortgage loan originator and the NMLS exam. Prioritize understanding over coverage. Aim for 3–5 paragraphs of flowing prose (no bullet lists).

Return strict JSON only — no markdown fences, no preamble:
{ "whyItMatters": "markdown string" }`;

export type GenerateWhyResponse = { whyItMatters: string };

export async function POST(request: NextRequest) {
  try {
    const { notesMarkdown, title, chapter } = await request.json() as {
      notesMarkdown: string;
      title: string;
      chapter?: string | null;
    };

    if (!notesMarkdown?.trim()) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 });
    }

    const label = chapter ? `${chapter} — ${title}` : title;
    const userMessage = `Lesson: ${label}\n\n${notesMarkdown.trim()}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const block = message.content[0];
    if (block.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type from model' }, { status: 500 });
    }

    const text = block.text.trim();
    let parsed: GenerateWhyResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      const fenceStripped = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(fenceStripped);
    }

    if (typeof parsed.whyItMatters !== 'string') {
      throw new Error('Response did not contain whyItMatters string');
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[generate-why]', err);
    const message = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
