"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { OptionSnapshot } from "../api/options/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChartPoint {
  strike: number;
  callIV?: number;
  putIV?: number;
  callDelta?: number;
  putDelta?: number;
  callGamma?: number;
  putGamma?: number;
  callTheta?: number;
  putTheta?: number;
  callVega?: number;
  putVega?: number;
}

type SeriesType = "both" | "calls" | "puts";
type StrikeRange = "all" | "15" | "30";
type GreekKey = "delta" | "gamma" | "theta" | "vega";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildChartData(
  surface: OptionSnapshot[],
  expiry: string,
  spot: number,
  strikeRange: StrikeRange
): ChartPoint[] {
  const filtered = surface.filter(c => c.expiration === expiry);

  let lo = 0;
  let hi = Infinity;
  if (strikeRange === "15") {
    lo = spot * 0.85;
    hi = spot * 1.15;
  } else if (strikeRange === "30") {
    lo = spot * 0.70;
    hi = spot * 1.30;
  }

  const map = new Map<number, ChartPoint>();
  for (const c of filtered) {
    if (c.strike < lo || c.strike > hi) continue;
    const pt = map.get(c.strike) ?? { strike: c.strike };
    if (c.type === "call") {
      pt.callIV    = +(c.iv * 100).toFixed(2);
      pt.callDelta = +c.delta.toFixed(4);
      pt.callGamma = +c.gamma.toFixed(6);
      pt.callTheta = +c.theta.toFixed(4);
      pt.callVega  = +c.vega.toFixed(4);
    } else {
      pt.putIV    = +(c.iv * 100).toFixed(2);
      pt.putDelta = +c.delta.toFixed(4);
      pt.putGamma = +c.gamma.toFixed(6);
      pt.putTheta = +c.theta.toFixed(4);
      pt.putVega  = +c.vega.toFixed(4);
    }
    map.set(c.strike, pt);
  }

  return [...map.values()].sort((a, b) => a.strike - b.strike);
}

function atm(data: ChartPoint[], spot: number): ChartPoint | undefined {
  if (!data.length) return undefined;
  return data.reduce((a, b) =>
    Math.abs(a.strike - spot) < Math.abs(b.strike - spot) ? a : b
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label, unit, spot, expiry }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-mono text-[#f59e0b]">Strike {label}</div>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => (
          <div key={p.name} style={{ color: p.color }} className="flex gap-3">
            <span className="w-16">{p.name}</span>
            <span className="font-mono">
              {typeof p.value === "number"
                ? `${p.value.toFixed(unit === "%" ? 1 : 4)}${unit ?? ""}`
                : "—"}
            </span>
          </div>
        )
      )}
      {spot && (
        <div className="mt-1 text-[#737373]">
          Spot <span className="font-mono text-[#d97706]">{spot.toFixed(2)}</span>
        </div>
      )}
      {expiry && <div className="text-[#737373]">Exp {expiry}</div>}
    </div>
  );
}

// ── Reusable line chart ───────────────────────────────────────────────────────

interface LineChartPanelProps {
  data: ChartPoint[];
  callKey: keyof ChartPoint;
  putKey: keyof ChartPoint;
  series: SeriesType;
  spot: number;
  expiry: string;
  unit?: string;
  yLabel?: string;
  yFormatter?: (v: number) => string;
}

