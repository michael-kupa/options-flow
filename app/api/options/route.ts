import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.POLYGON_API_KEY!;
const BASE = "https://api.polygon.io";

// ── Black-Scholes IV ──────────────────────────────────────────────────────────

function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const t = 1 / (1 + p * Math.abs(x));
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const val = 1 - poly * Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
  return 0.5 * (1 + sign * (2 * val - 1));
}

function normPDF(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

function bsPrice(S: number, K: number, T: number, r: number, v: number, call: boolean): number {
  if (T <= 0 || v <= 0) return Math.max(0, call ? S - K : K - S);
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * sq);
  const d2 = d1 - v * sq;
  return call
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function bsVega(S: number, K: number, T: number, r: number, v: number): number {
  if (T <= 0 || v <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * Math.sqrt(T));
  return S * Math.sqrt(T) * normPDF(d1);
}

const R = 0.045;

function calcIV(S: number, K: number, T: number, price: number, call: boolean): number | null {
  if (T <= 0 || price <= 0) return null;
  const intrinsic = Math.max(0, call ? S - K : K - S);
  if (price <= intrinsic) return null;

  let v = 0.5;
  for (let i = 0; i < 200; i++) {
    const diff = bsPrice(S, K, T, R, v, call) - price;
    if (Math.abs(diff) < 0.0001) break;
    const vega = bsVega(S, K, T, R, v);
    if (Math.abs(vega) < 1e-10) { v = Math.min(v * 1.5, 4); continue; }
    v -= diff / vega;
    if (v <= 0.001) v = 0.001;
    if (v > 10) return null;
  }
  return v < 0.01 || v > 5 ? null : v;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptionSnapshot {
  strike: number;
  expiration: string;
  type: "call" | "put";
  optionPrice: number;
  underlyingPrice: number;
  iv: number;
  volume: number;
  openInterest: number;
  moneyness: number;
  daysToExp: number;
}

// ── Polygon helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawContract = Record<string, any>;

function daysUntil(dateStr: string): number {
  const exp = new Date(dateStr + "T16:00:00-05:00");
  return (exp.getTime() - Date.now()) / 86400000;
}

async function fetchAllContracts(ticker: string): Promise<RawContract[]> {
  const results: RawContract[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 6; page++) {
    const url = new URL(`${BASE}/v3/snapshot/options/${ticker}`);
    url.searchParams.set("apiKey", API_KEY);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Polygon ${res.status}: ${body?.error ?? body?.message ?? "unknown"}`);
    }

    const data = await res.json();
    if (data.results?.length) results.push(...data.results);
    cursor = data.next_url ? new URL(data.next_url).searchParams.get("cursor") : null;
    if (!cursor) break;
  }

  return results;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase()?.trim();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  let raw: RawContract[];
  try {
    raw = await fetchAllContracts(ticker);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (!raw.length) {
    return NextResponse.json({ error: `No options data found for "${ticker}"` }, { status: 404 });
  }

  const results: OptionSnapshot[] = [];

  for (const c of raw) {
    const strike: number = c.details?.strike_price;
    const expiration: string = c.details?.expiration_date;
    const type: string = c.details?.contract_type;
    const S: number = c.underlying_asset?.price;

    if (!strike || !expiration || !type || !S) continue;
    if (type !== "call" && type !== "put") continue;

    // Use bid/ask midpoint if present, otherwise day close, otherwise last trade
    const bid: number | null = c.last_quote?.bid ?? null;
    const ask: number | null = c.last_quote?.ask ?? null;
    const dayClose: number | null = c.day?.close ?? null;
    const lastTrade: number | null = c.last_trade?.price ?? null;

    let optionPrice: number | null = null;
    if (bid != null && ask != null && bid > 0 && ask > bid) {
      optionPrice = (bid + ask) / 2;
    } else if (dayClose != null && dayClose > 0) {
      optionPrice = dayClose;
    } else if (lastTrade != null && lastTrade > 0) {
      optionPrice = lastTrade;
    }

    if (!optionPrice) continue;

    // Moneyness filter: keep 60%–170% of spot (cleaner surface, fewer outliers)
    const moneyness = strike / S;
    if (moneyness < 0.6 || moneyness > 1.7) continue;

    const dte = daysUntil(expiration);
    if (dte < 1) continue; // skip expiring today or already expired

    const iv = calcIV(S, strike, dte / 365, optionPrice, type === "call");
    if (iv == null) continue;

    results.push({
      strike,
      expiration,
      type: type as "call" | "put",
      optionPrice,
      underlyingPrice: S,
      iv,
      volume: c.day?.volume ?? 0,
      openInterest: c.open_interest ?? 0,
      moneyness,
      daysToExp: dte,
    });
  }

  return NextResponse.json({ results, count: results.length });
}
