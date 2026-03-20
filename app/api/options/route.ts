import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import zlib from "zlib";
import { Readable } from "stream";
import readline from "readline";

// ── S3 Client ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint: "https://files.massive.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MASSIVE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MASSIVE_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = "flatfiles";

// ── OCC Ticker Parser ──────────────────────────────────────────────────────────
// Format: O:{underlying}{YYMMDD}{C|P}{strike*1000 zero-padded to 8 digits}
// Example: O:TSLA230526C00193000 → TSLA, 2023-05-26, call, $193.00

interface ParsedOCC {
  underlying: string;
  expiration: string; // YYYY-MM-DD
  type: "call" | "put";
  strike: number;
}

function parseOCC(ticker: string): ParsedOCC | null {
  const match = ticker.match(/^O:([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;
  const [, underlying, yy, mm, dd, cp, strikePadded] = match;
  const expiration = `20${yy}-${mm}-${dd}`;
  const strike = parseInt(strikePadded, 10) / 1000;
  return { underlying, expiration, type: cp === "C" ? "call" : "put", strike };
}

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

function bsPrice(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, isCall ? S - K : K - S);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return isCall
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function bsVega(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * Math.sqrt(T) * normPDF(d1);
}

const RISK_FREE = 0.045;

function calcIV(S: number, K: number, T: number, price: number, isCall: boolean): number | null {
  if (T <= 0 || price <= 0 || S <= 0 || K <= 0) return null;
  const intrinsic = Math.max(0, isCall ? S - K : K - S);
  if (price <= intrinsic) return null;
  let sigma = 0.5;
  for (let i = 0; i < 200; i++) {
    const diff = bsPrice(S, K, T, RISK_FREE, sigma, isCall) - price;
    if (Math.abs(diff) < 0.0001) break;
    const vega = bsVega(S, K, T, RISK_FREE, sigma);
    if (Math.abs(vega) < 1e-10) { sigma *= 1.5; continue; }
    sigma -= diff / vega;
    if (sigma <= 0.001) sigma = 0.001;
    if (sigma > 10) return null;
  }
  return sigma <= 0.001 || sigma > 5 ? null : sigma;
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

// Find the most recent available date in the options day_aggs
async function findLatestDate(): Promise<string | null> {
  // Walk from the most recent year/month backwards
  const candidates = ["2023/05", "2023/04", "2023/03", "2023/02", "2023/01"];
  for (const ym of candidates) {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `us_options_opra/day_aggs_v1/${ym}/`,
      MaxKeys: 100,
    }));
    if (res.Contents?.length) {
      // Last file by key (keys are YYYY-MM-DD.csv.gz, lexicographic = date order)
      const last = res.Contents.sort((a, b) => (a.Key! > b.Key! ? 1 : -1)).pop();
      if (last?.Key) {
        const m = last.Key.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/);
        if (m) return m[1];
      }
    }
  }
  return null;
}

// Stream-parse a gzipped CSV from S3, calling rowFn on each data row
async function streamCSV(
  key: string,
  rowFn: (cols: string[]) => void
): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const body = res.Body as NodeJS.ReadableStream;
  const gunzip = zlib.createGunzip();
  const stream = Readable.from(body as AsyncIterable<Buffer>).pipe(gunzip);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; } // skip header
    if (line) rowFn(line.split(","));
  }
}

// ── API Route ────────────────────────────────────────────────────────────────

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase()?.trim();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  // 1. Find the latest available date
  const latestDate = await findLatestDate();
  if (!latestDate) return NextResponse.json({ error: "No data available" }, { status: 500 });

  const [yyyy, mm, dd] = latestDate.split("-");
  const dateSlug = `${yyyy}/${mm}/${latestDate}`;

  // 2. Fetch underlying close price from stocks file
  const stocksKey = `us_stocks_sip/day_aggs_v1/${dateSlug}.csv.gz`;
  let underlyingPrice: number | null = null;
  try {
    await streamCSV(stocksKey, (cols) => {
      // cols: ticker, volume, open, close, high, low, window_start, transactions
      if (cols[0] === ticker) underlyingPrice = parseFloat(cols[3]);
    });
  } catch {
    // non-fatal — stock price may not exist (e.g. index ETF with different ticker)
  }

  if (!underlyingPrice) {
    return NextResponse.json(
      { error: `No stock price found for "${ticker}" on ${latestDate}. Verify the symbol is a US equity.` },
      { status: 404 }
    );
  }

  // 3. Stream-parse options file, filter by underlying, calculate IV
  const optionsKey = `us_options_opra/day_aggs_v1/${dateSlug}.csv.gz`;
  const results: OptionSnapshot[] = [];
  const refDate = new Date(latestDate + "T00:00:00Z");

  await streamCSV(optionsKey, (cols) => {
    // cols: ticker, volume, open, close, high, low, window_start, transactions
    const occ = cols[0];
    if (!occ.startsWith(`O:${ticker}`)) return;

    const parsed = parseOCC(occ);
    if (!parsed || parsed.underlying !== ticker) return;

    const optionPrice = parseFloat(cols[3]); // close
    const volume = parseInt(cols[1], 10) || 0;

    if (!optionPrice || optionPrice <= 0) return;

    // Days to expiry from data date
    const expDate = new Date(parsed.expiration + "T00:00:00Z");
    const daysToExp = (expDate.getTime() - refDate.getTime()) / 86400000;
    if (daysToExp < 1) return; // skip expired

    // Moneyness filter: 50%–200% of spot
    const moneyness = parsed.strike / underlyingPrice!;
    if (moneyness < 0.5 || moneyness > 2.0) return;

    const T = daysToExp / 365;
    const iv = calcIV(underlyingPrice!, parsed.strike, T, optionPrice, parsed.type === "call");
    if (iv == null) return;

    results.push({
      strike: parsed.strike,
      expiration: parsed.expiration,
      type: parsed.type,
      optionPrice,
      underlyingPrice: underlyingPrice!,
      iv,
      volume,
      openInterest: 0, // not in day_aggs — would need quotes file
      moneyness,
      daysToExp,
    });
  });

  if (!results.length) {
    return NextResponse.json(
      { error: `No priceable options found for "${ticker}" on ${latestDate}.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ results, latestDate, count: results.length });
}
