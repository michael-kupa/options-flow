import { NextRequest, NextResponse } from "next/server";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!;
const BASE_URL = "https://api.polygon.io";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const results: unknown[] = [];
  let cursor: string | null = null;
  let pages = 0;

  // Fetch up to 5 pages (250 contracts) to keep it fast
  while (pages < 5) {
    const url = new URL(`${BASE_URL}/v3/snapshot/options/${ticker}`);
    url.searchParams.set("apiKey", POLYGON_API_KEY);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { next: { revalidate: 30 } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Polygon error: ${res.status}`, details: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    if (data.results) results.push(...data.results);
    cursor = data.next_url
      ? new URL(data.next_url).searchParams.get("cursor")
      : null;
    pages++;
    if (!cursor) break;
  }

  return NextResponse.json({ results, count: results.length });
}
