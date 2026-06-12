import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicTrack } from './MusicPicker';

interface Props {
  track: MusicTrack;
  onChange: (start: number, segment: number) => void;
  totalDuration?: number; // defaults to 30 (iTunes preview length)
}

const BAR_COUNT = 64;
const DEFAULT_TOTAL = 30;
const SEGMENT = 15;

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function generateBars(seed: string) {
  const h0 = hash(seed);
  const out: number[] = [];
  let s = h0 || 1;
  for (let i = 0; i < BAR_COUNT; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    // smooth-ish wave
    const wave = 0.5 + 0.5 * Math.sin((i / BAR_COUNT) * Math.PI * 4 + (h0 % 7));
    out.push(0.25 + 0.75 * (0.6 * r + 0.4 * wave));
  }
  return out;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function MusicTrimmer({ track, onChange, totalDuration = DEFAULT_TOTAL }: Props) {
  const segment = Math.min(SEGMENT, totalDuration);
  const maxStart = Math.max(0, totalDuration - segment);
  const [start, setStart] = useState(track.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ startX: number; baseStart: number } | null>(null);

  const bars = useMemo(() => generateBars(track.url), [track.url]);

  // Notify parent on change
  useEffect(() => {
    onChange(start, segment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, segment]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePreview = () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const a = audioRef.current ?? new Audio(track.url);
    audioRef.current = a;
    a.currentTime = start;
    a.play().catch(() => {});
    setPlaying(true);
    const onTime = () => {
      if (a.currentTime >= start + segment) {
        a.pause();
        setPlaying(false);
        a.removeEventListener('timeupdate', onTime);
      }
    };
    a.addEventListener('timeupdate', onTime);
    a.onended = () => setPlaying(false);
  };

  const pixelsToSeconds = (dx: number) => {
    const w = trackRef.current?.clientWidth ?? 1;
    return (dx / w) * totalDuration;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { startX: e.clientX, baseStart: start };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const next = Math.min(maxStart, Math.max(0, draggingRef.current.baseStart + pixelsToSeconds(dx)));
    setStart(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const startPct = (start / totalDuration) * 100;
  const widthPct = (segment / totalDuration) * 100;

  return (
    <div className="space-y-2">
      {/* Track info */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePreview}
          className="relative w-12 h-12 shrink-0 rounded-md overflow-hidden bg-secondary"
          aria-label={playing ? 'Pause preview' : 'Play preview'}
        >
          <img src={track.artwork} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            {playing ? <Pause className="w-5 h-5 text-white" fill="white" /> : <Play className="w-5 h-5 text-white" fill="white" />}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
        </div>
        <div className="shrink-0 text-[11px] font-mono px-2 py-1 rounded-full bg-secondary border border-border">
          {formatTime(start)} – {formatTime(start + segment)}
        </div>
      </div>

      {/* Waveform + draggable window */}
      <div
        ref={trackRef}
        className="relative h-14 rounded-xl bg-secondary/60 px-1 select-none touch-none overflow-hidden"
      >
        {/* Bars */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-1">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-full bg-muted-foreground/40"
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>

        {/* Highlighted window (Instagram-style gradient) */}
        <div
          className={cn(
            'absolute top-0 bottom-0 rounded-xl',
            'ring-2 ring-white shadow-lg cursor-grab active:cursor-grabbing',
          )}
          style={{
            left: `${startPct}%`,
            width: `${widthPct}%`,
            background:
              'linear-gradient(90deg, rgba(255,107,0,0.35), rgba(214,41,118,0.35), rgba(131,58,180,0.35))',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Bars inside window in vivid gradient color (mask via mix-blend) */}
          <div className="absolute inset-0 flex items-center gap-[2px] px-1 pointer-events-none overflow-hidden">
            {bars.map((h, i) => {
              const barPct = ((i + 0.5) / BAR_COUNT) * 100;
              const inside = barPct >= startPct && barPct <= startPct + widthPct;
              if (!inside) return <div key={i} className="flex-1" />;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${Math.round(h * 100)}%`,
                    background:
                      'linear-gradient(180deg, #ff6b00, #d62976 50%, #833ab4)',
                  }}
                />
              );
            })}
          </div>
          {/* segment seconds badge */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-white text-black rounded-full px-1.5 py-[1px] shadow">
            {segment}s
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Drag the colored window to choose the part of the song to play
      </p>
    </div>
  );
}
