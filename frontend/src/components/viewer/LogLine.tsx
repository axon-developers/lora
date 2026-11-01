import React from 'react';
import { LogEntry } from '../../types';

interface LogLineProps {
  entry: LogEntry;
  filterText?: string;
  showContainerBadge?: boolean;
}

export const LogLine: React.FC<LogLineProps> = React.memo(({ entry, filterText, showContainerBadge = true }) => {
  const getSeverityStyle = (msg: string) => {
    const upper = msg.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('FATAL') || upper.includes('EXCEPTION') || upper.includes('FAIL')) {
      return 'text-rose-400 bg-rose-500/5';
    }
    if (upper.includes('WARN') || upper.includes('WARNING')) {
      return 'text-amber-300 bg-amber-500/5';
    }
    if (upper.includes('INFO')) {
      return 'text-slate-200';
    }
    if (upper.includes('DEBUG') || upper.includes('TRACE')) {
      return 'text-slate-400';
    }
    return 'text-slate-300';
  };

  const getContainerBadge = (name: string) => {
    if (!name || name === '_all_') return null;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'text-cyan-400 bg-cyan-950/60 border-cyan-800/60',
      'text-fuchsia-400 bg-fuchsia-950/60 border-fuchsia-800/60',
      'text-emerald-400 bg-emerald-950/60 border-emerald-800/60',
      'text-amber-400 bg-amber-950/60 border-amber-800/60',
      'text-violet-400 bg-violet-950/60 border-violet-800/60',
      'text-pink-400 bg-pink-950/60 border-pink-800/60',
    ];
    const color = colors[Math.abs(hash) % colors.length];
    return (
      <span className={`text-[9px] px-1 py-0.2 rounded border font-mono select-none mr-2 shrink-0 ${color}`}>
        {name}
      </span>
    );
  };

  const highlightMatches = (text: string, query?: string) => {
    if (!query || query.trim() === '') return text;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5 font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Format timestamp (ISO or local time)
  let formattedTime = entry.timestamp;
  try {
    const d = new Date(entry.timestamp);
    if (!isNaN(d.getTime())) {
      const timeStr = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      formattedTime = `${timeStr}.${ms}`;
    }
  } catch {
    // Keep raw timestamp
  }

  const severityClass = getSeverityStyle(entry.message);

  return (
    <div className={`flex items-start font-mono text-[11px] leading-[20px] hover:bg-slate-800/50 px-3 py-0.5 group select-text ${severityClass}`}>
      {/* Sequence # */}
      <span className="w-12 shrink-0 text-slate-600 select-none text-right pr-3 font-mono text-[10px]">
        {entry.seq}
      </span>

      {/* Timestamp */}
      <span className="w-24 shrink-0 text-slate-500 select-none text-[10px] font-mono pr-3">
        {formattedTime}
      </span>

      {/* Message Content */}
      <span className="flex-1 break-all whitespace-pre-wrap flex items-baseline">
        {showContainerBadge && entry.container && getContainerBadge(entry.container)}
        <span>{highlightMatches(entry.message, filterText)}</span>
      </span>
    </div>
  );
});
