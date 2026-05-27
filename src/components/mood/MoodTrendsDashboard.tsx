"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SavedMoodEntry, SupportNeed } from "@/lib/moodTypes";
import { supportOptions } from "@/lib/moodTypes";

type MoodTrendsDashboardProps = {
  entries: SavedMoodEntry[];
  username: string;
};

type TrendRange = "weekly" | "monthly" | "yearly";

type TrendBucket = {
  end: Date;
  entries: SavedMoodEntry[];
  label: string;
  shortLabel: string;
  start: Date;
};

type MoodCluster = {
  count: number;
  mood: string;
  tone: string;
  x: number;
  y: number;
};

const rangeOptions: Array<{
  description: string;
  label: string;
  value: TrendRange;
}> = [
  {
    description: "Last 7 days",
    label: "Weekly",
    value: "weekly",
  },
  {
    description: "Current month by week",
    label: "Monthly",
    value: "monthly",
  },
  {
    description: "Current year by month",
    label: "Yearly",
    value: "yearly",
  },
];

const moodTones = [
  "from-teal-500 to-emerald-400",
  "from-amber-400 to-orange-500",
  "from-sky-500 to-cyan-300",
  "from-rose-500 to-pink-400",
  "from-fuchsia-500 to-violet-400",
  "from-lime-500 to-teal-300",
];

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);

  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);

  return date;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverage(value: number) {
  return value > 0 ? value.toFixed(1) : "0.0";
}

function parseEntryDate(entry: SavedMoodEntry) {
  const date = new Date(entry.createdAt);

  return Number.isFinite(date.getTime()) ? date : null;
}

function getEntriesInRange(
  entries: SavedMoodEntry[],
  start: Date,
  end: Date,
) {
  const startTime = start.getTime();
  const endTime = end.getTime();

  return entries.filter((entry) => {
    const entryDate = parseEntryDate(entry);

    if (!entryDate) {
      return false;
    }

    const entryTime = entryDate.getTime();

    return entryTime >= startTime && entryTime <= endTime;
  });
}

function buildBuckets(range: TrendRange, entries: SavedMoodEntry[]) {
  const now = new Date();

  if (range === "weekly") {
    return Array.from({ length: 7 }).map((_, index) => {
      const start = startOfDay(addDays(now, index - 6));
      const end = endOfDay(start);

      return {
        end,
        entries: getEntriesInRange(entries, start, end),
        label: new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
        }).format(start),
        shortLabel: new Intl.DateTimeFormat("en", {
          weekday: "short",
        }).format(start),
        start,
      };
    });
  }

  if (range === "monthly") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const buckets: TrendBucket[] = [];
    let cursor = startOfDay(monthStart);
    let count = 1;

    while (cursor < nextMonth) {
      const start = new Date(cursor);
      const weekEnd = endOfDay(addDays(start, 6));
      const end = weekEnd < nextMonth ? weekEnd : endOfDay(addDays(nextMonth, -1));

      buckets.push({
        end,
        entries: getEntriesInRange(entries, start, end),
        label: `${new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
        }).format(start)}-${new Intl.DateTimeFormat("en", {
          day: "numeric",
        }).format(end)}`,
        shortLabel: `W${count}`,
        start,
      });

      cursor = startOfDay(addDays(end, 1));
      count += 1;
    }

    return buckets;
  }

  return Array.from({ length: 12 }).map((_, index) => {
    const start = new Date(now.getFullYear(), index, 1);
    const end = endOfDay(new Date(now.getFullYear(), index + 1, 0));

    return {
      end,
      entries: getEntriesInRange(entries, start, end),
      label: new Intl.DateTimeFormat("en", {
        month: "long",
      }).format(start),
      shortLabel: new Intl.DateTimeFormat("en", {
        month: "short",
      }).format(start),
      start,
    };
  });
}

function getMoodClusters(
  entries: SavedMoodEntry[],
  options: { repeatedOnly?: boolean } = {},
) {
  const moodCounts = new Map<string, number>();

  entries.forEach((entry) => {
    const mood = entry.mood.trim() || "Unnamed";
    moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
  });

  const clusterEntries = [...moodCounts.entries()]
    .filter(([, count]) => !options.repeatedOnly || count > 1)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 6);

  return clusterEntries.map(([mood, count], index): MoodCluster => {
    const clusterCount = clusterEntries.length;
    const angle = (Math.PI * 2 * index) / Math.max(1, clusterCount) - Math.PI / 2;
    const radius = index === 0 ? 0 : 37 + (index % 2) * 18;

    return {
      count,
      mood,
      tone: moodTones[index % moodTones.length],
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
    };
  });
}

function getMostFrequentMood(entries: SavedMoodEntry[]) {
  return getMoodClusters(entries)[0]?.mood ?? "No dominant mood yet";
}

function getSupportCounts(entries: SavedMoodEntry[]) {
  return supportOptions.map((option) => ({
    count: entries.filter((entry) => entry.supportNeed === option).length,
    option,
  }));
}