function LineChartPanel({
  data, callKey, putKey, series, spot, expiry, unit, yLabel, yFormatter,
}: LineChartPanelProps) {
  const fmt = yFormatter ?? ((v: number) => `${v}${unit ?? ""}`);

  return (
    <div className="rounded bg-[#f8fafc] p-2" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="strike"
            tick={{ fontSize: 10, fill: "#374151" }}
            tickFormatter={v => `$${v}`}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#374151" }}
            tickFormatter={fmt}
            label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 9, fill: "#6b7280" } } : undefined}
            width={50}
          />
          <Tooltip
            content={<DarkTooltip unit={unit} spot={spot} expiry={expiry} />}
          />
          <ReferenceLine
            x={spot}
            stroke="#d97706"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "S", position: "top", fill: "#d97706", fontSize: 10 }}
          />
          {(series === "both" || series === "calls") && (
            <Line
              type="monotone"
              dataKey={callKey as string}
              name="Call"
              stroke="#2563eb"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#2563eb" }}
            />
          )}
          {(series === "both" || series === "puts") && (
            <Line
              type="monotone"
              dataKey={putKey as string}
              name="Put"
              stroke="#dc2626"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: "#dc2626" }}
            />
          )}
          {series === "both" && (
            <Legend
              wrapperStyle={{ fontSize: 10, color: "#374151", paddingTop: 2 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Stats block ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}
function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded border border-[#262626] bg-[#111] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className="font-mono text-base text-[#f59e0b]">{value}</div>
      {sub && <div className="text-[10px] text-[#525252]">{sub}</div>}
    </div>
  );
}

interface IVStatsProps {
  data: ChartPoint[];
  spot: number;
  expiry: string;
  daysToExp: number;
}

function IVStats({ data, spot, expiry, daysToExp }: IVStatsProps) {
  const calls = data.filter(d => d.callIV != null);
  const puts  = data.filter(d => d.putIV  != null);
  const avgCallIV = calls.length
    ? calls.reduce((s, d) => s + d.callIV!, 0) / calls.length
    : null;
  const avgPutIV = puts.length
    ? puts.reduce((s, d) => s + d.putIV!, 0) / puts.length
    : null;

  const atmPt   = atm(data, spot);
  const atmCallIV = atmPt?.callIV ?? null;
  const atmPutIV  = atmPt?.putIV  ?? null;

  const impliedMove = atmCallIV != null
    ? (((atmCallIV / 100) * Math.sqrt(daysToExp / 365)) * spot).toFixed(2)
    : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard
        label="Avg Call IV"
        value={avgCallIV != null ? `${avgCallIV.toFixed(1)}%` : "—"}
      />
      <StatCard
        label="Avg Put IV"
        value={avgPutIV != null ? `${avgPutIV.toFixed(1)}%` : "—"}
      />
      <StatCard
        label="ATM Call IV"
        value={atmCallIV != null ? `${atmCallIV.toFixed(1)}%` : "—"}
        sub={`Strike ${atmPt?.strike ?? "—"}`}
      />
      <StatCard
        label="ATM Put IV"
        value={atmPutIV != null ? `${atmPutIV.toFixed(1)}%` : "—"}
        sub={impliedMove != null ? `±$${impliedMove} move` : undefined}
      />
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
    <div className="flex rounded border border-[#262626] overflow-hidden text-xs">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 transition-colors ${
            value === o.value
              ? "bg-[#f59e0b] text-black font-semibold"
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

interface OptionsAnalyticsPanelProps {
  ivSurface: OptionSnapshot[];
  expirations: string[];
  underlyingPrice: number;
  ticker: string;
}

export default function OptionsAnalyticsPanel({
  ivSurface,
  expirations,
  underlyingPrice,
  ticker,
}: OptionsAnalyticsPanelProps) {
  const [selectedExpiry, setSelectedExpiry] = useState<string>(expirations[0] ?? "");
  const [series, setSeries] = useState<SeriesType>("both");
  const [strikeRange, setStrikeRange] = useState<StrikeRange>("30");

  const expiry = selectedExpiry || expirations[0] || "";
  const daysToExp = useMemo(() => {
    const found = ivSurface.find(c => c.expiration === expiry);
    return found?.daysToExp ?? 0;
  }, [ivSurface, expiry]);

  const chartData = useMemo(
    () => buildChartData(ivSurface, expiry, underlyingPrice, strikeRange),
    [ivSurface, expiry, underlyingPrice, strikeRange]
  );

  const greekCfg: { key: GreekKey; label: string; callKey: keyof ChartPoint; putKey: keyof ChartPoint; unit?: string; yLabel?: string }[] = [
    { key: "delta", label: "Delta",  callKey: "callDelta", putKey: "putDelta", yLabel: "Δ" },
    { key: "gamma", label: "Gamma",  callKey: "callGamma", putKey: "putGamma", yLabel: "Γ" },
    { key: "theta", label: "Theta",  callKey: "callTheta", putKey: "putTheta", yLabel: "Θ/day" },
    { key: "vega",  label: "Vega",   callKey: "callVega",  putKey: "putVega",  yLabel: "ν/1%" },
  ];

  if (!expirations.length) {
    return (
      <div className="rounded border border-[#262626] bg-[#111] p-6 text-center text-sm text-[#737373]">
        No options data available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header + controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[#f59e0b]">
          {ticker} · IV Skew &amp; Greeks
        </h2>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Expiry selector */}
          <select
            value={expiry}
            onChange={e => setSelectedExpiry(e.target.value)}
            className="rounded border border-[#262626] bg-[#111] px-2 py-1 text-xs text-[#e5e5e5] focus:outline-none"
          >
            {expirations.map(exp => (
              <option key={exp} value={exp}>{exp}</option>
            ))}
          </select>

          {/* Series toggle */}
          <ToggleGroup<SeriesType>
            options={[
              { label: "Both",  value: "both"  },
              { label: "Calls", value: "calls" },
              { label: "Puts",  value: "puts"  },
            ]}
            value={series}
            onChange={setSeries}
          />

          {/* Strike range */}
          <ToggleGroup<StrikeRange>
            options={[
              { label: "All",   value: "all" },
              { label: "±30%",  value: "30"  },
              { label: "±15%",  value: "15"  },
            ]}
            value={strikeRange}
            onChange={setStrikeRange}
          />
        </div>
      </div>

      {/* ── Stats block ── */}
      <IVStats
        data={chartData}
        spot={underlyingPrice}
        expiry={expiry}
        daysToExp={daysToExp}
      />

      {/* ── IV Skew chart ── */}
      <div className="rounded border border-[#262626] bg-[#111] p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
          IV Skew — {expiry} ({daysToExp}d)
        </div>
        <LineChartPanel
          data={chartData}
          callKey="callIV"
          putKey="putIV"
          series={series}
          spot={underlyingPrice}
          expiry={expiry}
          unit="%"
          yLabel="IV %"
          yFormatter={v => `${v.toFixed(0)}%`}
        />
      </div>

      {/* ── 2×2 Greeks grid ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {greekCfg.map(g => (
          <div key={g.key} className="rounded border border-[#262626] bg-[#111] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
              {g.label}
            </div>
            <LineChartPanel
              data={chartData}
              callKey={g.callKey}
              putKey={g.putKey}
              series={series}
              spot={underlyingPrice}
              expiry={expiry}
              yLabel={g.yLabel}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
