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

// ── Response types ────────────────────────────────────────────────────────────

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

export interface ByExpiryRow {
  expiration: string;
  daysToExp: number;
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
}

export interface MaxPainStrike {
  strike: number;
  totalPain: number;
  callPain: number;
  putPain: number;
}

export interface MaxPainData {
  expiration: string;
  maxPainStrike: number;
  currentPrice: number;
  strikes: MaxPainStrike[];
}

export interface SentimentRow {
  expiration: string;
  daysToExp: number;
  atmCallIV: number | null;
  atmPutIV: number | null;
  putCallSkew: number | null;   // putIV - callIV (positive = bearish)
  pcVolRatio: number | null;    // putVol / callVol
  impliedMove: number | null;   // avg ATM IV * sqrt(dte/365)
}

export interface StockAgg {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionsApiResponse {
  ticker: string;
  underlyingPrice: number;
  ivSurface: OptionSnapshot[];
  byExpiry: ByExpiryRow[];
  maxPain: MaxPainData | null;
  sentiment: SentimentRow[];
  stockAggs: StockAgg[];
  count: number;
}

// ── Polygon helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function daysUntil(dateStr: string): number {
  return (new Date(dateStr + "T16:00:00-05:00").getTime() - Date.now()) / 86400000;
}

async function fetchAllContracts(ticker: string): Promise<Raw[]> {
  const results: Raw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
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

async function fetchNearExpiryContracts(ticker: string, expiration: string): Promise<Raw[]> {
  // Targeted fetch for a specific expiry to get all strikes (for accurate max pain)
  const results: Raw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${BASE}/v3/snapshot/options/${ticker}`);
    url.searchParams.set("apiKey", API_KEY);
    url.searchParams.set("expiration_date", expiration);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) break;
    const data = await res.json();
    if (data.results?.length) results.push(...data.results);
    cursor = data.next_url ? new URL(data.next_url).searchParams.get("cursor") : null;
    if (!cursor) break;
  }
  return results;
}

async function fetchStockAggs(ticker: string): Promise<StockAgg[]> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const url = new URL(`${BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`);
  url.searchParams.set("apiKey", API_KEY);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "30");
  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: Raw) => ({
    date: new Date(r.t).toISOString().slice(0, 10),
    open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
  }));
}

// ── Max pain computation ──────────────────────────────────────────────────────

function computeMaxPain(contracts: Raw[], underlyingPrice: number, expiration: string): MaxPainData {
  const byStrike = new Map<number, { callOI: number; putOI: number }>();

  for (const c of contracts) {
    const strike: number = c.details?.strike_price;
    const type: string = c.details?.contract_type;
    const oi: number = c.open_interest ?? 0;
    if (!strike || !type || oi <= 0) continue;
    const entry = byStrike.get(strike) ?? { callOI: 0, putOI: 0 };
    if (type === "call") entry.callOI += oi;
    else entry.putOI += oi;
    byStrike.set(strike, entry);
  }

  const strikes = [...byStrike.keys()].sort((a, b) => a - b);

  const strikeData: MaxPainStrike[] = strikes.map((testK) => {
    let callPain = 0, putPain = 0;
    for (const [k, { callOI, putOI }] of byStrike) {
      if (testK > k) callPain += (testK - k) * callOI * 100;    // ITM calls
      if (testK < k) putPain += (k - testK) * putOI * 100;      // ITM puts
    }
    return { strike: testK, totalPain: callPain + putPain, callPain, putPain };
  });

  const maxPainStrike = strikeData.reduce((a, b) => a.totalPain < b.totalPain ? a : b).strike;

  return { expiration, maxPainStrike, currentPrice: underlyingPrice, strikes: strikeData };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase()?.trim();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  // Fetch options chain + stock aggs in parallel
  let raw: Raw[], stockAggs: StockAgg[];
  try {
    [raw, stockAggs] = await Promise.all([
      fetchAllContracts(ticker),
      fetchStockAggs(ticker),
    ]);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (!raw.length) {
    return NextResponse.json({ error: `No options data found for "${ticker}"` }, { status: 404 });
  }

  const underlyingPrice: number = raw[0]?.underlying_asset?.price ?? 0;

  // ── Loop C: byExpiry aggregation (all contracts, unfiltered) ──────────────
  const expiryMap = new Map<string, ByExpiryRow>();
  for (const c of raw) {
    const exp: string = c.details?.expiration_date;
    if (!exp) continue;
    const type: string = c.details?.contract_type;
    const vol: number = c.day?.volume ?? 0;
    const oi: number = c.open_interest ?? 0;
    const dte = daysUntil(exp);
    if (dte < 0) continue;

    const row = expiryMap.get(exp) ?? { expiration: exp, daysToExp: dte, callVolume: 0, putVolume: 0, callOI: 0, putOI: 0 };
    if (type === "call") { row.callVolume += vol; row.callOI += oi; }
    else if (type === "put") { row.putVolume += vol; row.putOI += oi; }
    expiryMap.set(exp, row);
  }
  const byExpiry = [...expiryMap.values()].sort((a, b) => a.daysToExp - b.daysToExp);

  // ── Find nearest expiry + fetch full chain for max pain ────────────────────
  const nearestExpiry = byExpiry[0]?.expiration ?? null;
  let maxPain: MaxPainData | null = null;
  if (nearestExpiry) {
    const nearRaw = await fetchNearExpiryContracts(ticker, nearestExpiry);
    const allNear = nearRaw.length > 0 ? nearRaw : raw.filter(c => c.details?.expiration_date === nearestExpiry);
    maxPain = computeMaxPain(allNear, underlyingPrice, nearestExpiry);
  }

  // ── Loop A: ivSurface (moneyness-filtered + IV calculated) ────────────────
  const ivSurface: OptionSnapshot[] = [];
  for (const c of raw) {
    const strike: number = c.details?.strike_price;
    const exp: string = c.details?.expiration_date;
    const type: string = c.details?.contract_type;
    const S = underlyingPrice;
    if (!strike || !exp || !type || !S) continue;
    if (type !== "call" && type !== "put") continue;

    const bid: number | null = c.last_quote?.bid ?? null;
    const ask: number | null = c.last_quote?.ask ?? null;
    const dayClose: number | null = c.day?.close ?? null;
    const lastTrade: number | null = c.last_trade?.price ?? null;

    let optionPrice: number | null = null;
    if (bid != null && ask != null && bid > 0 && ask > bid) optionPrice = (bid + ask) / 2;
    else if (dayClose != null && dayClose > 0) optionPrice = dayClose;
    else if (lastTrade != null && lastTrade > 0) optionPrice = lastTrade;
    if (!optionPrice) continue;

    const moneyness = strike / S;
    if (moneyness < 0.6 || moneyness > 1.7) continue;
    const dte = daysUntil(exp);
    if (dte < 1) continue;

    const iv = calcIV(S, strike, dte / 365, optionPrice, type === "call");
    if (iv == null) continue;

    ivSurface.push({
      strike, expiration: exp, type: type as "call" | "put",
      optionPrice, underlyingPrice: S, iv,
      volume: c.day?.volume ?? 0,
      openInterest: c.open_interest ?? 0,
      moneyness, daysToExp: dte,
    });
  }

  // ── Sentiment pass: per expiry ATM call/put IV + P/C skew ─────────────────
  // Build per-expiry lookup from ivSurface
  const surfaceByExpiry = new Map<string, OptionSnapshot[]>();
  for (const s of ivSurface) {
    const list = surfaceByExpiry.get(s.expiration) ?? [];
    list.push(s);
    surfaceByExpiry.set(s.expiration, list);
  }

  // Build byExpiry vol lookup for P/C ratio
  const expiryVolLookup = new Map(byExpiry.map(r => [r.expiration, r]));

  const sentiment: SentimentRow[] = [];
  for (const [exp, contracts] of surfaceByExpiry) {
    const dte = contracts[0].daysToExp;
    // Find ATM strike
    const atmStrike = contracts.reduce((a, b) =>
      Math.abs(a.strike - underlyingPrice) < Math.abs(b.strike - underlyingPrice) ? a : b
    ).strike;

    const atmCall = contracts.find(c => c.type === "call" && c.strike === atmStrike);
    const atmPut = contracts.find(c => c.type === "put" && c.strike === atmStrike);

    const atmCallIV = atmCall?.iv ?? null;
    const atmPutIV = atmPut?.iv ?? null;
    const putCallSkew = atmCallIV != null && atmPutIV != null ? atmPutIV - atmCallIV : null;

    const avgIV = atmCallIV != null && atmPutIV != null
      ? (atmCallIV + atmPutIV) / 2
      : (atmCallIV ?? atmPutIV);
    const impliedMove = avgIV != null ? avgIV * Math.sqrt(dte / 365) : null;

    const vol = expiryVolLookup.get(exp);
    const pcVolRatio = vol && vol.callVolume > 0 ? vol.putVolume / vol.callVolume : null;

    sentiment.push({ expiration: exp, daysToExp: dte, atmCallIV, atmPutIV, putCallSkew, pcVolRatio, impliedMove });
  }
  sentiment.sort((a, b) => a.daysToExp - b.daysToExp);

  const response: OptionsApiResponse = {
    ticker,
    underlyingPrice,
    ivSurface,
    byExpiry,
    maxPain,
    sentiment,
    stockAggs,
    count: ivSurface.length,
  };

  return NextResponse.json(response);
}
