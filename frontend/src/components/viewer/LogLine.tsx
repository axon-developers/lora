import React from 'react';
import { LogEntry } from '../../types';

interface LogLineProps {
  entry: LogEntry;
  filterText?: string;
  showContainerBadge?: boolean;
  showPodBadge?: boolean;
  isSelected?: boolean;
  onSelect?: (entry: LogEntry) => void;
}

export const LogLine: React.FC<LogLineProps> = React.memo(({
  entry,
  filterText,
  showContainerBadge = true,
  showPodBadge = false,
  isSelected = false,
  onSelect,
}) => {
  const getSeverityStyle = (msg: string) => {
    const upper = msg.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('FATAL') || upper.includes('EXCEPTION') || upper.includes('FAIL')) {
      return 'text-rose-600 dark:text-rose-400 bg-rose-500/5';
    }
    if (upper.includes('WARN') || upper.includes('WARNING')) {
      return 'text-amber-700 dark:text-amber-300 bg-amber-500/5';
    }
    if (upper.includes('INFO')) {
      return 'text-slate-800 dark:text-slate-200';
    }
    if (upper.includes('DEBUG') || upper.includes('TRACE')) {
      return 'text-slate-500 dark:text-slate-400';
    }
    return 'text-slate-700 dark:text-slate-300';
  };

  const getBadge = (name: string, isPod = false) => {
    if (!name || name === '_all_') return null;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const podColors = [
      'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/60',
      'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/60',
      'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800/60',
      'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800/60',
      'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/60',
    ];

    const containerColors = [
      'text-cyan-800 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800/60',
      'text-fuchsia-800 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/60 border-fuchsia-200 dark:border-fuchsia-800/60',
      'text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60',
      'text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60',
      'text-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60',
    ];

    const palette = isPod ? podColors : containerColors;
    const color = palette[Math.abs(hash) % palette.length];

    return (
      <span
        className={`text-[9px] px-1 py-0.2 rounded border font-mono select-none mr-1.5 shrink-0 ${color}`}
        title={`${isPod ? 'Pod' : 'Container'}: ${name}`}
      >
        {name}
      </span>
    );
  };

  const highlightMatches = (text: string, query?: string) => {
    if (!query || query.trim() === '') return text;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-300 dark:bg-yellow-400/30 text-yellow-950 dark:text-yellow-200 rounded px-0.5 font-bold">
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
    <div
      onClick={() => onSelect?.(entry)}
      className={`flex items-start font-mono text-[11px] leading-[20px] px-3 py-0.5 group cursor-pointer transition select-text ${severityClass} ${isSelected
          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-l-2 border-indigo-600 dark:border-indigo-500 pl-[10px]'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
        }`}
    >
      {/* Sequence # */}
      <span className="w-12 shrink-0 text-slate-400 dark:text-slate-600 select-none text-right pr-3 font-mono text-[10px]">
        {entry.seq}
      </span>

      {/* Timestamp */}
      <span className="w-24 shrink-0 text-slate-500 dark:text-slate-500 select-none text-[10px] font-mono pr-3">
        {formattedTime}
      </span>

      {/* Message Content */}
      <span className="flex-1 break-all whitespace-pre-wrap flex items-baseline">
        {showPodBadge && entry.pod_name && getBadge(entry.pod_name, true)}
        {showContainerBadge && entry.container && getBadge(entry.container, false)}
        <span>{highlightMatches(entry.message, filterText)}</span>
      </span>
    </div>
  );
});
