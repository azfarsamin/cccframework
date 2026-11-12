import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Word = {
  position?: number;
  char_type_name?: string;
  translation?: { text?: string } | string;
};
type VersePayload = {
  verse?: { words?: Word[] };
  verses?: { words?: Word[] }[];
  words?: Word[];
};

function extractMeanings(payload: VersePayload): string[] | null {
  const words = payload?.verse?.words ?? payload?.verses?.[0]?.words ?? payload?.words;
  if (!Array.isArray(words) || !words.length) return null;
  const meanings = words
    .filter((w) => w.char_type_name !== "end")
    .map((w) => {
      const value = typeof w.translation === "string" ? w.translation : w.translation?.text;
      return typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim() : "";
    });
  return meanings.some(Boolean) ? meanings : null;
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("verse") || "";
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(reference);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 114 || Number(match[2]) < 1) {
    return NextResponse.json({ error: "Invalid verse reference" }, { status: 400 });
  }

  // The public QuranCDN API is tried first. The Quran.com website proxy is a fallback.
  const sources = [
    `https://api.qurancdn.com/api/qdc/verses/by_key/${reference}?words=true&language=en`,
    `https://quran.com/api/proxy/content/api/qdc/verses/by_key/${reference}?words=true&language=en`,
  ];
  const failures: string[] = [];
  for (const [index, url] of sources.entries()) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        failures.push(`source ${index + 1}: HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as VersePayload;
      const meanings = extractMeanings(payload);
      if (meanings) {
        return NextResponse.json({
          meanings,
          source: "Quran.com / QuranCDN word-by-word English",
        });
      }
      failures.push(`source ${index + 1}: no word glosses in response`);
    } catch (error) {
      failures.push(`source ${index + 1}: ${error instanceof Error ? error.name : "fetch failure"}`);
    }
  }
  console.warn("Word-gloss providers unavailable", { reference, failures });
  return NextResponse.json(
    { error: "Word gloss source unavailable", details: failures },
    { status: 502 }
  );
}
