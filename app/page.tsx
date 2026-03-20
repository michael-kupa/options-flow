"use client";

import { useState, useCallback, useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, ReferenceLine,
  ComposedChart, Line,
} from "recharts";
import OptionsAnalyticsPanel from "./components/OptionsAnalytics";
import type {
  ByExpiryRow, MaxPainData, SentimentRow, StockAgg, OptionsApiResponse,
} from "./api/options/route";

// ── Shared chart theme ────────────────────────────────────────────────────────

const TICK = { fill: "#737373", fontSize: 10, fontFamily: "monospace" };
const GRID = { stroke: "#1f1f1f", strokeDasharray: "3 3" };

// ── Chart: Volume by Expiry ───────────────────────────────────────────────────

function VolumeByExpiryChart({ data }: { data: ByExpiryRow[] }) {
  const display = data.filter(r => r.callVolume + r.putVolume > 0).slice(0, 12);
  if (!display.length) return null;
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
  return (
    <ResponsiveContainer width="100%" height={260}>
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
    <ResponsiveContainer width="100%" height={260}>
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

// ── Chart: Max Pain ───────────────────────────────────────────────────────────

function MaxPainChart({ data }: { data: MaxPainData }) {
  // Keep ±40% moneyness for display
  const near = data.strikes.filter(s =>
    s.strike >= data.currentPrice * 0.6 && s.strike <= data.currentPrice * 1.4
  );
  if (!near.length) return <div className="text-[#737373] font-mono text-xs text-center py-8">Insufficient OI data for max pain</div>;

  const fmt = (v: number) => `$${(v / 1e6).toFixed(1)}M`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={near} margin={{ top: 10, right: 10, bottom: 40, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="strike" tick={{ ...TICK, fontSize: 9 }} tickFormatter={(v) => `$${v}`} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmt} />
        <Tooltip
          contentStyle={{ background: "#1a1a1a", border: "1px solid #262626", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
          labelStyle={{ color: "#e5e5e5" }}
          labelFormatter={(v) => `Strike $${v}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [`$${(Number(v) / 1e6).toFixed(2)}M`, name === "callPain" ? "Call Pain" : name === "putPain" ? "Put Pain" : "Total"]}
        />
        <Bar dataKey="callPain" stackId="a" fill="#22c55e" fillOpacity={0.7} />
        <Bar dataKey="putPain" stackId="a" fill="#ef4444" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
        <ReferenceLine x={data.maxPainStrike} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2"
          label={{ value: `Max Pain $${data.maxPainStrike}`, position: "top", fill: "#f59e0b", fontSize: 10, fontFamily: "monospace" }} />
        <ReferenceLine x={data.currentPrice} stroke="#a78bfa" strokeWidth={1.5}
          label={{ value: `Spot $${data.currentPrice}`, position: "insideTopRight", fill: "#a78bfa", fontSize: 10, fontFamily: "monospace" }} />
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
        <YAxis yAxisId="price" orientation="right" domain={[pMin, pMax]}
          tick={{ ...TICK }} tickFormatter={(v) => `$${v.toFixed(0)}`} />
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
  // Puts more expensive (skew > 0.05) = bearish; calls more expensive (skew < -0.05) = bullish
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
            const skewPct = row.putCallSkew != null ? (row.putCallSkew * 100).toFixed(1) : "—";
            const skewColor = row.putCallSkew == null ? "text-[#737373]"
              : row.putCallSkew > 0.03 ? "text-red-400"
              : row.putCallSkew < -0.03 ? "text-emerald-400"
              : "text-[#e5e5e5]";
            return (
              <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                <td className="py-2 px-3 text-white">{row.expiration}</td>
                <td className="py-2 px-3 text-[#737373]">{Math.round(row.daysToExp)}d</td>
                <td className="py-2 px-3 text-emerald-400">
                  {row.atmCallIV != null ? `${(row.atmCallIV * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 px-3 text-red-400">
                  {row.atmPutIV != null ? `${(row.atmPutIV * 100).toFixed(1)}%` : "—"}
                </td>
                <td className={`py-2 px-3 font-bold ${skewColor}`}>
                  {row.putCallSkew != null ? `${row.putCallSkew > 0 ? "+" : ""}${skewPct}%` : "—"}
                </td>
                <td className="py-2 px-3 text-[#e5e5e5]">
                  {row.pcVolRatio != null ? row.pcVolRatio.toFixed(2) : "—"}
                </td>
                <td className="py-2 px-3 text-amber-400 font-bold">
                  {row.impliedMove != null ? `±${(row.impliedMove * 100).toFixed(1)}%` : "—"}
                </td>
                <td className={`py-2 px-3 font-bold ${color}`}>{label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-mono text-sm font-bold text-amber-400 uppercase tracking-wider">{title}</h2>
        {subtitle && <span className="text-xs font-mono text-[#737373]">{subtitle}</span>}
      </div>
      {children}
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
  const [contractType, setContractType] = useState<"call" | "put" | "both">("both");

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

  const ivSurface = useMemo(() => {
    if (!data) return [];
    if (contractType === "both") return data.ivSurface;
    return data.ivSurface.filter(d => d.type === contractType);
  }, [data, contractType]);

  const ivMin = useMemo(() => ivSurface.length ? Math.min(...ivSurface.map(d => d.iv)) : 0, [ivSurface]);
  const ivMax = useMemo(() => ivSurface.length ? Math.max(...ivSurface.map(d => d.iv)) : 1, [ivSurface]);

  const atmIV = useMemo(() => {
    if (!ivSurface.length || !data?.underlyingPrice) return null;
    const nearDte = Math.min(...ivSurface.map(d => d.daysToExp));
    const near = ivSurface.filter(d => d.daysToExp <= nearDte + 7);
    if (!near.length) return null;
    return near.reduce((a, b) =>
      Math.abs(a.strike - data.underlyingPrice) < Math.abs(b.strike - data.underlyingPrice) ? a : b
    ).iv;
  }, [ivSurface, data]);

  const hasData = !!data && !loading;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#262626] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-mono text-amber-400 font-bold tracking-widest text-sm uppercase">Options Flow</span>
          {ticker && <><span className="text-[#737373] text-xs font-mono">|</span>
            <span className="text-white font-mono font-bold text-sm">{ticker}</span>
            {data?.underlyingPrice && <span className="text-amber-400 font-mono text-sm">${data.underlyingPrice.toFixed(2)}</span>}</>}
        </div>
        <div className="text-xs font-mono text-[#737373]">Polygon.io · IV via Black-Scholes (r=4.5%)</div>
      </header>

      <main className="flex-1 p-6 space-y-6">
        {/* Search */}
        <div className="bg-[#111111] border border-[#262626] rounded-lg p-4">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs font-mono text-[#737373] uppercase tracking-wider">Underlying Symbol</label>
              <div className="flex gap-2">
                <input
                  type="text" value={inputVal}
                  onChange={e => setInputVal(e.target.value.toUpperCase())}
                  placeholder="SPY, AAPL, TSLA..."
                  className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 font-mono text-sm text-white placeholder-[#525252] focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button type="submit" disabled={loading || !inputVal.trim()}
                  className="bg-amber-500 hover:bg-amber-400 disabled:bg-[#262626] disabled:text-[#525252] text-black font-bold px-5 py-2 rounded text-sm font-mono transition-colors">
                  {loading ? "..." : "SCAN"}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-[#737373] uppercase tracking-wider">Type</label>
              <div className="flex gap-1">
                {(["both", "call", "put"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setContractType(t)}
                    className={`px-3 py-2 rounded text-xs font-mono font-bold transition-colors ${contractType === t
                      ? t === "call" ? "bg-emerald-600 text-white" : t === "put" ? "bg-red-600 text-white" : "bg-amber-500 text-black"
                      : "bg-[#1a1a1a] text-[#737373] hover:text-white border border-[#262626]"}`}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </form>
          <div className="mt-3 flex gap-2 flex-wrap">
            {POPULAR.map(s => (
              <button key={s} onClick={() => { setInputVal(s); fetchData(s); }}
                className="text-xs font-mono text-[#737373] hover:text-amber-400 transition-colors px-2 py-1 border border-[#1f1f1f] rounded hover:border-amber-500">
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 font-mono text-sm">{error}</div>
        )}

        {/* Stats bar */}
        {hasData && data && ivSurface.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Spot", value: `$${data.underlyingPrice.toFixed(2)}` },
              { label: "ATM IV", value: atmIV != null ? `${(atmIV * 100).toFixed(1)}%` : "—", accent: true },
              { label: "IV Range", value: `${(ivMin * 100).toFixed(0)}%–${(ivMax * 100).toFixed(0)}%` },
              { label: "Contracts", value: ivSurface.length.toLocaleString() },
              {
                label: "Today P/C Vol",
                value: (() => {
                  const totC = data.byExpiry.reduce((s, r) => s + r.callVolume, 0);
                  const totP = data.byExpiry.reduce((s, r) => s + r.putVolume, 0);
                  return totC > 0 ? (totP / totC).toFixed(2) : "—";
                })(),
              },
            ].map(stat => (
              <div key={stat.label} className="bg-[#111111] border border-[#262626] rounded-lg px-4 py-3">
                <div className="text-[#737373] text-xs font-mono uppercase tracking-wider">{stat.label}</div>
                <div className={`font-mono font-bold text-lg mt-1 ${stat.accent ? "text-amber-400" : "text-white"}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-[#111111] border border-[#262626] rounded-lg flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[#737373] font-mono text-sm">Fetching chain + computing analytics…</span>
            </div>
          </div>
        )}

        {/* ── IV Skew + Greeks ── */}
        {hasData && data && data.ivSurface.length > 0 && data.expirations.length > 0 && (
          <Panel title="">
            <OptionsAnalyticsPanel
              ivSurface={data.ivSurface}
              expirations={data.expirations}
              underlyingPrice={data.underlyingPrice}
              ticker={ticker}
            />
          </Panel>
        )}

        {/* ── Volume + OI side by side ── */}
        {hasData && data && data.byExpiry.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Option Volume by Expiry" subtitle="Calls vs puts · today">
              <VolumeByExpiryChart data={data.byExpiry} />
              <p className="text-xs font-mono text-[#525252]">
                High put volume vs calls = bearish pressure. Skewed call volume = bullish positioning.
              </p>
            </Panel>
            <Panel title="Open Interest by Expiry" subtitle="Existing positions · prev close">
              <OIByExpiryChart data={data.byExpiry} />
              <p className="text-xs font-mono text-[#525252]">
                Rising OI = new contracts being opened. Falling OI = positions being closed/expired.
              </p>
            </Panel>
          </div>
        )}

        {/* ── Max Pain + Stock chart side by side ── */}
        {hasData && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.maxPain && (
              <Panel
                title={`Max Pain — ${data.maxPain.expiration}`}
                subtitle={`Max pain $${data.maxPain.maxPainStrike} · spot $${data.maxPain.currentPrice}`}
              >
                <MaxPainChart data={data.maxPain} />
                <p className="text-xs font-mono text-[#525252]">
                  The strike where total ITM option value is lowest — where option sellers profit most at expiry.
                  Pin risk is highest near <span className="text-amber-400">${data.maxPain.maxPainStrike}</span>.
                </p>
              </Panel>
            )}
            {data.stockAggs.length > 0 && (
              <Panel title={`${ticker} — 30-Day Price & Volume`} subtitle="Daily close + volume">
                <StockChart data={data.stockAggs} ticker={ticker} />
              </Panel>
            )}
          </div>
        )}

        {/* ── Market Sentiment Table ── */}
        {hasData && data && data.sentiment.length > 0 && (
          <Panel
            title="Market Sentiment — IV Skew by Expiry"
            subtitle="ATM call vs put IV · positive skew = puts more expensive = bearish"
          >
            <SentimentTable data={data.sentiment} />
            <div className="flex gap-6 pt-1">
              <span className="text-xs font-mono text-[#525252]">
                <span className="text-red-400">Put-Call Skew &gt; 0</span> = market paying up for downside protection
              </span>
              <span className="text-xs font-mono text-[#525252]">
                <span className="text-emerald-400">Put-Call Skew &lt; 0</span> = calls bid up, bullish expectation
              </span>
              <span className="text-xs font-mono text-[#525252]">
                <span className="text-amber-400">Implied Move</span> = expected ±% by expiry (1σ)
              </span>
            </div>
          </Panel>
        )}

        {/* ── Top Contracts Table ── */}
        {hasData && ivSurface.length > 0 && (
          <Panel title="Top Contracts by Volume">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262626]">
                    {["Type", "Strike", "Expiry", "DTE", "IV", "Moneyness", "Opt Px", "Volume", "OI"].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-[#737373] uppercase tracking-wider font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...ivSurface].sort((a, b) => b.volume - a.volume).slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                      <td className={`py-1.5 px-2 font-bold ${row.type === "call" ? "text-emerald-400" : "text-red-400"}`}>{row.type.toUpperCase()}</td>
                      <td className="py-1.5 px-2 text-white">${row.strike}</td>
                      <td className="py-1.5 px-2 text-[#e5e5e5]">{row.expiration}</td>
                      <td className="py-1.5 px-2 text-[#737373]">{Math.round(row.daysToExp)}d</td>
                      <td className="py-1.5 px-2 text-amber-400 font-bold">{(row.iv * 100).toFixed(1)}%</td>
                      <td className={`py-1.5 px-2 ${Math.abs(row.moneyness - 1) < 0.05 ? "text-amber-400" : "text-[#e5e5e5]"}`}>{(row.moneyness * 100).toFixed(1)}%</td>
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

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="bg-[#111111] border border-[#262626] rounded-lg flex flex-col items-center justify-center h-80 gap-4">
            <div className="text-5xl opacity-20">📊</div>
            <div className="text-center space-y-1">
              <p className="text-[#e5e5e5] font-mono text-sm">Enter a ticker to load the full options dashboard</p>
              <p className="text-[#737373] font-mono text-xs">IV Surface · Volume · OI · Max Pain · Sentiment · 30-day stock chart</p>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[#262626] px-6 py-2 text-xs font-mono text-[#525252] flex items-center justify-between">
        <span>Options Flow · Polygon.io · IV via Black-Scholes (r=4.5%)</span>
        <span>Not financial advice</span>
      </footer>
    </div>
  );
}
