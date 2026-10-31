"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type StageDatum = { label: string; percent: number; points: number; maxPoints: number };

/** Stage correctness as horizontal bars: one series, one hue, labelled values. */
export function StageChart({ stages }: { stages: StageDatum[] }) {
  return (
    <div className="h-36 w-full" role="img" aria-label={stages.map((s) => `${s.label} ${Math.round(s.percent)}%`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stages} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={64}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
          />
          <Tooltip
            cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
            content={({ active, payload }) => {
              const datum = active ? (payload?.[0]?.payload as StageDatum | undefined) : undefined;
              if (!datum) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground">
                  <p className="font-medium">{datum.label}</p>
                  <p className="mt-0.5 text-muted-foreground tabular-nums">
                    {Math.round(datum.percent)}% correct · {datum.points.toFixed(1)} / {datum.maxPoints.toFixed(1)} points
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="percent"
            fill="var(--primary)"
            radius={[0, 4, 4, 0]}
            barSize={14}
            background={{ fill: "var(--surface-2)", radius: 4 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="percent"
              position="right"
              formatter={(value) => `${Math.round(Number(value))}%`}
              style={{ fill: "var(--foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
