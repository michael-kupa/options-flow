"use client";

import { useState, useCallback, useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
  ComposedChart, Line,
} from "recharts";
import type {
  ByExpiryRow, SentimentRow, StockAgg, OptionsApiResponse,
} from "./api/options/route";
import OptionsAnalyticsPanel from "./components/OptionsAnalytics";
import MaxPainAnalyticsPanel from "./components/MaxPainAnalytics";

// ── Shared chart theme ────────────────────────────────────────────────────────

const TICK = { fill: "#737373", fontSize: 10, fontFamily: "monospace" };
const GRID = { stroke: "#1f1f1f", strokeDasharray: "3 3" };

// ── Chart: Volume by Expiry ───────────────────────────────────────────────────

function VolumeByExpiryChart({ data }: { data: ByExpiryRow[] }) {
  const display = data.filter(r => r.callVolume + r.putVolume > 0).slice(0, 12);
  if (!display.length) return null;
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={display} margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="expiration" tick={{ ...TICK, fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={TICK} tickFormatter={fmt} />
        <Tooltip
          contentStyle={{ background: "#1a1a1a", border: "1px solid #262626", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
          labelStyle={{ color: "#e5e5e5" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [Number(v).toLocaleString(), name === "callVolume" ? "Call Vol" : "Put Vol"]}
        />
        <Legend formatter={(v) => v === "callVolume" ? "Calls" : "Puts"} wrapperStyle={{ fontSize: 11, fontFamily: "monospace", color: "#737373" }} />
        <Bar dataKey="callVolume" fill="#22c55e" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
        <Bar dataKey="putVolume" fill="#ef4444" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart: OI by Expiry ───────────────────────────────────────────────────────

function OIByExpiryChart({ data }: { data: ByExpiryRow[] }) {
  const display = data.filter(r => r.callOI + r.putOI > 0).slice(0, 12);
  if (!display.length) return null;
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={display} margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="expiration" tick={{ ...TICK, fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={TICK} tickFormatter={fmt} />
        <Tooltip
          contentStyle={{ background: "#1a1a1a", border: "1px solid #262626", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
          labelStyle={{ color: "#e5e5e5" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [Number(v).toLocaleString(), name === "callOI" ? "Call OI" : "Put OI"]}
        />
        <Legend formatter={(v) => v === "callOI" ? "Call OI" : "Put OI"} wrapperStyle={{ fontSize: 11, fontFamily: "monospace", color: "#737373" }} />
        <Bar dataKey="callOI" fill="#22c55e" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
        <Bar dataKey="putOI" fill="#ef4444" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Stock price + volume (30-day) ──────────────────────────────────────

function StockChart({ data, ticker }: { data: StockAgg[]; ticker: string }) {
  if (!data.length) return <div className="text-[#737373] font-mono text-xs text-center py-8">No stock data</div>;
  const fmtVol = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}K`;
  const prices = data.map(d => d.close);
  const pMin = Math.min(...prices) * 0.98;
  const pMax = Math.max(...prices) * 1.02;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 50, bottom: 40, left: 10 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tick={{ ...TICK, fontSize: 9 }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis yAxisId="vol" orientation="left" tick={TICK} tickFormatter={fmtVol} />
        <YAxis yAxisId="price" orientation="right" domain={[pMin, pMax]} tick={TICK} tickFormatter={(v) => `$${v.toFixed(0)}`} />
        <Tooltip
          contentStyle={{ background: "#1a1a1a", border: "1px solid #262626", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
          labelStyle={{ color: "#e5e5e5" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [name === "volume" ? Number(v).toLocaleString() : `$${Number(v).toFixed(2)}`, name === "volume" ? `${ticker} Volume` : `${ticker} Close`]}
        />
        <Bar yAxisId="vol" dataKey="volume" fill="#374151" fillOpacity={0.8} radius={[1, 1, 0, 0]} />
        <Line yAxisId="price" type="monotone" dataKey="close" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Table: Sentiment / IV Skew ────────────────────────────────────────────────

function sentimentLabel(skew: number | null, pcRatio: number | null): { label: string; color: string } {
  if (skew == null) return { label: "—", color: "text-[#737373]" };
  const bearish = skew > 0.05 || (pcRatio != null && pcRatio > 1.3);
  const bullish = skew < -0.05 || (pcRatio != null && pcRatio < 0.7);
  if (bearish) return { label: "BEARISH", color: "text-red-400" };
  if (bullish) return { label: "BULLISH", color: "text-emerald-400" };
  return { label: "NEUTRAL", color: "text-amber-400" };
}

function SentimentTable({ data }: { data: SentimentRow[] }) {
  if (!data.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-[#262626]">
            {["Expiry", "DTE", "ATM Call IV", "ATM Put IV", "Put-Call Skew", "P/C Vol", "Implied Move", "Sentiment"].map(h => (
              <th key={h} className="text-left py-2 px-3 text-[#737373] uppercase tracking-wider font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const { label, color } = sentimentLabel(row.putCallSkew, row.pcVolRatio);
            const skewColor = row.putCallSkew == null ? "text-[#737373]"
              : row.putCallSkew > 0.03 ? "text-red-400"
              : row.putCallSkew < -0.03 ? "text-emerald-400"
              : "text-[#e5e5e5]";
            return (
              <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                <td className="py-2 px-3 text-white">{row.expiration}</td>
                <td className="py-2 px-3 text-[#737373]">{Math.round(row.daysToExp)}d</td>
                <td className="py-2 px-3 text-emerald-400">{row.atmCallIV != null ? `${(row.atmCallIV * 100).toFixed(1)}%` : "—"}</td>
                <td className="py-2 px-3 text-red-400">{row.atmPutIV != null ? `${(row.atmPutIV * 100).toFixed(1)}%` : "—"}</td>
                <td className={`py-2 px-3 font-bold ${skewColor}`}>
                  {row.putCallSkew != null ? `${row.putCallSkew > 0 ? "+" : ""}${(row.putCallSkew * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 px-3 text-[#e5e5e5]">{row.pcVolRatio != null ? row.pcVolRatio.toFixed(2) : "—"}</td>
                <td className="py-2 px-3 text-amber-400 font-bold">{row.impliedMove != null ? `±${(row.impliedMove * 100).toFixed(1)}%` : "—"}</td>
                <td className={`py-2 px-3 font-bold ${color}`}>{label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────────────────

/** Subtle terminal-style section divider */
function SectionLabel({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <span className="font-mono text-[11px] text-[#383838] tabular-nums">{num}</span>
      <div className="h-px flex-1 bg-[#1a1a1a]" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#525252]">{title}</span>
    </div>
  );
}

/** Base dark card */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[#262626] bg-[#111111] p-4 ${className}`}>
      {children}
    </div>
  );
}

/** Titled panel for charts and tables */
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-mono text-sm font-bold text-amber-400 uppercase tracking-wider">{title}</h2>
        {subtitle && <span className="text-xs font-mono text-[#737373]">{subtitle}</span>}
      </div>
      {children}
    </Card>
  );
}

// ── Methodology panel ─────────────────────────────────────────────────────────

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ["IV Calculation",    "Black-Scholes Newton-Raphson (≤200 iterations). r = 4.5%. No dividend adjustment. Sigma bounds: 0.01–5.0."],
    ["Greeks",           "European B-S approximation. Theta per calendar day. Vega per 1% IV move."],
    ["Max Pain",         "Strike minimizing total ITM option payout (OI-weighted). Moneyness range 0.5×–2.0× spot."],
    ["Expiry Selection", "Nearest (≥1 DTE), next weekly, standard monthly (third Friday, day 15–21), following monthly."],
    ["Filters",          "Min price $0.05. Spread/price ≤90%. Moneyness 50%–200%. No calculable IV = excluded."],
    ["Data Source",      "Polygon.io real-time options snapshot. Stock OHLCV via Polygon daily aggregates. ~60s server cache."],
    ["Disclaimer",       "IV and Greeks are approximations. Not financial advice."],
  ];
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0d]">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#111] transition-colors rounded-lg"
      >
        <span className="font-mono text-xs uppercase tracking-widest text-[#525252]">
          Calculation methodology &amp; assumptions
        </span>
        <span className="font-mono text-[10px] text-[#383838]">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="border-t border-[#1f1f1f] px-4 py-4 space-y-3">
          {rows.map(([label, note]) => (
            <div key={label} className="grid gap-2 text-xs font-mono" style={{ gridTemplateColumns: "180px 1fr" }}>
              <span className="text-[#525252]">{label}</span>
              <span className="text-[#737373] leading-relaxed">{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const POPULAR = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD", "META", "AMZN"];

export default function DashboardPage() {
  const [ticker, setTicker] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OptionsApiResponse | null>(null);

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/options?ticker=${encodeURIComponent(sym)}`);
      const text = await res.text();
      if (!text) throw new Error("Empty response from server");
      const json: OptionsApiResponse = JSON.parse(text);
      if (!res.ok) throw new Error((json as unknown as { error: string }).error || `Server error ${res.status}`);
      setData(json);
      setTicker(sym.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = inputVal.trim().toUpperCase();
    if (sym) fetchData(sym);
  };

  // ── Derived snapshot metrics ──────────────────────────────────────────────
  const atmIV = useMemo(() => {
    const surface = data?.ivSurface ?? [];
    if (!surface.length || !data?.underlyingPrice) return null;
    const nearDte = Math.min(...surface.map(d => d.daysToExp));
    const near = surface.filter(d => d.daysToExp <= nearDte + 7);
    if (!near.length) return null;
    return near.reduce((a, b) =>
      Math.abs(a.strike - data.underlyingPrice) < Math.abs(b.strike - data.underlyingPrice) ? a : b
    ).iv;
  }, [data]);

  const pcRatio = useMemo(() => {
    if (!data?.byExpiry.length) return null;
    const totC = data.byExpiry.reduce((s, r) => s + r.callVolume, 0);
    const totP = data.byExpiry.reduce((s, r) => s + r.putVolume, 0);
    return totC > 0 ? totP / totC : null;
  }, [data]);

  const frontMonthImpliedMove = data?.sentiment[0]?.impliedMove ?? null;

  const hasData = !!data && !loading;
  const hasIV   = hasData && (data.ivSurface?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-[#262626] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-mono text-amber-400 font-bold tracking-widest text-sm uppercase">Options Flow</span>
          {ticker && (
            <>
              <span className="text-[#383838] text-xs font-mono">|</span>
              <span className="text-white font-mono font-bold text-sm">{ticker}</span>
              {data?.underlyingPrice && (
                <span className="text-amber-400 font-mono text-sm">${data.underlyingPrice.toFixed(2)}</span>
              )}
            </>
          )}
        </div>
        <span className="text-[10px] font-mono text-[#383838] tracking-wider hidden sm:block">
          Polygon.io · BS IV r=4.5%
        </span>
      </header>

      <main className="flex-1 p-6 space-y-5 max-w-[1600px] mx-auto w-full">

        {/* ── Search ── */}
        <Card>
          <form onSubmit={handleSubmit} className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-[10px] font-mono text-[#737373] uppercase tracking-widest">
                Underlying Symbol
              </label>
              <input
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value.toUpperCase())}
                placeholder="SPY, AAPL, TSLA…"
                className="bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 font-mono text-sm text-white placeholder-[#525252] focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !inputVal.trim()}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-[#262626] disabled:text-[#525252] text-black font-bold px-5 py-2 rounded text-sm font-mono transition-colors"
            >
              {loading ? "…" : "SCAN"}
            </button>
          </form>
          <div className="mt-3 flex gap-2 flex-wrap">
            {POPULAR.map(s => (
              <button
                key={s}
                onClick={() => { setInputVal(s); fetchData(s); }}
                className="text-xs font-mono text-[#737373] hover:text-amber-400 transition-colors px-2 py-1 border border-[#1f1f1f] rounded hover:border-amber-500"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-lg bg-red-950/30 border border-red-800 px-4 py-3 text-red-400 font-mono text-sm">
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <Card className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[#737373] font-mono text-sm">Fetching chain + computing analytics…</span>
            </div>
          </Card>
        )}

        {/* ════════════════════════════════════════════════════════
            01 · MARKET SNAPSHOT
            ════════════════════════════════════════════════════════ */}
        {hasData && data && (
          <>
            <SectionLabel num="01" title="Market Snapshot" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: "Spot",          value: `$${data.underlyingPrice.toFixed(2)}`, accent: true  },
                { label: "ATM IV",        value: atmIV != null ? `${(atmIV * 100).toFixed(1)}%` : "—", accent: true },
                { label: "P/C Vol Ratio", value: pcRatio != null ? pcRatio.toFixed(2) : "—", accent: false },
                { label: "Implied Move",  value: frontMonthImpliedMove != null ? `±${(frontMonthImpliedMove * 100).toFixed(1)}%` : "—", accent: false },
              ] as const).map(stat => (
                <div key={stat.label} className="rounded-lg border border-[#262626] bg-[#111111] px-4 py-3">
                  <div className="text-[10px] text-[#737373] font-mono uppercase tracking-widest">{stat.label}</div>
                  <div className={`font-mono font-bold text-xl mt-1 ${stat.accent ? "text-amber-400" : "text-white"}`}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            02 · EXPIRY STRUCTURE
            ════════════════════════════════════════════════════════ */}
        {hasData && data && data.byExpiry.length > 0 && (
          <>
            <SectionLabel num="02" title="Expiry Structure" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Option Volume by Expiry" subtitle="Calls vs puts · today">
                <VolumeByExpiryChart data={data.byExpiry} />
                <p className="text-xs font-mono text-[#525252] mt-1">
                  High put/call skew = near-term bearish pressure.
                </p>
              </Panel>
              <Panel title="Open Interest by Expiry" subtitle="Existing positions · prev close">
                <OIByExpiryChart data={data.byExpiry} />
                <p className="text-xs font-mono text-[#525252] mt-1">
                  Rising OI = new positions opening. Falling = closing or expiring.
                </p>
              </Panel>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            03 · SELECTED EXPIRY ANALYSIS
            ════════════════════════════════════════════════════════ */}
        {hasIV && data && data.expirations.length > 0 && (
          <>
            <SectionLabel num="03" title="Selected Expiry Analysis" />
            <Card>
              <OptionsAnalyticsPanel
                ivSurface={data.ivSurface}
                expirations={data.expirations}
                underlyingPrice={data.underlyingPrice}
                ticker={ticker}
              />
            </Card>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            04 · POSITIONING & PINNING
            ════════════════════════════════════════════════════════ */}
        {hasData && data && data.maxPainSections.length > 0 && (
          <>
            <SectionLabel num="04" title="Positioning & Pinning" />
            <Card>
              <MaxPainAnalyticsPanel
                maxPainSections={data.maxPainSections}
                ticker={ticker}
                underlyingPrice={data.underlyingPrice}
              />
            </Card>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            05 · PRICE CONTEXT
            ════════════════════════════════════════════════════════ */}
        {hasData && data && data.stockAggs.length > 0 && (
          <>
            <SectionLabel num="05" title="Price Context" />
            <Panel title={`${ticker} — 30-Day Price & Volume`} subtitle="Daily close + volume">
              <StockChart data={data.stockAggs} ticker={ticker} />
            </Panel>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            06 · REFERENCE TABLES
            ════════════════════════════════════════════════════════ */}
        {hasData && data && (data.sentiment.length > 0 || hasIV) && (
          <>
            <SectionLabel num="06" title="Reference Tables" />

            {data.sentiment.length > 0 && (
              <Panel
                title="IV Skew by Expiry"
                subtitle="ATM call vs put IV · positive skew = puts more expensive"
              >
                <SentimentTable data={data.sentiment} />
                <div className="flex flex-wrap gap-6 pt-2">
                  <span className="text-xs font-mono text-[#525252]">
                    <span className="text-red-400">Skew &gt; 0</span> = market paying for downside protection
                  </span>
                  <span className="text-xs font-mono text-[#525252]">
                    <span className="text-emerald-400">Skew &lt; 0</span> = calls bid, bullish expectation
                  </span>
                  <span className="text-xs font-mono text-[#525252]">
                    <span className="text-amber-400">Implied Move</span> = expected ±% by expiry (1σ ATM)
                  </span>
                </div>
              </Panel>
            )}

            {hasIV && (
              <Panel title="Top Contracts by Volume">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#262626]">
                        {["Type", "Strike", "Expiry", "DTE", "IV", "Bid", "Ask", "Spread", "Mid", "Volume", "OI"].map(h => (
                          <th key={h} className="text-left py-2 px-2 text-[#737373] uppercase tracking-wider font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.ivSurface].sort((a, b) => b.volume - a.volume).slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                          <td className={`py-1.5 px-2 font-bold ${row.type === "call" ? "text-emerald-400" : "text-red-400"}`}>
                            {row.type.toUpperCase()}
                          </td>
                          <td className="py-1.5 px-2 text-white">${row.strike}</td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">{row.expiration}</td>
                          <td className="py-1.5 px-2 text-[#737373]">{Math.round(row.daysToExp)}d</td>
                          <td className="py-1.5 px-2 text-amber-400 font-bold">{(row.iv * 100).toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">{row.bid != null ? `$${row.bid.toFixed(2)}` : "—"}</td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">{row.ask != null ? `$${row.ask.toFixed(2)}` : "—"}</td>
                          <td className="py-1.5 px-2 text-[#737373]">{row.spread != null ? `$${row.spread.toFixed(2)}` : "—"}</td>
                          <td className="py-1.5 px-2 text-white">${row.optionPrice.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-white">{row.volume.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">{row.openInterest.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            07 · METHODOLOGY & ASSUMPTIONS
            ════════════════════════════════════════════════════════ */}
        {hasData && (
          <>
            <SectionLabel num="07" title="Methodology & Assumptions" />
            <MethodologyPanel />
          </>
        )}

        {/* ── Empty state ── */}
        {!loading && !data && !error && (
          <Card className="flex flex-col items-center justify-center h-80 gap-4">
            <div className="text-5xl opacity-20">📊</div>
            <div className="text-center space-y-2">
              <p className="text-[#e5e5e5] font-mono text-sm">Enter a ticker to load the options dashboard</p>
              <p className="text-[#525252] font-mono text-xs">IV Skew · Greeks · Max Pain · Volume · OI · Sentiment</p>
            </div>
          </Card>
        )}

      </main>

      <footer className="border-t border-[#262626] px-6 py-2 text-[10px] font-mono text-[#383838] flex items-center justify-between shrink-0">
        <span>Options Flow · Polygon.io · Black-Scholes IV (r=4.5%)</span>
        <span>Not financial advice</span>
      </footer>

    </div>
  );
}
