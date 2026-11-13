import { CheckCircle2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore } from '../store/useAppStore';
import type { Poll } from '../types/index';

interface PollResultChartProps {
  poll: Poll;
  currentUserId?: string;
  onVote: (pollId: string, optionId: string) => void;
}

const CHART_COLORS = ['#dc2626', '#ef4444', '#b91c1c', '#f87171', '#991b1b', '#525252'];

export function PollResultChart({ poll, currentUserId, onVote }: PollResultChartProps) {
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);

  const data = poll.options.map((opt, idx) => {
    const count = opt.votes.length;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const voted = currentUserId ? opt.votes.includes(currentUserId) : false;
    return {
      id: opt.id,
      name: opt.label.length > 18 ? `${opt.label.slice(0, 17)}…` : opt.label,
      fullName: opt.label,
      votes: count,
      pct,
      voted,
      color: CHART_COLORS[idx % CHART_COLORS.length],
    };
  });

  return (
    <div
      data-testid={`poll-chart-${poll.id}`}
      className="mt-2.5 max-w-xl p-4 rounded-xl ios-glass-card bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 dir="auto" className="font-display font-semibold text-sm text-neutral-900 dark:text-neutral-100">
          {poll.question}
        </h4>
        <span className="text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400 shrink-0">
          {totalVotes} {isFa ? 'رأی' : totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      {/* Recharts Visual Breakdown (explicit LTR SVG geometry so labels never overlap bars in RTL) */}
      <div dir="ltr" className="w-full" style={{ height: Math.max(120, data.length * 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
          >
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={168}
              axisLine={false}
              tickLine={false}
              tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) => (
                <text
                  x={Number(x) - 8}
                  y={Number(y)}
                  dy={4}
                  textAnchor="end"
                  fill="#525252"
                  fontSize={11}
                  fontFamily="var(--font-sans, sans-serif)"
                >
                  {payload?.value ?? ''}
                </text>
              )}
            />
            <Tooltip
              cursor={{ fill: 'rgba(220, 38, 38, 0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const item = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg bg-neutral-900 dark:bg-neutral-800 text-white px-3 py-2 text-xs shadow-lg border border-red-900/50">
                    <div className="font-semibold">{item.fullName}</div>
                    <div className="font-mono tabular-nums text-red-300 mt-0.5">
                      {item.votes} {isFa ? 'رأی' : item.votes === 1 ? 'vote' : 'votes'} ({item.pct}%)
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="votes"
              radius={[0, 6, 6, 0]}
              barSize={18}
              isAnimationActive={false}
              onClick={(entry) => {
                if (entry?.id) onVote(poll.id, String(entry.id));
              }}
              className="cursor-pointer"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={entry.voted ? '#dc2626' : entry.color}
                  fillOpacity={entry.voted ? 1 : 0.72}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive Vote Selection Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
        {data.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onVote(poll.id, opt.id)}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs text-start transition-colors ${
              opt.voted
                ? 'border-red-500 bg-red-50/70 dark:bg-red-950/40 text-red-700 dark:text-red-200 font-semibold'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-red-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-200'
            }`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              {opt.voted ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
              ) : (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
              )}
              <span dir="auto" className="truncate">{opt.fullName}</span>
            </span>
            <span className="font-mono tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
              {opt.pct}% ({opt.votes})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
