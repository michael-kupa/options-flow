"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart, Line, Legend,
  ComposedChart,
} from "recharts";
import type { MaxPainSection } from "../api/options/route";

// ── Shared chart theme ────────────────────────────────────────────────────────

const TICK = { fill: "#737373", fontSize: 10, fontFamily: "monospace" } as const;
const GRID = { stroke: "#1f1f1f", strokeDasharray: "3 3" } as const;
const TOOLTIP_STYLE = {
  background: "#1a1a1a", border: "1px solid #262626",
  borderRadius: 4, fontFamily: "monospace", fontSize: 11,
};
const LABEL_STYLE = { color: "#e5e5e5" };

const C_CALL = "#22c55e";
const C_PUT  = "#ef4444";
const C_SPOT = "#a78bfa";
const C_PAIN = "#f59e0b";

type StrikeRange = "all" | "20";
type SeriesFilter = "both" | "calls" | "puts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(v: number) {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

function fmtK(v: number) {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));
}

function filterStrikes<T extends { strike: number }>(
  data: T[], spot: number, range: StrikeRange
): T[] {
  if (range === "all") return data;
  const lo = spot * 0.80;
  const hi = spot * 1.20;
  return data.filter(d => d.strike >= lo && d.strike <= hi);
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</span>
      <span className={`font-mono text-sm font-bold ${color ?? "text-[#e5e5e5]"}`}>{value}</span>
    </div>
  );
}

function SectionStats({ section }: { section: MaxPainSection }) {
  const distColor = section.distance > 0 ? "text-emerald-400" : section.distance < 0 ? "text-red-400" : "text-[#e5e5e5]";
  const distSign = section.distance >= 0 ? "+" : "";
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded border border-[#262626] bg-[#0f0f0f] px-4 py-3 sm:grid-cols-6">
      <StatCell label="Spot" value={`$${section.currentPrice.toFixed(2)}`} color="text-[#a78bfa]" />
      <StatCell label="Max Pain" value={`$${section.maxPainStrike}`} color="text-[#f59e0b]" />
      <StatCell
        label="Distance"
        value={`${distSign}$${Math.abs(section.distance).toFixed(2)} (${distSign}${section.distancePct.toFixed(1)}%)`}
        color={distColor}
      />
      <StatCell label="Call OI" value={section.totalCallOI.toLocaleString()} color="text-emerald-400" />
      <StatCell label="Put OI" value={section.totalPutOI.toLocaleString()} color="text-red-400" />
      <StatCell
        label="P/C Ratio"
        value={section.pcRatio != null ? section.pcRatio.toFixed(2) : "—"}
        color={section.pcRatio != null && section.pcRatio > 1.2 ? "text-red-400" : section.pcRatio != null && section.pcRatio < 0.8 ? "text-emerald-400" : "text-[#e5e5e5]"}
      />
    </div>
  );
}

// ── Chart 1: Max Pain Distribution ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PainTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const callPain = payload.find((p: any) => p.dataKey === "callPain")?.value ?? 0;
  const putPain  = payload.find((p: any) => p.dataKey === "putPain")?.value ?? 0;
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-[#f59e0b]">Strike ${label}</div>
      <div className="text-emerald-400">Call Pain: {fmtM(callPain)}</div>
      <div className="text-red-400">Put Pain:  {fmtM(putPain)}</div>
      <div className="text-[#e5e5e5]">Total: {fmtM(callPain + putPain)}</div>
    </div>
  );
}

