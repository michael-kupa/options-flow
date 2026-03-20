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

// ── Types ────────────────────────────────────────────────────────────────────

interface OptionContract {
  details?: {
    contract_type?: string;
    strike_price?: number;
    expiration_date?: string;
    ticker?: string;
  };
  greeks?: {
    implied_volatility?: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  day?: {
    volume?: number;
    open_interest?: number;
  };
  last_quote?: {
    bid?: number;
    ask?: number;
  };
}

interface HeatmapCell {
  strike: number;
  expiration: string;
  daysToExp: number;
  iv: number;
  type: string;
  volume: number;
  oi: number;
}

// ── Color scale for IV (blue -> green -> yellow -> orange -> red) ─────────────

function ivToColor(iv: number, min: number, max: number): string {
  const t = Math.max(0, Math.min(1, (iv - min) / (max - min || 1)));
  const stops: [number, number, number][] = [
    [30, 100, 200],
    [50, 205, 50],
    [255, 220, 0],
    [255, 140, 0],
    [220, 50, 50],
  ];
  const segment = t * (stops.length - 1);
  const i = Math.floor(segment);
  const f = segment - i;
  const c1 = stops[Math.min(i, stops.length - 1)];
  const c2 = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(c1[0] + f * (c2[0] - c1[0]));
  const g = Math.round(c1[1] + f * (c2[1] - c1[1]));
  const b = Math.round(c1[2] + f * (c2[2] - c1[2]));
  return `rgb(${r},${g},${b})`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const exp = new Date(dateStr + "T00:00:00Z");
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  payload: HeatmapCell;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1a1a1a] border border-[#262626] rounded px-3 py-2 text-xs font-mono shadow-xl">
      <div className="text-amber-400 font-semibold mb-1">{d.type.toUpperCase()}</div>
      <div className="text-[#e5e5e5]">
        Strike: <span className="text-white font-bold">${d.strike}</span>
      </div>
      <div className="text-[#e5e5e5]">
        Expiry:{" "}
        <span className="text-white">
          {d.expiration} ({d.daysToExp}d)
        </span>
      </div>
      <div className="text-[#e5e5e5]">
        IV:{" "}
        <span className="text-amber-400 font-bold">{(d.iv * 100).toFixed(1)}%</span>
      </div>
      <div className="text-[#e5e5e5]">
        Volume: <span className="text-white">{d.volume.toLocaleString()}</span>
      </div>
      <div className="text-[#e5e5e5]">
        OI: <span className="text-white">{d.oi.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Legend gradient ───────────────────────────────────────────────────────────

function IVLegend({ min, max }: { min: number; max: number }) {
  const steps = 20;
  const gradient = Array.from({ length: steps }, (_, i) =>
    ivToColor(min + (i / (steps - 1)) * (max - min), min, max)
  ).join(",");
  return (
    <div className="flex flex-col items-center gap-1 mt-2">
      <span className="text-xs text-[#737373] font-mono">IV Color Scale</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#737373] font-mono">
          {(min * 100).toFixed(0)}%
        </span>
        <div
          className="w-40 h-3 rounded"
          style={{ background: `linear-gradient(to right, ${gradient})` }}
        />
        <span className="text-xs text-[#737373] font-mono">
          {(max * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const POPULAR = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD", "META", "AMZN"];

export default function IVSurfacePage() {
  const [ticker, setTicker] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<OptionContract[]>([]);
  const [contractType, setContractType] = useState<"call" | "put" | "both">("both");

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setRawData([]);
    try {
      const res = await fetch(`/api/options?ticker=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch options data");
      setRawData(json.results || []);
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

  const heatmapData = useMemo((): HeatmapCell[] => {
    return rawData
      .filter((c) => {
        const iv = c.greeks?.implied_volatility;
        const strike = c.details?.strike_price;
        const exp = c.details?.expiration_date;
        const type = c.details?.contract_type;
        if (!iv || !strike || !exp || !type) return false;
        if (contractType !== "both" && type !== contractType) return false;
        if (iv <= 0 || iv > 5) return false;
        return true;
      })
      .map((c) => ({
        strike: c.details!.strike_price!,
        expiration: c.details!.expiration_date!,
        daysToExp: daysUntil(c.details!.expiration_date!),
        iv: c.greeks!.implied_volatility!,
        type: c.details!.contract_type!,
        volume: c.day?.volume ?? 0,
        oi: c.day?.open_interest ?? 0,
      }))
      .sort((a, b) => a.daysToExp - b.daysToExp || a.strike - b.strike);
  }, [rawData, contractType]);

  const ivMin = useMemo(
    () => (heatmapData.length ? Math.min(...heatmapData.map((d) => d.iv)) : 0),
    [heatmapData]
  );
  const ivMax = useMemo(
    () => (heatmapData.length ? Math.max(...heatmapData.map((d) => d.iv)) : 1),
    [heatmapData]
  );

  const displayData = useMemo(() => {
    if (contractType === "both") return heatmapData;
    return heatmapData.filter((d) => d.type === contractType);
  }, [heatmapData, contractType]);

  const atmIV = useMemo(() => {
    if (!displayData.length) return null;
    const nearExp = Math.min(...displayData.map((d) => d.daysToExp));
    const nearTermContracts = displayData.filter((d) => d.daysToExp === nearExp);
    const ivs = nearTermContracts.map((d) => d.iv).sort((a, b) => a - b);
    return ivs[Math.floor(ivs.length / 2)] ?? null;
  }, [displayData]);

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
        <div className="flex items-center gap-2 text-xs font-mono text-[#737373]">
          <span>Powered by</span>
          <span className="text-amber-400">Polygon.io</span>
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
              <label className="text-xs font-mono text-[#737373] uppercase tracking-wider">
                Contract Type
              </label>
              <div className="flex gap-1">
                {(["both", "call", "put"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setContractType(t)}
                    className={`px-3 py-2 rounded text-xs font-mono font-bold transition-colors ${
                      contractType === t
                        ? t === "call"
                          ? "bg-emerald-600 text-white"
                          : t === "put"
                          ? "bg-red-600 text-white"
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
                onClick={() => {
                  setInputVal(s);
                  fetchData(s);
                }}
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

        {/* Stats bar */}
        {ticker && !loading && displayData.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Symbol", value: ticker },
              { label: "Contracts", value: displayData.length.toLocaleString() },
              {
                label: "ATM IV (front)",
                value: atmIV != null ? `${(atmIV * 100).toFixed(1)}%` : "—",
                accent: true,
              },
              {
                label: "IV Range",
                value: `${(ivMin * 100).toFixed(0)}% – ${(ivMax * 100).toFixed(0)}%`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#111111] border border-[#262626] rounded-lg px-4 py-3"
              >
                <div className="text-[#737373] text-xs font-mono uppercase tracking-wider">
                  {stat.label}
                </div>
                <div
                  className={`font-mono font-bold text-lg mt-1 ${
                    stat.accent ? "text-amber-400" : "text-white"
                  }`}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* IV Surface Chart */}
        {loading ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-8 flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[#737373] font-mono text-sm">
                Fetching options chain...
              </span>
            </div>
          </div>
        ) : displayData.length > 0 ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-3">
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
                  type="number"
                  dataKey="strike"
                  name="Strike"
                  domain={["auto", "auto"]}
                  tick={{
                    fill: "#737373",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  label={{
                    value: "Strike Price ($)",
                    position: "insideBottom",
                    offset: -25,
                    fill: "#737373",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="number"
                  dataKey="daysToExp"
                  name="Days to Expiry"
                  domain={[0, "auto"]}
                  tick={{
                    fill: "#737373",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  label={{
                    value: "Days to Expiry",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#737373",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#f59e0b44" }} />
                <Scatter data={displayData} shape="circle">
                  {displayData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={ivToColor(entry.iv, ivMin, ivMax)}
                      fillOpacity={0.85}
                      r={5}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            <IVLegend min={ivMin} max={ivMax} />
          </div>
        ) : ticker && !loading ? (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-8 flex items-center justify-center h-48">
            <span className="text-[#737373] font-mono text-sm">
              No options data found for {ticker}. Try a different symbol.
            </span>
          </div>
        ) : (
          <div className="bg-[#111111] border border-[#262626] rounded-lg p-8 flex flex-col items-center justify-center h-96 gap-4">
            <div className="text-5xl opacity-20">📊</div>
            <div className="text-center space-y-1">
              <p className="text-[#e5e5e5] font-mono text-sm">
                Enter a ticker symbol to render the IV surface
              </p>
              <p className="text-[#737373] font-mono text-xs">
                Visualizes implied volatility across all strikes and expirations
              </p>
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
                    {[
                      "Type",
                      "Strike",
                      "Expiry",
                      "DTE",
                      "IV",
                      "Delta",
                      "Volume",
                      "OI",
                      "Bid",
                      "Ask",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left py-2 px-2 text-[#737373] uppercase tracking-wider font-normal"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...displayData]
                    .sort((a, b) => b.volume - a.volume)
                    .slice(0, 20)
                    .map((row, i) => {
                      const raw = rawData.find(
                        (c) =>
                          c.details?.strike_price === row.strike &&
                          c.details?.expiration_date === row.expiration &&
                          c.details?.contract_type === row.type
                      );
                      return (
                        <tr
                          key={i}
                          className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                        >
                          <td
                            className={`py-1.5 px-2 font-bold ${
                              row.type === "call"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {row.type.toUpperCase()}
                          </td>
                          <td className="py-1.5 px-2 text-white">${row.strike}</td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">
                            {row.expiration}
                          </td>
                          <td className="py-1.5 px-2 text-[#737373]">{row.daysToExp}d</td>
                          <td className="py-1.5 px-2 text-amber-400 font-bold">
                            {(row.iv * 100).toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">
                            {raw?.greeks?.delta != null
                              ? raw.greeks.delta.toFixed(3)
                              : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-white">
                            {row.volume.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2 text-[#e5e5e5]">
                            {row.oi.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2 text-emerald-500">
                            {raw?.last_quote?.bid != null
                              ? `$${raw.last_quote.bid.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-red-400">
                            {raw?.last_quote?.ask != null
                              ? `$${raw.last_quote.ask.toFixed(2)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[#262626] px-6 py-2 text-xs font-mono text-[#525252] flex items-center justify-between">
        <span>Options Flow Dashboard · Data: Polygon.io</span>
        <span>For informational purposes only — not financial advice</span>
      </footer>
    </div>
  );
}
