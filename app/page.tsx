"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { OptionSnapshot } from "./api/options/route";

// ── Color scale (blue → green → yellow → orange → red) ───────────────────────

function ivToColor(iv: number, min: number, max: number): string {
  const t = Math.max(0, Math.min(1, (iv - min) / (max - min || 0.01)));
  const stops: [number, number, number][] = [
    [30, 100, 200],
    [50, 205, 50],
    [255, 220, 0],
    [255, 140, 0],
    [220, 50, 50],
  ];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const c1 = stops[Math.min(i, stops.length - 1)];
  const c2 = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(c1[0] + f * (c2[0] - c1[0]))},${Math.round(c1[1] + f * (c2[1] - c1[1]))},${Math.round(c1[2] + f * (c2[2] - c1[2]))})`;
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: OptionSnapshot }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1a1a1a] border border-[#262626] rounded px-3 py-2 text-xs font-mono shadow-xl">
      <div className={`font-semibold mb-1 ${d.type === "call" ? "text-emerald-400" : "text-red-400"}`}>
        {d.type.toUpperCase()} ${d.strike}
      </div>
      <div className="text-[#e5e5e5]">Expiry: <span className="text-white">{d.expiration} ({Math.round(d.daysToExp)}d)</span></div>
      <div className="text-[#e5e5e5]">IV: <span className="text-amber-400 font-bold">{(d.iv * 100).toFixed(1)}%</span></div>
      <div className="text-[#e5e5e5]">Option px: <span className="text-white">${d.optionPrice.toFixed(2)}</span></div>
      <div className="text-[#e5e5e5]">Underlying: <span className="text-white">${d.underlyingPrice.toFixed(2)}</span></div>
      <div className="text-[#e5e5e5]">Moneyness: <span className="text-white">{(d.moneyness * 100).toFixed(1)}%</span></div>
      <div className="text-[#e5e5e5]">Volume: <span className="text-white">{d.volume.toLocaleString()}</span></div>
      <div className="text-[#e5e5e5]">OI: <span className="text-white">{d.openInterest.toLocaleString()}</span></div>
    </div>
  );
}

function IVLegend({ min, max }: { min: number; max: number }) {
  const steps = 20;
  const gradient = Array.from({ length: steps }, (_, i) =>
    ivToColor(min + (i / (steps - 1)) * (max - min), min, max)
  ).join(",");
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-[#737373] font-mono">IV Color Scale</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#737373] font-mono">{(min * 100).toFixed(0)}%</span>
        <div className="w-40 h-3 rounded" style={{ background: `linear-gradient(to right, ${gradient})` }} />
        <span className="text-xs text-[#737373] font-mono">{(max * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const POPULAR = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD", "META", "AMZN"];

export default function IVSurfacePage() {
  const [ticker, setTicker] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<OptionSnapshot[]>([]);
  const [contractType, setContractType] = useState<"call" | "put" | "both">("both");

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setSnapshots([]);
    try {
      const res = await fetch(`/api/options?ticker=${encodeURIComponent(sym)}`);
      const text = await res.text();
      if (!text) throw new Error("Empty response from server");
      const json = JSON.parse(text);
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      setSnapshots(json.results || []);
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
    if (!sym) return;
    fetchData(sym);
  };

  const displayData = useMemo(() => {
    if (contractType === "both") return snapshots;
    return snapshots.filter((d) => d.type === contractType);
  }, [snapshots, contractType]);

  const ivMin = useMemo(() => displayData.length ? Math.min(...displayData.map((d) => d.iv)) : 0, [displayData]);
  const ivMax = useMemo(() => displayData.length ? Math.max(...displayData.map((d) => d.iv)) : 1, [displayData]);
  const underlyingPrice = snapshots[0]?.underlyingPrice;

  const atmIV = useMemo(() => {
    if (!displayData.length || !underlyingPrice) return null;
    const nearDte = Math.min(...displayData.map((d) => d.daysToExp));
    const near = displayData.filter((d) => d.daysToExp <= nearDte + 7);
    if (!near.length) return null;
    return near.reduce((a, b) =>
      Math.abs(a.strike - underlyingPrice) < Math.abs(b.strike - underlyingPrice) ? a : b
    ).iv;
  }, [displayData, underlyingPrice]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#262626] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-mono text-amber-400 font-bold tracking-widest text-sm uppercase">
            Options Flow
          </span>
          <span className="text-[#737373] text-xs font-mono">|</span>
          <span className="text-[#737373] text-xs font-mono">IV Surface</span>
        </div>
        <div className="text-xs font-mono text-[#737373]">
          Polygon.io · IV via Black-Scholes (r=4.5%)
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6">
        {/* Search */}
        <div className="bg-[#111111] border border-[#262626] rounded-lg p-4">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs font-mono text-[#737373] uppercase tracking-wider">
                Underlying Symbol
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value.toUpperCase())}
                  placeholder="SPY, AAPL, TSLA..."
                  className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 font-mono text-sm text-white placeholder-[#525252] focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading || !inputVal.trim()}
                  className="bg-amber-500 hover:bg-amber-400 disabled:bg-[#262626] disabled:text-[#525252] text-black font-bold px-5 py-2 rounded text-sm font-mono transition-colors"
                >
                  {loading ? "..." : "SCAN"}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-[#737373] uppercase tracking-wider">Type</label>
              <div className="flex gap-1">
                {(["both", "call", "put"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setContractType(t)}
                    className={`px-3 py-2 rounded text-xs font-mono font-bold transition-colors ${
                      contractType === t
                        ? t === "call" ? "bg-emerald-600 text-white"
                          : t === "put" ? "bg-red-600 text-white"
                          : "bg-amber-500 text-black"
                        : "bg-[#1a1a1a] text-[#737373] hover:text-white border border-[#262626]"
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </form>
          <div className="mt-3 flex gap-2 flex-wrap">
            {POPULAR.map((s) => (
              <button
                key={s}
                onClick={() => { setInputVal(s); fetchData(s); }}
                className="text-xs font-mono text-[#737373] hover:text-amber-400 transition-colors px-2 py-1 border border-[#1f1f1f] rounded hover:border-amber-500"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-red-400 font-mono text-sm">
            {error}
          </div>
        )}

        {/* Stats */}
        {ticker && !loading && displayData.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Symbol", value: ticker },
              { label: "Spot", value: underlyingPrice ? `$${underlyingPrice.toFixed(2)}` : "—" },
              { label: "ATM IV", value: atmIV != null ? `${(atmIV * 100).toFixed(1)}%` : "—", accent: true },
              { label: "IV Range", value: `${(ivMin * 100).toFixed(0)}%–${(ivMax * 100).toFixed(0)}%` },
              { label: "Contracts", value: displayData.length.toLocaleString() },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#111111] border border-[#262626] rounded-lg px-4 py-3">
                <div className="text-[#737373] text-xs font-mono uppercase tracking-wider">{stat.label}</div>
                <div className={`font-mono font-bold text-lg mt-1 ${stat.accent ? "text-amber-400" : "text-white"}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[#737373] font-mono text-sm">Fetching chain + calculating IV…</span>
            </div>
          </div>
        ) : displayData.length > 0 ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-mono text-sm font-bold text-amber-400 uppercase tracking-wider">
                {ticker} — Implied Volatility Surface
              </h2>
              <span className="text-xs font-mono text-[#737373]">
                Strike (X) × Days to Expiry (Y) · color = IV
              </span>
            </div>

            <ResponsiveContainer width="100%" height={480}>
              <ScatterChart margin={{ top: 10, right: 30, bottom: 40, left: 10 }}>
                <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
                <XAxis
                  type="number" dataKey="strike" name="Strike" domain={["auto", "auto"]}
                  tick={{ fill: "#737373", fontSize: 11, fontFamily: "monospace" }}
                  label={{ value: "Strike Price ($)", position: "insideBottom", offset: -25, fill: "#737373", fontSize: 11, fontFamily: "monospace" }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="number" dataKey="daysToExp" name="Days to Expiry" domain={[0, "auto"]}
                  tick={{ fill: "#737373", fontSize: 11, fontFamily: "monospace" }}
                  label={{ value: "Days to Expiry", angle: -90, position: "insideLeft", fill: "#737373", fontSize: 11, fontFamily: "monospace" }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#f59e0b44" }} />
                <Scatter data={displayData} shape="circle">
                  {displayData.map((entry, i) => (
                    <Cell key={i} fill={ivToColor(entry.iv, ivMin, ivMax)} fillOpacity={0.85} r={5} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            <IVLegend min={ivMin} max={ivMax} />
          </div>
        ) : ticker && !loading ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-[#737373] font-mono text-sm">No priceable contracts found for {ticker}.</span>
            <span className="text-[#525252] font-mono text-xs">Symbol may be invalid, or no options traded today.</span>
          </div>
        ) : (
          <div className="bg-[#111111] border border-[#262626] rounded-lg flex flex-col items-center justify-center h-96 gap-4">
            <div className="text-5xl opacity-20">📊</div>
            <div className="text-center space-y-1">
              <p className="text-[#e5e5e5] font-mono text-sm">Enter a ticker to render the IV surface</p>
              <p className="text-[#737373] font-mono text-xs">Live data from Polygon.io · IV calculated via Black-Scholes</p>
            </div>
          </div>
        )}

        {/* Top contracts table */}
        {!loading && displayData.length > 0 && (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-3">
            <h2 className="font-mono text-sm font-bold text-amber-400 uppercase tracking-wider">
              Top Contracts by Volume
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262626]">
                    {["Type", "Strike", "Expiry", "DTE", "IV", "Moneyness", "Opt Px", "Volume", "OI"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 text-[#737373] uppercase tracking-wider font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...displayData]
                    .sort((a, b) => b.volume - a.volume)
                    .slice(0, 25)
                    .map((row, i) => (
                      <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                        <td className={`py-1.5 px-2 font-bold ${row.type === "call" ? "text-emerald-400" : "text-red-400"}`}>
                          {row.type.toUpperCase()}
                        </td>
                        <td className="py-1.5 px-2 text-white">${row.strike}</td>
                        <td className="py-1.5 px-2 text-[#e5e5e5]">{row.expiration}</td>
                        <td className="py-1.5 px-2 text-[#737373]">{Math.round(row.daysToExp)}d</td>
                        <td className="py-1.5 px-2 text-amber-400 font-bold">{(row.iv * 100).toFixed(1)}%</td>
                        <td className={`py-1.5 px-2 ${Math.abs(row.moneyness - 1) < 0.05 ? "text-amber-400" : "text-[#e5e5e5]"}`}>
                          {(row.moneyness * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 text-white">${row.optionPrice.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-white">{row.volume.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-[#e5e5e5]">{row.openInterest.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
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
