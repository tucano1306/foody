'use client';

import type { AnchorHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  readonly children: string;
  readonly className?: string;
}

function ExternalLink(props: Readonly<AnchorHTMLAttributes<HTMLAnchorElement>>) {
  const { children, href } = props;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS = {
  a: ExternalLink,
};

/**
 * Markdown renderer with GitHub-flavored markdown support.
 * Uses @tailwindcss/typography `prose` classes.
 */
export default function Markdown({ children, className }: Props) {
  return (
    <div
      className={`prose prose-sm prose-stone max-w-none prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 ${className ?? ''}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
