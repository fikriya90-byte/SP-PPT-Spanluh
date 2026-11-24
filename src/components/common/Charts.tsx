import React from 'react';

export interface BarDatum {
  label: string;
  value: number;
  max?: number;
  colorClass?: string;
}

export const CleanBarChart: React.FC<{ data: BarDatum[]; height?: number; unit?: string }> = ({
  data,
  unit = '',
}) => {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
        Belum ada data grafik tersedia.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const max = d.max ?? 100;
        const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
        return (
          <div key={d.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate pr-2">{d.label}</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {d.value}
                {unit}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${d.colorClass || 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface RadarDatum {
  label: string;
  value: number; // 0-100
}

export const StageRadarChart: React.FC<{ data: RadarDatum[] }> = ({ data }) => {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const levels = [25, 50, 75, 100];

  const getPoint = (index: number, val: number) => {
    const angle = (Math.PI * 2 * index) / data.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPoints = data
    .map((d, i) => {
      const pt = getPoint(i, d.value);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-60 h-60 overflow-visible">
        {levels.map((lvl) => {
          const pts = data
            .map((_, i) => {
              const p = getPoint(i, lvl);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={lvl}
              points={pts}
              fill="none"
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
          );
        })}
        {data.map((d, i) => {
          const outer = getPoint(i, 100);
          const labelPt = getPoint(i, 124);
          return (
            <g key={d.label}>
              <line
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-600 dark:fill-slate-300 text-[10px] font-semibold"
              >
                {d.label}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygonPoints}
          className="fill-amber-500/20 stroke-amber-500"
          strokeWidth="2"
        />
        {data.map((d, i) => {
          const pt = getPoint(i, d.value);
          return <circle key={d.label} cx={pt.x} cy={pt.y} r="3.5" className="fill-amber-500" />;
        })}
      </svg>
    </div>
  );
};
