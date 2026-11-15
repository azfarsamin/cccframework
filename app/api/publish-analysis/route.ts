import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureMatch(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function githubUrl(repo: string, file: string, branch: string) {
  return `https://api.github.com/repos/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`;
}
function headers(token: string) {
  return { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
}

type Version = { version: number; publishedAt: string; content: string; evidenceAudit?: unknown; argumentAudit?: unknown; auditReport?: unknown; unsuppliedReferences?: string[] };
type PublishedDocument = { reference: string; version: number; publishedAt: string; content: string; history: Version[] };

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const githubToken = process.env.CCC_PUBLISH_GITHUB_TOKEN;
  const repo = process.env.CCC_PUBLISH_GITHUB_REPO;
  const branch = process.env.CCC_PUBLISH_GITHUB_BRANCH || "main";
  if (!passcode || !githubToken || !repo) return NextResponse.json({ error: "Publication credentials are not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(branch)) return NextResponse.json({ error: "Invalid publication repository configuration" }, { status: 503 });
  const data = await req.json().catch(() => null);
  const { reference, content } = data || {};
  if (typeof reference !== "string" || !/^(?:[1-9]|[1-9]\d|1(?:0\d|1[0-4])):[1-9]\d{0,2}$/.test(reference) || typeof content !== "string" || content.trim().length < 150 || content.length > 140000)
    return NextResponse.json({ error: "Invalid verse or publication content" }, { status: 400 });
  const [surah, ayah] = reference.split(":").map(Number);
  const filePath = `public/published-analyses/${surah}/${ayah}.json`;
  const url = githubUrl(repo, filePath, branch);
  const h = headers(githubToken);
  try {
    const existingResponse = await fetch(url, { headers: h, cache: "no-store" });
    let sha: string | undefined;
    let existing: PublishedDocument | null = null;
    if (existingResponse.ok) {
      const gitFile = await existingResponse.json() as { sha: string; content: string; encoding: string };
      if (gitFile.encoding !== "base64") throw new Error("Unsupported repository file encoding");
      sha = gitFile.sha;
      existing = JSON.parse(Buffer.from(gitFile.content.replace(/\s/g, ""), "base64").toString("utf8")) as PublishedDocument;
      if (existing.reference !== reference || !Array.isArray(existing.history)) throw new Error("Existing publication has an unexpected format");
    } else if (existingResponse.status !== 404) {
      throw new Error(`Repository read failed: HTTP ${existingResponse.status}`);
    }
    const version = (existing?.version || 0) + 1;
    const publishedAt = new Date().toISOString();
    const versionRecord: Version = {
      version, publishedAt, content,
      evidenceAudit: data.evidenceAudit ?? null,
      argumentAudit: data.argumentAudit ?? null,
      auditReport: data.auditReport ?? null,
      unsuppliedReferences: Array.isArray(data.unsuppliedReferences) ? data.unsuppliedReferences.slice(0, 100) : [],
    };
    const doc: PublishedDocument = { reference, version, publishedAt, content, history: [...(existing?.history || []), versionRecord] };
    const result = await fetch(url.replace(/\?ref=.*$/, ""), {
      method: "PUT", headers: h, cache: "no-store",
      body: JSON.stringify({ message: `Publish CCC analysis ${reference} v${version}`, branch, ...(sha ? { sha } : {}), content: Buffer.from(JSON.stringify(doc, null, 2), "utf8").toString("base64") }),
    });
    if (!result.ok) {
      const detail = await result.text();
      throw new Error(`Repository publish failed: HTTP ${result.status} ${detail.slice(0, 250)}`);
    }
    return NextResponse.json({ reference, version, publishedAt, committed: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Publication failed" }, { status: 502 });
  }
}
