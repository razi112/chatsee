import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search, Music, Play, Pause, Check, Loader2,
  Flame, ArrowUp, ArrowDown, X, Plus, ListMusic,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Section = 'trending' | 'selected' | 'search';

export interface MusicTrack {
  url: string;
  title: string;
  artist: string;
  artwork: string;
  start?: number;
  segment?: number;
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

const TRENDING_TERMS = ['top hits 2025', 'viral pop 2025', 'global top 50', 'hot right now'];

export default function MusicPicker({ open, onOpenChange, onPick, initialTracks }: Props) {
  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState<ITunesResult[]>([]);
  const [trending,       setTrending]       = useState<ITunesResult[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [trendingLoad,   setTrendingLoad]   = useState(false);
  const [playingUrl,     setPlayingUrl]     = useState<string | null>(null);
  const [picked,         setPicked]         = useState<MusicTrack[]>([]);
  const [section,        setSection]        = useState<Section>('trending');

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync picked with initialTracks when dialog opens ────────────────────
  useEffect(() => {
    if (open) {
      setPicked(initialTracks ? [...initialTracks] : []);
      setSection('trending');
      setQuery('');
    } else {
      stopAudio();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => stopAudio(), []);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingUrl(null);
  };

  // ── Load trending once per open ──────────────────────────────────────────
  useEffect(() => {
    if (!open || trending.length > 0) return;
    (async () => {
      setTrendingLoad(true);
      try {
        // Try iTunes top-songs RSS
        const rss = await fetch('https://itunes.apple.com/us/rss/topsongs/limit=25/json')
          .then(r => r.json()).catch(() => null);
        const entries = rss?.feed?.entry as any[] | undefined;
        if (entries?.length) {
          const mapped: ITunesResult[] = entries.map((e: any, i: number) => {
            const previewLink = (e.link || []).find((l: any) => l.attributes?.rel === 'enclosure');
            const preview     = previewLink?.attributes?.href;
            const img         = e['im:image']?.[2]?.label || e['im:image']?.[0]?.label;
            return {
              trackId:       Number(e.id?.attributes?.['im:id']) || i,
              trackName:     e['im:name']?.label     || 'Unknown',
              artistName:    e['im:artist']?.label   || '',
              artworkUrl100: img || '',
              previewUrl:    preview,
            };
          }).filter((r: ITunesResult) => r.previewUrl);
          if (mapped.length) { setTrending(mapped); setTrendingLoad(false); return; }
        }
        // Fallback: aggregate searches
        const all: ITunesResult[] = [];
        const seen = new Set<number>();
        for (const term of TRENDING_TERMS) {
          const r = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=12`
          ).then(r => r.json()).catch(() => null);
          if (r?.results) {
            for (const t of r.results as ITunesResult[]) {
              if (t.previewUrl && !seen.has(t.trackId)) {
                seen.add(t.trackId);
                all.push(t);
              }
            }
          }
        }
        setTrending(all.slice(0, 30));
      } finally {
        setTrendingLoad(false);
      }
    })();
  }, [open, trending.length]);

  // ── Debounced search ────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=30`
        );
        const data = await res.json();
        setResults((data.results || []).filter((r: ITunesResult) => r.previewUrl));
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Auto-switch to search tab when typing
  useEffect(() => {
    if (query.trim() && section !== 'search') setSection('search');
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio preview ────────────────────────────────────────────────────────
  const togglePlay = useCallback((url: string) => {
    if (playingUrl === url) { stopAudio(); return; }
    stopAudio();
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch(() => {});
    a.onended = () => setPlayingUrl(null);
    setPlayingUrl(url);
  }, [playingUrl]);

  // ── Pick / reorder ────────────────────────────────────────────────────────
  const isPicked  = (url?: string) => !!url && picked.some(p => p.url === url);

  const togglePick = (t: ITunesResult) => {
    if (!t.previewUrl) return;
    const url = t.previewUrl;
    if (isPicked(url)) {
      setPicked(prev => prev.filter(p => p.url !== url));
    } else {
      setPicked(prev => [...prev, {
        url,
        title:   t.trackName,
        artist:  t.artistName,
        artwork: t.artworkUrl100.replace('100x100bb', '400x400bb').replace('100x100', '300x300'),
      }]);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= picked.length) return;
    setPicked(prev => {
      const c = [...prev];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  const confirm = () => {
    stopAudio();
    onPick(picked);
    onOpenChange(false);
  };

  // ── Row renderer ──────────────────────────────────────────────────────────
  const renderRow = (t: ITunesResult) => {
    const url      = t.previewUrl!;
    const selected = isPicked(url);
    const isPlaying = playingUrl === url;

    return (
      <div
        key={t.trackId}
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
          selected ? 'bg-primary/10' : 'hover:bg-secondary/70'
        )}
      >
        {/* Artwork + play overlay */}
        <div className="relative w-11 h-11 shrink-0">
          <img
            src={t.artworkUrl100}
            alt=""
            className="w-11 h-11 rounded-lg object-cover shadow"
          />
          <button
            onClick={() => togglePlay(url)}
            className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity"
            aria-label={isPlaying ? 'Pause' : 'Preview'}
          >
            {isPlaying
              ? <Pause className="w-4 h-4 text-white" fill="white" />
              : <Play  className="w-4 h-4 text-white" fill="white" />}
          </button>
          {/* Playing indicator ring */}
          {isPlaying && (
            <span className="absolute inset-0 rounded-lg ring-2 ring-primary animate-pulse pointer-events-none" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">{t.trackName}</p>
          <p className="text-xs text-muted-foreground truncate">{t.artistName}</p>
        </div>

        <button
          onClick={() => togglePick(t)}
          aria-label={selected ? 'Remove' : 'Add'}
          className={cn(
            'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all',
            selected
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground hover:bg-primary/20'
          )}
        >
          {selected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {selected ? 'Added' : 'Add'}
        </button>
      </div>
    );
  };

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'trending', label: 'Trending', icon: <Flame    className="w-3.5 h-3.5" /> },
    { id: 'search',   label: 'Search',   icon: <Search   className="w-3.5 h-3.5" /> },
    { id: 'selected', label: `Queue${picked.length ? ` · ${picked.length}` : ''}`,
                                          icon: <ListMusic className="w-3.5 h-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Music className="w-4 h-4 text-primary" />
            Add music to status
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border/60 px-3">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors relative',
                section === t.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.icon}{t.label}
              {section === t.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Search bar (trending + search tabs) */}
        {section !== 'selected' && (
          <div className="px-4 pt-3 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search songs or artists…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9 bg-secondary/60 border-0 focus-visible:ring-1 focus-visible:ring-primary h-9 text-sm"
              />
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="h-[380px] overflow-y-auto overflow-x-hidden scrollbar-thin px-2 py-2">

          {/* TRENDING */}
          {section === 'trending' && (
            <>
              {!query.trim() && (
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 pb-2 flex items-center gap-1.5">
                  <Flame className="w-3 h-3 text-orange-400" /> Trending now
                </p>
              )}
              {trendingLoad && (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!trendingLoad && trending.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Could not load trending tracks
                </p>
              )}
              <div className="space-y-0.5">
                {(query.trim() ? results : trending).map(renderRow)}
              </div>
            </>
          )}

          {/* SEARCH */}
          {section === 'search' && (
            <>
              {!query.trim() ? (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
                  <Search className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Type above to search</p>
                </div>
              ) : loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No results</p>
              ) : (
                <div className="space-y-0.5">{results.map(renderRow)}</div>
              )}
            </>
          )}

          {/* QUEUE / SELECTED */}
          {section === 'selected' && (
            <>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 pb-2 flex items-center gap-1.5">
                <ListMusic className="w-3 h-3" /> Playlist · plays in order
              </p>
              {picked.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[280px] gap-3">
                  <ListMusic className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No songs added yet</p>
                  <button
                    onClick={() => setSection('trending')}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    Browse trending →
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 px-1">
                  {picked.map((p, i) => (
                    <div
                      key={p.url}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-secondary/60"
                    >
                      <span className="text-xs font-mono w-4 text-muted-foreground shrink-0">{i + 1}</span>
                      <div className="relative w-10 h-10 shrink-0">
                        <img src={p.artwork} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        <button
                          onClick={() => togglePlay(p.url)}
                          className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 hover:opacity-100 rounded-lg transition-opacity"
                        >
                          {playingUrl === p.url
                            ? <Pause className="w-3.5 h-3.5 text-white" fill="white" />
                            : <Play  className="w-3.5 h-3.5 text-white" fill="white" />}
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.artist}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => move(i, -1)} disabled={i === 0}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => move(i, 1)} disabled={i === picked.length - 1}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setPicked(prev => prev.filter((_, k) => k !== i))}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/60 bg-card">
          <Button
            onClick={confirm}
            disabled={picked.length === 0}
            className="w-full h-10 font-semibold"
          >
            <Check className="w-4 h-4 mr-2" />
            {picked.length === 0
              ? 'Select at least one song'
              : `Use ${picked.length} song${picked.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
