'use client';

import { createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const OrderedCtx = createContext(false);

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-serif text-2xl font-semibold text-ink mb-4 mt-8 leading-snug">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-xl font-semibold text-ink mb-3 mt-8 pb-2 border-b border-rule leading-snug">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-serif text-base font-semibold text-ink mb-2 mt-6 leading-snug">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="font-sans text-[15px] text-ink leading-[1.7] mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <OrderedCtx.Provider value={false}>
      <ul className="mb-4 space-y-2">{children}</ul>
    </OrderedCtx.Provider>
  ),
  ol: ({ children }) => (
    <OrderedCtx.Provider value={true}>
      <ol className="mb-4 space-y-2 list-decimal ml-5 font-sans text-[15px] text-ink leading-[1.7]">{children}</ol>
    </OrderedCtx.Provider>
  ),
  li: ({ children }) => {
    const ordered = useContext(OrderedCtx);
    if (ordered) {
      return <li className="font-sans text-[15px] text-ink leading-[1.7]">{children}</li>;
    }
    return (
      <li className="flex items-start gap-2.5 font-sans text-[15px] text-ink leading-[1.7]">
        <span className="mt-[0.55em] shrink-0 w-1 h-1 rounded-full bg-accent opacity-70" />
        <span>{children}</span>
      </li>
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-accent bg-accent-soft px-4 py-3 rounded-r-md my-4">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="font-mono text-[13px] bg-accent-soft text-accent px-1.5 py-0.5 rounded">{children}</code>
  ),
  hr: () => <hr className="border-rule my-6" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-6 rounded-md border border-rule">
      <table className="w-full border-collapse text-sm font-sans">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-rule last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-2 bg-paper border-b border-rule">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-4 py-2.5 text-ink-2 leading-relaxed">{children}</td>,
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="max-w-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