function getTrendCopy(range: TrendRange, entryCount: number, averageIntensity: number) {
  if (entryCount === 0) {
    return "No check-ins in this range yet. Add a few entries and this panel will begin showing patterns.";
  }

  if (averageIntensity >= 4) {
    return range === "weekly"
      ? "This week shows a stronger emotional signal. Consider where recovery or support may be useful."
      : "This period is showing higher intensity. Treat the pattern as a signal worth reviewing carefully.";
  }

  if (averageIntensity <= 2.25) {
    return "The pattern is lower in intensity. That may reflect steadiness, fatigue, or a lower-energy period.";
  }

  return "The pattern is balanced with some movement. Review the peaks and repeats to understand what shaped it.";
}

export function MoodTrendsDashboard({
  entries,
  username,
}: MoodTrendsDashboardProps) {
  const [range, setRange] = useState<TrendRange>("weekly");
  const buckets = useMemo(() => buildBuckets(range, entries), [entries, range]);
  const rangeEntries = useMemo(
    () => buckets.flatMap((bucket) => bucket.entries),
    [buckets],
  );
  const averageIntensity = average(
    rangeEntries.map((entry) => entry.intensity),
  );
  const checkInCount = rangeEntries.length;
  const peakBucket = [...buckets].sort(
    (first, second) =>
      average(second.entries.map((entry) => entry.intensity)) -
      average(first.entries.map((entry) => entry.intensity)),
  )[0];
  const peakLabel =
    peakBucket && peakBucket.entries.length > 0 ? peakBucket.label : "Not enough data";
  const mostFrequentMood = getMostFrequentMood(rangeEntries);
  const supportCounts = getSupportCounts(rangeEntries);
  const trendCopy = getTrendCopy(range, checkInCount, averageIntensity);

  return (
    <section
      aria-labelledby="mood-trends-title"
      className="mx-auto w-full max-w-7xl px-6 py-10"
    >
      <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Mood trends
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="mood-trends-title"
          >
            Patterns across your check-ins.
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-700">
            Built from @{username}&apos;s saved entries. Switch views to compare
            daily rhythm, weekly changes, and the longer yearly pattern.
          </p>
        </div>

        <div className="motion-panel rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            {rangeOptions.map((option) => {
              const isSelected = option.value === range;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`rounded-md border p-4 text-left transition ${
                    isSelected
                      ? "border-teal-500 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"
                  }`}
                  key={option.value}
                  onClick={() => setRange(option.value)}
                  type="button"
                >
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className="mt-1 block text-xs font-semibold">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="motion-panel mt-8 rounded-md border border-dashed border-slate-300 bg-white p-6">
          <h2 className="text-2xl font-bold text-slate-950">
            Trends will appear after your first check-in.
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Once you save entries, this page will turn them into trend lines,
            mood clusters, and support-preference patterns.
          </p>
          <Link className="btn btn-primary mt-5" href="/mood/check-in">
            Start a check-in
          </Link>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)]">
        <div className="motion-panel overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                Intensity trend
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {rangeOptions.find((option) => option.value === range)?.label} arc
              </h2>
            </div>
            <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
              {formatAverage(averageIntensity)}/5 average
            </span>
          </div>
          <TrendSkyline buckets={buckets} />
          <p className="border-t border-slate-100 p-5 text-sm font-semibold leading-6 text-slate-600">
            {trendCopy}
          </p>
        </div>

        <div className="grid gap-5">
          <StatCard label="Check-ins" value={String(checkInCount)} />
          <StatCard label="Most frequent mood" value={mostFrequentMood} />
          <StatCard label="Highest average" value={peakLabel} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <MoodOrbit clusters={getMoodClusters(rangeEntries, { repeatedOnly: true })} />
        <SupportSignalBars supportCounts={supportCounts} total={checkInCount} />
      </div>

      <div className="mt-5">
        <MoodHeatmap buckets={buckets} range={range} />
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="motion-list-item rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold leading-tight text-slate-950">
        {value}
      </p>
    </article>
  );
}

