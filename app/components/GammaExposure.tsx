"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import type { OptionSnapshot } from "../api/options/route";

// ── Theme ─────────────────────────────────────────────────────────────────────

const TICK = { fill: "#737373", fontSize: 10, fontFamily: "monospace" } as const;
const GRID = { stroke: "#1f1f1f", strokeDasharray: "3 3" } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GEXPoint {
  strike: number;
  callGEX: number;   // positive
  putGEX: number;    // negative
  netGEX: number;    // callGEX + putGEX
}

interface CumGEXPoint {
  strike: number;
  cumulative: number;
  pos: number;       // max(0, cumulative) — for green fill
  neg: number;       // min(0, cumulative) — for red fill
}

type StrikeRange = "all" | "20";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtGEX(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GEXBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callGEX = payload.find((p: any) => p.dataKey === "callGEX")?.value ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const putGEX  = payload.find((p: any) => p.dataKey === "putGEX")?.value ?? 0;
  const netGEX  = callGEX + putGEX;
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-[#f59e0b]">Strike ${label}</div>
      <div className="text-emerald-400">Call GEX: {fmtGEX(callGEX)}</div>
      <div className="text-red-400">Put GEX:  {fmtGEX(putGEX)}</div>
      <div className={`mt-1 font-bold ${netGEX >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        Net GEX: {fmtGEX(netGEX)}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CumGEXTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = payload.find((p: any) => p.dataKey === "cumulative")?.value ?? 0;
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-[#f59e0b]">Strike ${label}</div>
      <div className={`font-bold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        Cum. Net GEX: {fmtGEX(value)}
      </div>
      <div className="mt-1 text-[10px] text-[#737373]">
        {value >= 0
          ? "Positive γ — dealers buy dips, sell rips (stabilizing)"
          : "Negative γ — dealers amplify directional moves"}
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function RangeToggle({ value, onChange }: { value: StrikeRange; onChange: (v: StrikeRange) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-[#262626] text-xs">
      {(["all", "20"] as StrikeRange[]).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 transition-colors ${
            value === v
              ? "bg-[#f59e0b] font-semibold text-black"
              : "bg-[#111] text-[#a3a3a3] hover:bg-[#1a1a1a]"
          }`}
        >
          {v === "all" ? "All" : "±20%"}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface GammaExposurePanelProps {
  ivSurface: OptionSnapshot[];
  underlyingPrice: number;
  ticker: string;
}

export default function GammaExposurePanel({
  ivSurface,
  underlyingPrice,
  ticker,
}: GammaExposurePanelProps) {
  const [strikeRange, setStrikeRange] = useState<StrikeRange>("20");

  // ── GEX per strike (all expirations aggregated) ───────────────────────────
  // GEX = Gamma × OI × 100 (contract multiplier) × Spot
  // Calls: positive dealer gamma (dealer short call → long Δ → buy underlying as price rises → stabilizing)
  // Puts:  negative dealer gamma (dealer short put → short Δ → sell underlying as price falls → amplifying)
  // Assumption: dealers are net short options (standard market-maker approximation)
  const gexData = useMemo<GEXPoint[]>(() => {
    const map = new Map<number, { callGEX: number; putGEX: number }>();
    for (const c of ivSurface) {
      if (c.gamma <= 0 || c.openInterest <= 0) continue;
      const gex = c.gamma * c.openInterest * 100 * underlyingPrice;
      const entry = map.get(c.strike) ?? { callGEX: 0, putGEX: 0 };
      if (c.type === "call") entry.callGEX += gex;
      else                   entry.putGEX  -= gex; // negative for puts
      map.set(c.strike, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([strike, { callGEX, putGEX }]) => ({
        strike,
        callGEX: +callGEX.toFixed(0),
        putGEX:  +putGEX.toFixed(0),
        netGEX:  +(callGEX + putGEX).toFixed(0),
      }));
  }, [ivSurface, underlyingPrice]);

  // ── Cumulative net GEX curve ──────────────────────────────────────────────
  const cumulativeData = useMemo<CumGEXPoint[]>(() => {
    let cum = 0;
    return gexData.map(d => {
      cum += d.netGEX;
      return { strike: d.strike, cumulative: cum, pos: Math.max(0, cum), neg: Math.min(0, cum) };
    });
  }, [gexData]);

  // ── Gamma flip point ──────────────────────────────────────────────────────
  // Strike where cumulative net GEX crosses zero (linear interpolation)
  const gammaFlip = useMemo<number | null>(() => {
    for (let i = 1; i < cumulativeData.length; i++) {
      const a = cumulativeData[i - 1];
      const b = cumulativeData[i];
      if ((a.cumulative < 0) !== (b.cumulative < 0)) {
        const ratio = Math.abs(a.cumulative) / (Math.abs(a.cumulative) + Math.abs(b.cumulative));
        return Math.round(a.strike + ratio * (b.strike - a.strike));
      }
    }
    return null;
  }, [cumulativeData]);

  // ── Gamma environment at spot ──────────────────────────────────────────────
  const isPositiveGamma = useMemo<boolean>(() => {
    if (!cumulativeData.length) return true;
    const atSpot = cumulativeData.reduce((a, b) =>
      Math.abs(a.strike - underlyingPrice) < Math.abs(b.strike - underlyingPrice) ? a : b
    );
    return atSpot.cumulative >= 0;
  }, [cumulativeData, underlyingPrice]);

  // ── Strike range filter ───────────────────────────────────────────────────
  const lo = underlyingPrice * 0.80;
  const hi = underlyingPrice * 1.20;

  const filteredGEX = useMemo(
    () => strikeRange === "all" ? gexData : gexData.filter(d => d.strike >= lo && d.strike <= hi),
    [gexData, strikeRange, lo, hi]
  );
  const filteredCum = useMemo(
    () => strikeRange === "all" ? cumulativeData : cumulativeData.filter(d => d.strike >= lo && d.strike <= hi),
    [cumulativeData, strikeRange, lo, hi]
  );

  if (!gexData.length) {
    return (
      <div className="rounded border border-[#262626] bg-[#111] p-6 text-center text-sm text-[#737373]">
        No gamma exposure data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-[#f59e0b]">
          {ticker} · Gamma Exposure
        </h2>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${
          isPositiveGamma
            ? "border-emerald-900 bg-emerald-950/40 text-emerald-400"
            : "border-red-900 bg-red-950/40 text-red-400"
        }`}>
          {isPositiveGamma ? "Positive Gamma" : "Negative Gamma"} at Spot
        </span>
        {gammaFlip != null && (
          <span className="font-mono text-xs text-[#737373]">
            Flip at <span className="text-amber-400 font-bold">${gammaFlip}</span>
          </span>
        )}
        <div className="ml-auto">
          <RangeToggle value={strikeRange} onChange={setStrikeRange} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Chart 1: GEX by Strike */}
        <div className="rounded border border-[#262626] bg-[#111] p-3">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#a3a3a3]">
              Gamma Exposure by Strike
            </span>
            <span className="text-[9px] font-mono text-[#525252]">γ × OI × 100 × S · all expirations</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={filteredGEX} margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis
                dataKey="strike"
                tick={{ ...TICK, fontSize: 9 }}
                tickFormatter={v => `$${v}`}
                angle={-35}
                textAnchor="end"
                interval="preserveStartEnd"
              />
              <YAxis tick={TICK} tickFormatter={fmtGEX} width={52} />
              <Tooltip content={<GEXBarTooltip />} />
              <ReferenceLine y={0} stroke="#2a2a2a" strokeWidth={1} />
              <ReferenceLine
                x={underlyingPrice}
                stroke="#22c55e"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: "S", position: "top", fill: "#22c55e", fontSize: 10, fontFamily: "monospace" }}
              />
              {gammaFlip != null && (
                <ReferenceLine
                  x={gammaFlip}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  label={{ value: `Flip $${gammaFlip}`, position: "insideTopRight", fill: "#f59e0b", fontSize: 9, fontFamily: "monospace" }}
                />
              )}
              <Bar dataKey="callGEX" name="Call GEX" fill="#22c55e" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              <Bar dataKey="putGEX"  name="Put GEX"  fill="#ef4444" fillOpacity={0.7} radius={[0, 0, 2, 2]} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#737373", fontFamily: "monospace", paddingTop: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Cumulative Net GEX */}
        <div className="rounded border border-[#262626] bg-[#111] p-3">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#a3a3a3]">
              Cumulative Net GEX
            </span>
            <span className="text-[9px] font-mono text-[#525252]">
              above zero = dealers stabilize · below = dealers amplify
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={filteredCum} margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis
                dataKey="strike"
                tick={{ ...TICK, fontSize: 9 }}
                tickFormatter={v => `$${v}`}
                angle={-35}
                textAnchor="end"
                interval="preserveStartEnd"
              />
              <YAxis tick={TICK} tickFormatter={fmtGEX} width={52} />
              <Tooltip content={<CumGEXTooltip />} />
              {/* Shaded regions: positive gamma = green tint, negative = red tint */}
              <Area type="monotone" dataKey="pos" fill="#22c55e" fillOpacity={0.07} stroke="none" />
              <Area type="monotone" dataKey="neg" fill="#ef4444" fillOpacity={0.07} stroke="none" />
              {/* Zero axis */}
              <ReferenceLine y={0} stroke="#333" strokeWidth={1.5} />
              {/* Spot */}
              <ReferenceLine
                x={underlyingPrice}
                stroke="#22c55e"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: "S", position: "top", fill: "#22c55e", fontSize: 10, fontFamily: "monospace" }}
              />
              {/* Gamma flip */}
              {gammaFlip != null && (
                <ReferenceLine
                  x={gammaFlip}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  label={{ value: `Flip $${gammaFlip}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 9, fontFamily: "monospace" }}
                />
              )}
              {/* Net GEX line */}
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Net GEX"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#60a5fa" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Interpretation */}
      <p className="text-[10px] font-mono text-[#525252] leading-relaxed">
        <span className="text-[#383838]">Positive gamma (above flip):</span> dealers long gamma → hedge by buying dips / selling rips → mean-reverting price action.{" "}
        <span className="text-[#383838]">Negative gamma (below flip):</span> dealers short gamma → hedge by chasing moves → trend-following / volatile price action.{" "}
        Approximate — assumes dealers are net short options. Contract multiplier = 100. All expirations aggregated.
      </p>
    </div>
  );
}