function MaxPainDistributionChart({
  section, strikeRange, showCalls, showPuts,
}: { section: MaxPainSection; strikeRange: StrikeRange; showCalls: boolean; showPuts: boolean }) {
  const data = useMemo(
    () => filterStrikes(section.strikes, section.currentPrice, strikeRange),
    [section, strikeRange]
  );
  if (!data.length) return <div className="flex h-48 items-center justify-center text-xs text-[#737373]">No data</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="strike" tick={{ ...TICK, fontSize: 9 }} tickFormatter={v => `$${v}`} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={fmtM} width={52} />
        <Tooltip content={<PainTooltip />} />
        <ReferenceLine x={section.currentPrice} stroke={C_SPOT} strokeWidth={1.5} strokeDasharray="4 2"
          label={{ value: `Spot $${section.currentPrice}`, position: "top", fill: C_SPOT, fontSize: 9, fontFamily: "monospace" }} />
        <ReferenceLine x={section.maxPainStrike} stroke={C_PAIN} strokeWidth={2} strokeDasharray="4 2"
          label={{ value: `Pain $${section.maxPainStrike}`, position: "insideTopRight", fill: C_PAIN, fontSize: 9, fontFamily: "monospace" }} />
        {showCalls && <Bar dataKey="callPain" name="Call Pain" stackId="a" fill={C_CALL} fillOpacity={0.75} />}
        {showPuts  && <Bar dataKey="putPain"  name="Put Pain"  stackId="a" fill={C_PUT}  fillOpacity={0.75} radius={[2, 2, 0, 0]} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 2: OI by Strike (mirrored) ─────────────────────────────────────────

interface OIPoint { strike: number; callOI: number; putOI: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OITooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const callOI = payload.find((p: any) => p.dataKey === "callOI")?.value ?? 0;
  const putOI  = Math.abs(payload.find((p: any) => p.dataKey === "putOI")?.value ?? 0);
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-[#f59e0b]">Strike ${label}</div>
      <div className="text-emerald-400">Call OI: {callOI.toLocaleString()}</div>
      <div className="text-red-400">Put OI:  {putOI.toLocaleString()}</div>
    </div>
  );
}

function OIByStrikeChart({
  section, strikeRange, showCalls, showPuts,
}: { section: MaxPainSection; strikeRange: StrikeRange; showCalls: boolean; showPuts: boolean }) {
  const data = useMemo<OIPoint[]>(
    () => filterStrikes(
      section.strikes.map(s => ({ strike: s.strike, callOI: s.callOI, putOI: -s.putOI })),
      section.currentPrice, strikeRange
    ),
    [section, strikeRange]
  );
  if (!data.length) return <div className="flex h-48 items-center justify-center text-xs text-[#737373]">No data</div>;

  const maxVal = Math.max(...data.map(d => Math.max(Math.abs(d.callOI), Math.abs(d.putOI))));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="strike" tick={{ ...TICK, fontSize: 9 }} tickFormatter={v => `$${v}`} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={v => fmtK(Math.abs(v))} domain={[-maxVal * 1.1, maxVal * 1.1]} width={44} />
        <Tooltip content={<OITooltip />} />
        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
        <ReferenceLine x={section.currentPrice} stroke={C_SPOT} strokeWidth={1.5} strokeDasharray="4 2" />
        <ReferenceLine x={section.maxPainStrike} stroke={C_PAIN} strokeWidth={1.5} strokeDasharray="4 2" />
        {showCalls && <Bar dataKey="callOI" name="Call OI" fill={C_CALL} fillOpacity={0.75} radius={[2, 2, 0, 0]} />}
        {showPuts  && <Bar dataKey="putOI"  name="Put OI"  fill={C_PUT}  fillOpacity={0.75} radius={[0, 0, 2, 2]} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 3: IV Skew mini ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IVTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs font-mono shadow-xl">
      <div className="mb-1 text-[#f59e0b]">Strike ${label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? `${p.value.toFixed(1)}%` : "—"}
        </div>
      ))}
    </div>
  );
}