function TrendSkyline({ buckets }: { buckets: TrendBucket[] }) {
  const width = 720;
  const height = 280;
  const paddingX = 42;
  const paddingY = 34;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const points = buckets.map((bucket, index) => {
    const bucketAverage = average(bucket.entries.map((entry) => entry.intensity));
    const x =
      paddingX +
      (buckets.length === 1 ? 0 : (usableWidth * index) / (buckets.length - 1));
    const y = paddingY + usableHeight - (bucketAverage / 5) * usableHeight;

    return {
      bucket,
      bucketAverage,
      x,
      y,
    };
  });
  const path =
    points.length > 0
      ? points
          .map((point, index) =>
            index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
          )
          .join(" ")
      : "";
  const areaPath =
    points.length > 0
      ? `${path} L ${points[points.length - 1].x} ${height - paddingY} L ${
          points[0].x
        } ${height - paddingY} Z`
      : "";

  return (
    <div className="p-5">
      <svg
        aria-label="Mood intensity trend chart"
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="trend-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="trend-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>

        {[1, 2, 3, 4, 5].map((level) => {
          const y = paddingY + usableHeight - (level / 5) * usableHeight;

          return (
            <g key={level}>
              <line
                stroke="#94a3b8"
                strokeDasharray="4 8"
                strokeOpacity="0.22"
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
              <text
                fill="#64748b"
                fontSize="12"
                fontWeight="700"
                textAnchor="end"
                x={paddingX - 12}
                y={y + 4}
              >
                {level}
              </text>
            </g>
          );
        })}

        {areaPath ? <path d={areaPath} fill="url(#trend-area)" /> : null}
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="url(#trend-line)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ) : null}

        {points.map((point) => (
          <g key={`${point.bucket.label}-${point.x}`}>
            <circle
              cx={point.x}
              cy={point.y}
              fill={point.bucketAverage > 0 ? "#ffffff" : "#cbd5e1"}
              r="8"
              stroke={point.bucketAverage >= 4 ? "#e11d48" : "#0f766e"}
              strokeWidth="4"
            />
            <text
              fill="#475569"
              fontSize="12"
              fontWeight="800"
              textAnchor="middle"
              x={point.x}
              y={height - 8}
            >
              {point.bucket.shortLabel}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MoodOrbit({ clusters }: { clusters: MoodCluster[] }) {
  const largestCount = Math.max(...clusters.map((cluster) => cluster.count), 1);
  const hasClusters = clusters.length > 0;

  return (
    <section className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Mood orbit
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            Repeated feelings appear here.
          </h2>
        </div>
      </div>

      <div className="relative mx-auto mt-6 grid aspect-square max-w-md place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-8">
        <div
          aria-hidden="true"
          className="absolute inset-[14%] rounded-full border border-dashed border-teal-200"
        />
        <div
          aria-hidden="true"
          className="absolute inset-[27%] rounded-full border border-dashed border-amber-200"
        />
        {hasClusters ? (
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300"
          />
        ) : null}

        {!hasClusters ? (
          <div className="relative z-10 max-w-56 rounded-md border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-sm font-bold leading-6 text-slate-800">
              No repeated moods yet.
            </p>
          </div>
        ) : null}

        {clusters.map((cluster) => {
          const size = 3.6 + (cluster.count / largestCount) * 4.4;

          return (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              key={cluster.mood}
              style={{
                left: `${cluster.x}%`,
                top: `${cluster.y}%`,
              }}
            >
              <div
                className={`grid place-items-center rounded-full bg-gradient-to-br ${cluster.tone} p-3 text-center font-bold text-white shadow-lg`}
                style={{
                  height: `${size}rem`,
                  width: `${size}rem`,
                }}
                title={`${cluster.mood}: ${cluster.count}`}
              >
                <span className="max-w-24 text-xs leading-tight">
                  {cluster.mood}
                </span>
              </div>
              <p className="mt-1 text-center text-xs font-bold text-slate-500">
                {cluster.count}x
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SupportSignalBars({
  supportCounts,
  total,
}: {
  supportCounts: Array<{ count: number; option: SupportNeed }>;
  total: number;
}) {
  return (
    <section className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
        Support preferences
      </p>
      <h2 className="mt-1 text-2xl font-bold text-slate-950">
        What you requested most often.
      </h2>

      <div className="mt-6 grid gap-4">
        {supportCounts.map((support) => {
          const percentage = total > 0 ? (support.count / total) * 100 : 0;

          return (
            <div key={support.option}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-800">
                  {support.option}
                </p>
                <p className="text-sm font-bold text-slate-500">
                  {support.count}
                </p>
              </div>
              <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-600 via-sky-500 to-amber-400"
                  style={{ width: `${clamp(percentage, 0, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoodHeatmap({
  buckets,
  range,
}: {
  buckets: TrendBucket[];
  range: TrendRange;
}) {
  return (
    <section className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Intensity map
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            Average intensity by period.
          </h2>
        </div>
        <p className="text-sm font-semibold text-slate-500">
          {range === "weekly"
            ? "Daily"
            : range === "monthly"
              ? "Weekly blocks"
              : "Monthly blocks"}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {buckets.map((bucket) => {
          const bucketAverage = average(
            bucket.entries.map((entry) => entry.intensity),
          );
          const tone =
            bucketAverage >= 4
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : bucketAverage >= 3
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : bucketAverage > 0
                  ? "border-teal-200 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-slate-50 text-slate-600";

          return (
            <article
              className={`rounded-md border p-4 shadow-sm ${tone}`}
              key={bucket.label}
            >
              <p className="text-sm font-bold">{bucket.label}</p>
              <p className="mt-3 text-3xl font-bold">
                {bucket.entries.length > 0 ? formatAverage(bucketAverage) : "-"}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-normal">
                {bucket.entries.length} check-ins
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
