import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ShotAnalysisProps {
  data: { time: number; power: number }[];
}

const ShotAnalysis: React.FC<ShotAnalysisProps> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="w-full h-48 bg-white/90 p-2 rounded-lg shadow-sm">
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Swing Velocity Analysis</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="time" hide />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ display: 'none' }}
          />
          <Line
            type="monotone"
            dataKey="power"
            stroke="#16a34a"
            strokeWidth={3}
            dot={false}
            animationDuration={1500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ShotAnalysis;
