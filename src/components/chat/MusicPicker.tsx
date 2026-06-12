import { useEffect, useRef, useState } from 'react';
import { Search, Music, Play, Pause, Check, Loader2, Flame, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MusicTrack {
  url: string;
  title: string;
  artist: string;
  artwork: string;
  start?: number;   // seconds into preview where playback begins
  segment?: number; // seconds of preview to play
}

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (tracks: MusicTrack[]) => void;
  initialTracks?: MusicTrack[];
}

const TRENDING_TERMS = ['top hits 2026', 'viral pop', 'trending', 'global top 50'];

export default function MusicPicker({ open, onOpenChange, onPick, initialTracks }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ITunesResult[]>([]);
  const [trending, setTrending] = useState<ITunesResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [picked, setPicked] = useState<MusicTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(initialTracks ? [...initialTracks] : []);
    } else {
      audioRef.current?.pause();
      setPlayingUrl(null);
    }
  }, [open]);

  // Load trending list once when opened
  useEffect(() => {
    if (!open || trending.length) return;
    (async () => {
      setTrendingLoading(true);
      try {
        // Try the iTunes top-songs RSS first (real chart data)
        const rss = await fetch('https://itunes.apple.com/us/rss/topsongs/limit=25/json').then(r => r.json()).catch(() => null);
        const entries = rss?.feed?.entry as any[] | undefined;
        if (entries?.length) {
          const mapped: ITunesResult[] = entries.map((e: any, i: number) => {
            const preview = (e.link || []).find((l: any) => l.attributes?.rel === 'enclosure')?.attributes?.href;
            const img = e['im:image']?.[2]?.label || e['im:image']?.[0]?.label;
            return {
              trackId: Number(e.id?.attributes?.['im:id']) || i,
              trackName: e['im:name']?.label || 'Unknown',
              artistName: e['im:artist']?.label || '',
              artworkUrl100: img,
              previewUrl: preview,
            };
          }).filter((r: ITunesResult) => r.previewUrl);
          if (mapped.length) { setTrending(mapped); return; }
        }
        // Fallback: aggregate searches of trending terms
        const all: ITunesResult[] = [];
        for (const term of TRENDING_TERMS) {
          const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=10`)
            .then(r => r.json()).catch(() => null);
          if (r?.results) all.push(...r.results.filter((x: ITunesResult) => x.previewUrl));
        }
        const seen = new Set<number>();
        setTrending(all.filter(t => !seen.has(t.trackId) && (seen.add(t.trackId), true)).slice(0, 25));
      } finally {
        setTrendingLoading(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=25`
        );
        const data = await res.json();
        setResults((data.results || []).filter((r: ITunesResult) => r.previewUrl));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch(() => {});
    a.onended = () => setPlayingUrl(null);
    setPlayingUrl(url);
  };

  const isPicked = (url?: string) => !!url && picked.some(p => p.url === url);

  const togglePick = (t: ITunesResult) => {
    if (!t.previewUrl) return;
    const url = t.previewUrl;
    if (isPicked(url)) {
      setPicked(picked.filter(p => p.url !== url));
    } else {
      setPicked([...picked, {
        url,
        title: t.trackName,
        artist: t.artistName,
        artwork: t.artworkUrl100.replace('100x100', '300x300'),
      }]);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= picked.length) return;
    const copy = [...picked];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setPicked(copy);
  };

  const confirm = () => {
    audioRef.current?.pause();
    setPlayingUrl(null);
    onPick(picked);
    onOpenChange(false);
  };

  const renderRow = (t: ITunesResult) => {
    const url = t.previewUrl!;
    const selected = isPicked(url);
    return (
      <div
        key={t.trackId}
        className={cn(
          'flex w-full items-center gap-3 p-2 rounded-lg group',
          selected ? 'bg-primary/10' : 'hover:bg-secondary'
        )}
      >
        <div className="relative w-12 h-12 shrink-0">
          <img src={t.artworkUrl100} alt="" className="w-12 h-12 rounded-md object-cover" />
          <button
            onClick={() => togglePlay(url)}
            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-md transition-opacity"
            aria-label={playingUrl === url ? 'Pause' : 'Preview'}
          >
            {playingUrl === url ? (
              <Pause className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Play className="w-5 h-5 text-white" fill="white" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{t.trackName}</p>
          <p className="text-xs text-muted-foreground truncate">{t.artistName}</p>
        </div>
        <Button
          size="sm"
          variant={selected ? 'secondary' : 'default'}
          onClick={() => togglePick(t)}
          className="shrink-0 gap-1 px-3"
        >
          {selected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{selected ? 'Added' : 'Add'}</span>
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" /> Add music
            {picked.length > 0 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {picked.length} selected
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search songs or artists..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-secondary border-0"
          />
        </div>

        {/* Selected playlist with reorder */}
        {picked.length > 0 && (
          <div className="rounded-lg border border-border p-2 space-y-1 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground px-1">Your playlist (in order)</p>
            {picked.map((p, i) => (
              <div key={p.url} className="flex items-center gap-2 p-1.5 rounded-md bg-secondary/60">
                <span className="text-xs font-mono w-5 text-center text-muted-foreground">{i + 1}</span>
                <img src={p.artwork} alt="" className="w-8 h-8 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.artist}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === picked.length - 1}>
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPicked(picked.filter((_, k) => k !== i))}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="h-72 overflow-y-auto overflow-x-hidden">
          {query ? (
            <>
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && results.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No results</p>
              )}
              <div className="space-y-1 pr-1">{results.map(renderRow)}</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Flame className="w-3.5 h-3.5 text-orange-500" /> Trending now
              </div>
              {trendingLoading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!trendingLoading && trending.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Search for a track to add a preview to your status
                </p>
              )}
              <div className="space-y-1 pr-1">{trending.map(renderRow)}</div>
            </>
          )}
        </div>

        <Button onClick={confirm} disabled={picked.length === 0} className="w-full">
          <Check className="w-4 h-4 mr-2" />
          {picked.length === 0 ? 'Select at least one song' : `Use ${picked.length} song${picked.length > 1 ? 's' : ''}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
