"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

const compactInr = (v: number) =>
  v >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : v >= 1000
      ? `₹${Math.round(v / 1000)}k`
      : `₹${v}`;

export function RevenueChart({
  data,
}: {
  data: { label: string; billed: number; collected: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={{ stroke: "#e2e8f0" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={compactInr}
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
          }}
          cursor={{ fill: "rgba(31,78,130,0.06)" }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="billed" name="Billed" fill="#b3cde8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" name="Collected" fill="#1f4e82" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Pending: "#94a3b8",
  "In Progress": "#2c63a1",
  "Under Review": "#ee7526",
  Completed: "#57a838",
};

export function StatusDonut({
  data,
}: {
  data: { status: string; count: number }[];
}) {
  const active = data.filter((d) => d.count > 0);
  const total = active.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
        No tasks yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={active}
          dataKey="count"
          nameKey="status"
          innerRadius={62}
          outerRadius={92}
          paddingAngle={2}
          stroke="none"
        >
          {active.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#cbd5e1"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            fontSize: 12,
          }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span className="text-slate-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
