import type { ReactNode } from "react";
import styles from "./quran.module.css";
import pdfRegistry from "./generated-pdf-registry.json";

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


// Build-time registry: only PDFs actually present in public/pdfs receive links.
// Known aliases cover abbreviated filenames; newly added PDFs are discovered
// automatically when Vercel rebuilds. Ambiguous titles remain plain text.
type PdfSource = { file: string; title: string; aliases: string[] };
const availablePdfSources: PdfSource[] = pdfRegistry.sources;

function normalizePublicationTitle(value: string): string {
  return value.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ʾʿ‘’'`]/g, "").replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:pdf|freepdf|edition|ed|second|third|2022|2026)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

function findPdfSource(text: string): PdfSource | undefined {
  const normalized = normalizePublicationTitle(text);
  if (!normalized) return undefined;
  // Search for a complete title/alias at the start of the bibliographic line.
  // Longest match wins; ties between different files are treated as ambiguous.
  const candidates = availablePdfSources.flatMap(source =>
    source.aliases.map(alias => ({ source, normalizedAlias: normalizePublicationTitle(alias) })))
    .filter(({ normalizedAlias }) => normalizedAlias.length >= 12 &&
      (normalized === normalizedAlias || normalized.startsWith(normalizedAlias + " ")))
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);
  if (!candidates.length) return undefined;
  if (candidates.length > 1 && candidates[0].normalizedAlias.length === candidates[1].normalizedAlias.length &&
      candidates[0].source.file !== candidates[1].source.file) return undefined;
  return candidates[0].source;
}

type ReadingSection = { name: string; pages: number[]; unpaged: boolean };
type ReadingGroup = { title: string; file?: string; sections: ReadingSection[] };

function readingGroups(lines: string[]): ReadingGroup[] {
  const groups: ReadingGroup[] = [];
  for (const raw of lines) {
    const text = raw.replace(/^\s*[-*+]\s+/, "").trim();
    if (!text) continue;
    const matched = findPdfSource(text);
    let title: string;
    let detail: string;
    if (matched) {
      title = matched.title;
      detail = text.replace(/^.*?\s+[—–]\s+/, "");
      // For author-prefixed book references, strip the full source prefix, not just the first em dash.
      const pageBreak = text.lastIndexOf(" — ");
      if (pageBreak >= 0) detail = text.slice(pageBreak + 3);
      if (detail === text) detail = "Relevant passages";
    } else {
      const split = text.indexOf(" — ");
      title = split >= 0 ? text.slice(0, split).trim() : text;
      detail = split >= 0 ? text.slice(split + 3).trim() : "Relevant passages";
    }
    detail = detail.replace(/\s*\[complete indexed section\]\s*/gi, "").trim();
    const pageMatch = /\[PDF\s+p\.\s*(\d+)\]/i.exec(detail);
    const page = pageMatch ? Number(pageMatch[1]) : undefined;
    detail = detail.replace(/\s*\[PDF\s+p\.\s*\d+\]\s*/gi, "").trim() || "Relevant passages";
    let group = groups.find(item => item.title === title);
    if (!group) { group = { title, file: matched?.file, sections: [] }; groups.push(group); }
    let section = group.sections.find(item => item.name === detail);
    if (!section) { section = { name: detail, pages: [], unpaged: false }; group.sections.push(section); }
    if (page !== undefined && !section.pages.includes(page)) section.pages.push(page);
    if (page === undefined) section.unpaged = true;
  }
  return groups;
}

function FurtherReading({ lines }: { lines: string[] }) {
  const groups = readingGroups(lines);
  return <div className={styles.furtherReadingSources}>
    {groups.map(group => {
      const firstPage = group.sections.flatMap(item => item.pages)[0];
      const fileUrl = group.file ? `/pdfs/${group.file}` : null;
      return <section key={group.title} className={styles.furtherReadingSource}>
        <div className={styles.furtherReadingSourceTitle}>
          {fileUrl ? <a href={firstPage ? `${fileUrl}#page=${firstPage}` : fileUrl} target="_blank" rel="noopener noreferrer" title="Open source PDF">{group.title}</a> : group.title}
        </div>
        <ul>{group.sections.map(section => <li key={section.name} className={styles.furtherReadingSection}>
          {section.name}
          {section.pages.length > 0 && <span> (PDF {section.pages.length === 1 ? "p." : "pp."} {section.pages.sort((a,b) => a-b).map((page, index) => <span key={page}>{index ? ", " : ""}{fileUrl ? <a href={`${fileUrl}#page=${page}`} target="_blank" rel="noopener noreferrer" title={`Open PDF page ${page}`}>{page}</a> : page}</span>)})</span>}
        </li>)}</ul>
      </section>;
    })}
  </div>;
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
      i++;
      // Group only the completed Further Reading list; preserve all other Markdown intact.
      if (/^(?:5[.)]\s*)?further reading\s*$/i.test(heading[2].trim())) {
        const entries: string[] = [];
        while (i < lines.length) {
          if (!lines[i].trim()) { i++; continue; }
          if (!/^\s*[-*+]\s+/.test(lines[i])) break;
          entries.push(lines[i]);
          i++;
        }
        if (entries.length) blocks.push(<FurtherReading key={`reading-${i}`} lines={entries} />);
      }
      continue;
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
