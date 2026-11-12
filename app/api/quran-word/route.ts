import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Contextual word-by-word meanings only. Morphological data remains separate.
type ProviderWord = {
  position?: number;
  char_type_name?: string;
  translation?: { text?: string };
};
type ProviderVerse = { verse?: { words?: ProviderWord[] } };

export async function GET(request: NextRequest) {
  const verse = request.nextUrl.searchParams.get("verse") || "";
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(verse);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 114 || Number(match[2]) < 1) {
    return NextResponse.json({ error: "Invalid verse reference" }, { status: 400 });
  }
  try {
    const upstream = await fetch(
      `https://quran.com/api/proxy/content/api/qdc/verses/by_key/${encodeURIComponent(verse)}?words=true&language=en`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) }
    );
    if (!upstream.ok) throw new Error(`Word source HTTP ${upstream.status}`);
    const payload = await upstream.json() as ProviderVerse;
    const words = payload?.verse?.words;
    if (!Array.isArray(words) || words.length === 0) throw new Error("No words in source response");
    const meanings = words
      .filter(w => w.char_type_name !== "end")
      .map(w => (typeof w.translation?.text === "string" ? w.translation.text.replace(/<[^>]*>/g, "").trim() : ""));
    return NextResponse.json({ meanings, source: "Quran.com word-by-word English" });
  } catch {
    return NextResponse.json({ error: "Word-by-word translations are currently unavailable" }, { status: 502 });
  }
}
