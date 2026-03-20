import { NextRequest, NextResponse } from "next/server";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!;
const BASE_URL = "https://api.polygon.io";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawContract = Record<string, any>;

export interface OptionSnapshot {
  strike: number;
  expiration: string;
  type: "call" | "put";
  optionPrice: number;   // midpoint or last close
  underlyingPrice: number;
  bid: number | null;
  ask: number | null;
  volume: number;
  openInterest: number;
}

function extractSnapshot(c: RawContract): OptionSnapshot | null {
  const strike = c.details?.strike_price;
  const expiration = c.details?.expiration_date;
  const type = c.details?.contract_type;
  const underlyingPrice = c.underlying_asset?.price;

  if (!strike || !expiration || !type || !underlyingPrice) return null;
  if (type !== "call" && type !== "put") return null;

  const bid: number | null = c.last_quote?.bid ?? null;
  const ask: number | null = c.last_quote?.ask ?? null;
  const lastClose: number | null = c.day?.close ?? null;
  const lastTrade: number | null = c.last_trade?.price ?? null;

  // Prefer bid/ask midpoint → last close → last trade
  let optionPrice: number | null = null;
  if (bid != null && ask != null && bid > 0 && ask > 0) {
    optionPrice = (bid + ask) / 2;
  } else if (lastClose != null && lastClose > 0) {
    optionPrice = lastClose;
  } else if (lastTrade != null && lastTrade > 0) {
    optionPrice = lastTrade;
  }

  if (!optionPrice) return null;

  return {
    strike,
    expiration,
    type,
    optionPrice,
    underlyingPrice,
    bid,
    ask,
    volume: c.day?.volume ?? 0,
    openInterest: c.open_interest ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const raw: RawContract[] = [];
  let cursor: string | null = null;
  let pages = 0;

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
    if (data.results) raw.push(...data.results);
    cursor = data.next_url
      ? new URL(data.next_url).searchParams.get("cursor")
      : null;
    pages++;
    if (!cursor) break;
  }

  const results = raw.map(extractSnapshot).filter(Boolean) as OptionSnapshot[];
  return NextResponse.json({ results, count: results.length });
}
