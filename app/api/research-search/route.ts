import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { searchResearch } from "../../../lib/research-retrieval";

export const runtime = "nodejs";
function equal(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
// Authenticated endpoint; never expose private research automatically.
export async function GET(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  if (!passcode) return NextResponse.json({ error: "Research passcode not configured" }, { status: 503 });
  if (!equal(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid research passcode" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").slice(0, 240);
  const ref = (searchParams.get("ref") || "").trim();
  if (!q && !ref) return NextResponse.json({ error: "Supply q or ref" }, { status: 400 });
  if (ref && !/^\d{1,3}:\d{1,3}$/.test(ref)) return NextResponse.json({ error: "Invalid verse reference" }, { status: 400 });
  try {
    const hits = await searchResearch(q, ref || undefined, 8);
    return NextResponse.json({ count: hits.length, hits });
  } catch {
    return NextResponse.json({ error: "Research index unavailable" }, { status: 503 });
  }
}
