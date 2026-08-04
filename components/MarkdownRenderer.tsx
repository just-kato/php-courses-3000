'use client';

import { createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const OrderedCtx = createContext(false);

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-[22px] font-medium text-fg mb-4 mt-8 leading-snug tracking-[-0.02em]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[18px] font-medium text-fg mb-3 mt-8 pb-2 leading-snug tracking-[-0.02em]"
      style={{ borderBottom: '1px solid var(--color-divider)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[15px] font-medium text-fg mb-2 mt-6 leading-snug">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-[16px] text-fg leading-[1.75] mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <OrderedCtx.Provider value={false}>
      <ul className="mb-4 space-y-2">{children}</ul>
    </OrderedCtx.Provider>
  ),
  ol: ({ children }) => (
    <OrderedCtx.Provider value={true}>
      <ol className="mb-4 space-y-2 list-decimal ml-5 text-[16px] text-fg leading-[1.75]">{children}</ol>
    </OrderedCtx.Provider>
  ),
  li: ({ children }) => {
    const ordered = useContext(OrderedCtx);
    if (ordered) {
      return <li className="text-[16px] text-fg leading-[1.75]">{children}</li>;
    }
    return (
      <li className="flex items-start gap-3 text-[16px] text-fg leading-[1.75]">
        <span
          className="mt-2.5 shrink-0 w-1 h-1 rounded-sm"
          style={{ background: 'var(--color-accent)' }}
        />
        <span>{children}</span>
      </li>
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote
      className="rounded-r-lg px-4 py-3 my-4"
      style={{
        background: 'var(--color-n900)',
        boxShadow: 'inset 2px 0 0 var(--color-accent)',
      }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code
      className="font-mono text-[13px] px-1.5 py-0.5 rounded"
      style={{ background: 'var(--color-accent-dk)', color: 'var(--color-accent-md)' }}
    >
      {children}
    </code>
  ),
  hr: () => <hr className="my-6" style={{ borderColor: 'var(--color-divider)' }} />,
  table: ({ children }) => (
    <div
      className="overflow-x-auto mb-6 rounded-lg"
      style={{ border: '1px solid var(--color-divider)' }}
    >
      <table className="w-full border-collapse text-sm font-sans">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid var(--color-divider)' }}
      className="last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-n600"
      style={{ borderBottom: '1px solid var(--color-divider)', background: 'var(--color-n900)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-4 py-2.5 text-n400 leading-relaxed">{children}</td>,
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
