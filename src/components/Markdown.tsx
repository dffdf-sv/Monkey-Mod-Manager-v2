import { Fragment, type ReactNode } from 'react';

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(source: string): ReactNode[] {
  const pattern = /(!\[[^\]]*\]\([^\)]+\)|\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\x60[^\x60]+\x60)/g;
  const output: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) output.push(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('![')) {
      const parts = /^!\[([^\]]*)\]\(([^\)]+)\)$/.exec(token);
      const url = parts ? safeUrl(parts[2]) : null;
      output.push(parts && url ? <img className="markdown-image" key={match.index} src={url} alt={parts[1]} loading="lazy" /> : token);
    } else if (token.startsWith('[')) {
      const parts = /^\[([^\]]+)\]\(([^\)]+)\)$/.exec(token);
      const url = parts ? safeUrl(parts[2]) : null;
      output.push(parts && url ? <a key={match.index} href={url} target={url.startsWith('#') ? undefined : '_blank'} rel={url.startsWith('#') ? undefined : 'noopener noreferrer'}>{inlineMarkdown(parts[1])}</a> : token);
    } else if (token.startsWith('``')) {
      output.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      output.push(<strong key={match.index}>{inlineMarkdown(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('~~')) {
      output.push(<del key={match.index}>{inlineMarkdown(token.slice(2, -2))}</del>);
    } else {
      output.push(<em key={match.index}>{inlineMarkdown(token.slice(1, -1))}</em>);
    }
    last = match.index + token.length;
  }
  if (last < source.length) output.push(source.slice(last));
  return output.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      const fence = line.trim().slice(0, 3);
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={blocks.length} className="markdown-code"><code data-language={language || undefined}>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const children = inlineMarkdown(heading[2]);
      if (level === 1) blocks.push(<h2 key={blocks.length}>{children}</h2>);
      else if (level === 2) blocks.push(<h3 key={blocks.length}>{children}</h3>);
      else if (level === 3) blocks.push(<h4 key={blocks.length}>{children}</h4>);
      else blocks.push(<h5 key={blocks.length}>{children}</h5>);
      i++; continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} />); i++; continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={blocks.length}>{quote.map((entry, index) => <p key={index}>{inlineMarkdown(entry)}</p>)}</blockquote>);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(<ul key={blocks.length}>{items.map((entry, index) => <li key={index}>{inlineMarkdown(entry)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={blocks.length}>{items.map((entry, index) => <li key={index}>{inlineMarkdown(entry)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*(---+|\*\*\*+|___+)\s*$|\s*```|\s*~~~)/.test(lines[i])) {
      paragraph.push(lines[i++]);
    }
    blocks.push(<p key={blocks.length}>{inlineMarkdown(paragraph.join('\n'))}</p>);
  }
  return <div className="markdown-body">{blocks}</div>;
}
