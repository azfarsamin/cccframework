/** Thin compatibility adapter. All stages, evidence and QA live in one engine. */
import { NextRequest, NextResponse } from "next/server";
import { runVerseAnalysis } from "../../../lib/analysis/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return runVerseAnalysis(request);
}

export async function GET() {
  return NextResponse.json({ service: "verse-analysis", status: "ready", version: "7.9.2" });
}
