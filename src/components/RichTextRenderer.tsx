import { Check, Copy } from 'lucide-react';
import { Fragment, useState } from 'react';

interface RichTextRendererProps {
  content: string;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div dir="ltr" className="my-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-900 text-neutral-100 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-[11px] font-mono text-neutral-400">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-neutral-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineFormatting(line: string) {
  const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*|@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_-]+)/g);
  return tokens.map((tok, i) => {
    if (!tok) return null;
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-red-50 dark:bg-red-950/70 text-red-700 dark:text-red-300 font-mono text-[12px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold text-neutral-900 dark:text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('@')) {
      return (
        <span
          key={i}
          className="px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-medium"
        >
          {tok}
        </span>
      );
    }
    if (tok.startsWith('#') && tok.length > 1) {
      return (
        <span key={i} className="text-red-600 dark:text-red-400 font-medium">
          {tok}
        </span>
      );
    }
    return <Fragment key={i}>{tok}</Fragment>;
  });
}

export function RichTextRenderer({ content }: RichTextRendererProps) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 space-y-1.5 break-words">
      {segments.map((seg, idx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline === -1 ? '' : inner.slice(0, firstNewline).trim();
          const code = firstNewline === -1 ? inner : inner.slice(firstNewline + 1);
          return <CodeBlock key={idx} code={code} lang={lang} />;
        }

        const lines = seg.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lIdx) => {
              if (!line.trim()) return <div key={lIdx} className="h-1" />;
              if (line.startsWith('> ')) {
                return (
                  <blockquote
                    key={lIdx}
                    dir="auto"
                    className="ps-3 py-1 rounded border-s-2 border-red-500 bg-neutral-100/80 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300 text-xs italic"
                  >
                    {renderInlineFormatting(line.slice(2))}
                  </blockquote>
                );
              }
              return (
                <p key={lIdx} dir="auto">
                  {renderInlineFormatting(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
