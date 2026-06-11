import { useEffect, useRef, useState } from 'react';
import { Search, Music, Play, Pause, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface MusicTrack {
  url: string;
  title: string;
  artist: string;
  artwork: string;
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
  onPick: (track: MusicTrack) => void;
}

export default function MusicPicker({ open, onOpenChange, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ITunesResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
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

  const togglePlay = (track: ITunesResult) => {
    if (!track.previewUrl) return;
    if (playingId === track.trackId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(track.previewUrl);
    audioRef.current = a;
    a.play().catch(() => {});
    a.onended = () => setPlayingId(null);
    setPlayingId(track.trackId);
  };

  const choose = (track: ITunesResult) => {
    if (!track.previewUrl) return;
    audioRef.current?.pause();
    setPlayingId(null);
    onPick({
      url: track.previewUrl,
      title: track.trackName,
      artist: track.artistName,
      artwork: track.artworkUrl100.replace('100x100', '300x300'),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" /> Add music
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

        <ScrollArea className="h-80">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No results</p>
          )}
          {!loading && !query && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Search for a track to add a 30-second preview to your status
            </p>
          )}
          <div className="space-y-1 pr-3">
            {results.map((t) => (
              <div
                key={t.trackId}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary group"
              >
                <div className="relative w-12 h-12 shrink-0">
                  <img src={t.artworkUrl100} alt="" className="w-12 h-12 rounded-md object-cover" />
                  <button
                    onClick={() => togglePlay(t)}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-md transition-opacity"
                    aria-label={playingId === t.trackId ? 'Pause' : 'Preview'}
                  >
                    {playingId === t.trackId ? (
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
                  onClick={() => choose(t)}
                  className="shrink-0 gap-1 px-3"
                >
                  <Check className="w-4 h-4" />
                  <span>Add</span>
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
