import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicTrack } from './MusicPicker';

interface Props {
  track: MusicTrack;
  onChange: (start: number, segment: number) => void;
}

const BAR_COUNT = 60;

// Clip length options — 0 means "full / play to end"
const CLIP_OPTIONS = [
  { label: '5s',   value: 5  },
  { label: '10s',  value: 10 },
  { label: '15s',  value: 15 },
  { label: 'Full', value: 0  },
];

function lcgBars(seed: string): number[] {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
  s = s || 1;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    s = (s * 9301 + 49297) % 233280;
    const noise = s / 233280;
    const wave  = 0.5 + 0.5 * Math.sin((i / BAR_COUNT) * Math.PI * 6 + (s % 5));
    return Math.max(0.08, Math.min(1, 0.3 * noise + 0.7 * wave));
  });
}

function fmt(s: number) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MusicTrimmer({ track, onChange }: Props) {
  // Actual audio duration — loaded async
  const [total,      setTotal]      = useState(30);
  // Clip length chosen by user; 0 = full
  const [clipLen,    setClipLen]    = useState<number>(() => track.segment ?? 15);
  const [start,      setStart]      = useState<number>(() => track.start   ?? 0);
  const [playing,    setPlaying]    = useState(false);

  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const barRef    = useRef<HTMLDivElement | null>(null);
  const dragRef   = useRef<{ startX: number; baseStart: number } | null>(null);
  const startRef  = useRef(start);
  const clipRef   = useRef(clipLen);
  const totalRef  = useRef(total);
  startRef.current = start;
  clipRef.current  = clipLen;
  totalRef.current = total;

  const bars = useMemo(() => lcgBars(track.url), [track.url]);

  // Load actual duration from the audio file
  useEffect(() => {
    const a = new Audio(track.url);
    a.addEventListener('loadedmetadata', () => {
      const dur = isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
      setTotal(dur);
    }, { once: true });
    a.load();
  }, [track.url]);

  // Reset when track changes
  useEffect(() => {
    setStart(track.start ?? 0);
    setClipLen(track.segment ?? 15);
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }, [track.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent whenever start or clipLen changes
  useEffect(() => {
    onChange(start, clipLen);
  }, [start, clipLen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp start when clip length or total changes
  useEffect(() => {
    const effectiveLen = clipLen === 0 ? total : clipLen;
    const max = Math.max(0, total - effectiveLen);
    setStart(s => Math.min(s, max));
  }, [clipLen, total]);

  // Cleanup
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const effectiveSegment = clipLen === 0 ? total : clipLen;
  const maxStart = Math.max(0, total - effectiveSegment);

  // ── Preview playback ──────────────────────────────────────────────────────
  const togglePreview = useCallback(() => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    let a = audioRef.current;
    if (!a) { a = new Audio(track.url); audioRef.current = a; }

    const doPlay = () => {
      const s   = startRef.current;
      const seg = clipRef.current === 0 ? totalRef.current : clipRef.current;
      try { a!.currentTime = s; } catch {}
      a!.play().catch(() => {});
      setPlaying(true);

      const onTime = () => {
        if (a!.currentTime >= startRef.current + (clipRef.current === 0 ? totalRef.current : clipRef.current)) {
          a!.pause();
          setPlaying(false);
          a!.removeEventListener('timeupdate', onTime);
        }
      };
      // For "Full" clip just let it play to end
      if (clipRef.current !== 0) a!.addEventListener('timeupdate', onTime);
      a!.onended = () => setPlaying(false);
    };

    if (a.readyState >= 1) doPlay();
    else { a.addEventListener('loadedmetadata', doPlay, { once: true }); a.load(); }
  }, [playing, track.url]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const pxToSec = (dx: number) => (dx / (barRef.current?.clientWidth ?? 1)) * total;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, baseStart: start };
    e.stopPropagation();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const next = dragRef.current.baseStart + pxToSec(e.clientX - dragRef.current.startX);
    setStart(Math.max(0, Math.min(maxStart, next)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const startPct = total > 0 ? (start / total) * 100 : 0;
  const widthPct = total > 0 ? (effectiveSegment / total) * 100 : 100;

  return (
    <div className="space-y-3">
      {/* Track info + time badge */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePreview}
          className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-secondary"
          aria-label={playing ? 'Pause' : 'Play selected clip'}
        >
          <img src={track.artwork} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45">
            {playing
              ? <Pause className="w-4 h-4 text-white" fill="white" />
              : <Play  className="w-4 h-4 text-white" fill="white" />}
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
        </div>

        <div className="shrink-0 text-[11px] font-mono px-2.5 py-1 rounded-full bg-secondary/80 border border-border text-muted-foreground">
          {clipLen === 0
            ? `Full · ${fmt(total)}`
            : `${fmt(start)} – ${fmt(start + clipLen)}`}
        </div>
      </div>

      {/* Clip length selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground font-medium shrink-0">Clip:</span>
        <div className="flex gap-1">
          {CLIP_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setClipLen(opt.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold transition-all',
                clipLen === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Waveform — hidden when Full is selected (no trimming needed) */}
      {clipLen !== 0 ? (
        <div
          ref={barRef}
          className="relative h-12 rounded-xl overflow-hidden bg-secondary/50 select-none touch-none"
        >
          {/* Background bars */}
          <div className="absolute inset-x-0 inset-y-0 flex items-end gap-[2px] px-1 pb-1">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-muted-foreground/20"
                style={{ height: `${Math.round(h * 85)}%` }}
              />
            ))}
          </div>

          {/* Dim outside selection */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(to right,
                rgba(0,0,0,0.55) 0%,
                rgba(0,0,0,0.55) ${startPct}%,
                transparent ${startPct}%,
                transparent ${startPct + widthPct}%,
                rgba(0,0,0,0.55) ${startPct + widthPct}%,
                rgba(0,0,0,0.55) 100%)`,
            }}
          />

          {/* Colored bars inside window */}
          <div className="absolute inset-x-0 inset-y-0 flex items-end gap-[2px] px-1 pb-1 pointer-events-none">
            {bars.map((h, i) => {
              const bc = ((i + 0.5) / BAR_COUNT) * 100;
              return bc >= startPct && bc <= startPct + widthPct ? (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.round(h * 85)}%`,
                    background: 'linear-gradient(180deg,#ff6b00 0%,#d62976 55%,#833ab4 100%)',
                  }}
                />
              ) : <div key={i} className="flex-1" />;
            })}
          </div>

          {/* Draggable window */}
          <div
            className="absolute top-0 bottom-0 rounded-xl border-2 border-white/80 cursor-grab active:cursor-grabbing shadow-lg shadow-black/40"
            style={{ left: `${startPct}%`, width: `${widthPct}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
              {[0,1,2].map(k => <div key={k} className="w-0.5 h-2 bg-white/70 rounded-full" />)}
            </div>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
              {[0,1,2].map(k => <div key={k} className="w-0.5 h-2 bg-white/70 rounded-full" />)}
            </div>
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-white text-black rounded-full px-1.5 py-0.5 shadow whitespace-nowrap">
              {clipLen}s
            </div>
          </div>
        </div>
      ) : (
        /* Full song — simple progress bar visual */
        <div className="relative h-12 rounded-xl overflow-hidden bg-secondary/50">
          <div className="absolute inset-x-0 inset-y-0 flex items-end gap-[2px] px-1 pb-1">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.round(h * 85)}%`,
                  background: 'linear-gradient(180deg,#ff6b00 0%,#d62976 55%,#833ab4 100%)',
                  opacity: 0.7,
                }}
              />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-semibold text-white bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
              Full song plays · {fmt(total)}
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center select-none">
        {clipLen === 0
          ? 'Entire preview will play on your status'
          : 'Drag the window · choose clip length above'}
      </p>
    </div>
  );
}