function IVSkewMiniChart({
  section, strikeRange, showCalls, showPuts,
}: { section: MaxPainSection; strikeRange: StrikeRange; showCalls: boolean; showPuts: boolean }) {
  const data = useMemo(
    () => filterStrikes(
      section.strikes.filter(s => s.callIV != null || s.putIV != null),
      section.currentPrice, strikeRange
    ),
    [section, strikeRange]
  );
  if (!data.length) return <div className="flex h-48 items-center justify-center text-xs text-[#737373]">No IV data</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="strike" tick={{ ...TICK, fontSize: 9 }} tickFormatter={v => `$${v}`} angle={-35} textAnchor="end" interval="preserveStartEnd" />
        <YAxis tick={TICK} tickFormatter={v => `${v.toFixed(0)}%`} width={40} />
        <Tooltip content={<IVTooltip />} />
        <ReferenceLine x={section.currentPrice} stroke={C_SPOT} strokeWidth={1.5} strokeDasharray="4 2"
          label={{ value: "S", position: "top", fill: C_SPOT, fontSize: 10, fontFamily: "monospace" }} />
        {showCalls && (
          <Line type="monotone" dataKey="callIV" name="Call IV" stroke={C_CALL} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
        )}
        {showPuts && (
          <Line type="monotone" dataKey="putIV" name="Put IV" stroke={C_PUT} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
        )}
        {(showCalls || showPuts) && (
          <Legend wrapperStyle={{ fontSize: 10, color: "#737373", fontFamily: "monospace", paddingTop: 2 }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Section renderer ──────────────────────────────────────────────────────────

function MaxPainSectionView({
  section, ticker, showCalls, showPuts, strikeRange,
}: {
  section: MaxPainSection;
  ticker: string;
  showCalls: boolean;
  showPuts: boolean;
  strikeRange: StrikeRange;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const dte = Math.round(section.daysToExp);

  return (
    <div className="rounded border border-[#262626] bg-[#111] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#f59e0b]">
            {section.label} ({dte} DTE)
          </span>
          <span className="font-mono text-sm font-bold text-white">
            {ticker} — Max Pain — {section.expiration}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#a78bfa]">Spot ${section.currentPrice.toFixed(2)}</span>
          <span className="font-mono text-xs text-[#f59e0b]">Pain ${section.maxPainStrike}</span>
          <span className={`text-xs font-mono ${collapsed ? "text-[#737373]" : "text-[#525252]"}`}>
            {collapsed ? "▶" : "▼"}
          </span>
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-4 px-4 pb-4">
          {/* Stats */}
          <SectionStats section={section} />

          {/* Charts: 3-col grid on large, stacked on mobile */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[#737373] font-mono">Max Pain Distribution</div>
              <MaxPainDistributionChart section={section} strikeRange={strikeRange} showCalls={showCalls} showPuts={showPuts} />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[#737373] font-mono">Open Interest by Strike</div>
              <OIByStrikeChart section={section} strikeRange={strikeRange} showCalls={showCalls} showPuts={showPuts} />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[#737373] font-mono">IV Skew</div>
              <IVSkewMiniChart section={section} strikeRange={strikeRange} showCalls={showCalls} showPuts={showPuts} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

interface ToggleGroupProps<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}
function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex overflow-hidden rounded border border-[#262626] text-xs">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 transition-colors ${
            value === o.value
              ? "bg-[#f59e0b] font-semibold text-black"
              : "bg-[#111] text-[#a3a3a3] hover:bg-[#1a1a1a]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface MaxPainAnalyticsPanelProps {
  maxPainSections: MaxPainSection[];
  ticker: string;
  underlyingPrice: number;
}

export default function MaxPainAnalyticsPanel({
  maxPainSections,
  ticker,
  underlyingPrice,
}: MaxPainAnalyticsPanelProps) {
  const [seriesFilter, setSeriesFilter] = useState<SeriesFilter>("both");
  const [strikeRange, setStrikeRange] = useState<StrikeRange>("20");

  const showCalls = seriesFilter !== "puts";
  const showPuts  = seriesFilter !== "calls";

  if (!maxPainSections.length) {
    return (
      <div className="rounded border border-[#262626] bg-[#111] p-6 text-center text-sm text-[#737373]">
        No max pain data available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Shared controls */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-[#f59e0b]">
          {ticker} · Multi-Expiration Max Pain
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup<SeriesFilter>
            options={[
              { label: "Both",  value: "both"  },
              { label: "Calls", value: "calls" },
              { label: "Puts",  value: "puts"  },
            ]}
            value={seriesFilter}
            onChange={setSeriesFilter}
          />
          <ToggleGroup<StrikeRange>
            options={[
              { label: "All",   value: "all" },
              { label: "±20%",  value: "20"  },
            ]}
            value={strikeRange}
            onChange={setStrikeRange}
          />
        </div>
      </div>

      {/* Sections */}
      {maxPainSections.map(section => (
        <MaxPainSectionView
          key={section.expiration}
          section={section}
          ticker={ticker}
          showCalls={showCalls}
          showPuts={showPuts}
          strikeRange={strikeRange}
        />
      ))}
    </div>
  );
}
