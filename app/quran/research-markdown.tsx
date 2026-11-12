import type { ReactNode } from "react";
import styles from "./quran.module.css";

// No HTML injection, external links or third-party dependencies. Supports the
// Markdown emitted by the research models: headings, emphasis, lists and code.
function inlineMarkdown(value: string): ReactNode[] {
  const tokens = value.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    return token;
  });
}

export function ResearchMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*---+\s*$/.test(line)) { blocks.push(<hr key={i} />); i++; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      if (heading[1].length < 3) blocks.push(<h2 key={i}>{inlineMarkdown(heading[2])}</h2>);
      else blocks.push(<h3 key={i}>{inlineMarkdown(heading[2])}</h3>);
      i++; continue;
    }
    if (/^\s*>\s?/.test(line)) {
      blocks.push(<blockquote key={i}>{inlineMarkdown(line.replace(/^\s*>\s?/, ""))}</blockquote>);
      i++; continue;
    }
    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const start = i;
      const entries: ReactNode[] = [];
      while (i < lines.length && (unordered ? /^\s*[-*+]\s+/.test(lines[i]) : /^\s*\d+[.)]\s+/.test(lines[i]))) {
        entries.push(<li key={i}>{inlineMarkdown(lines[i].replace(unordered ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/, ""))}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={start}>{entries}</ol> : <ul key={start}>{entries}</ul>);
      continue;
    }
    // Preserve meaningful line boundaries without exposing raw Markdown syntax.
    const start = i;
    const para: ReactNode[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^\s*>\s?|^\s*---+\s*$/.test(lines[i])) {
      if (para.length) para.push(" ");
      para.push(...inlineMarkdown(lines[i]));
      i++;
    }
    if (para.length) blocks.push(<p key={start}>{para}</p>);
    else i++;
  }
  return <div className={styles.markdown}>{blocks}</div>;
}
