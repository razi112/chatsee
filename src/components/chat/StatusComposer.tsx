import { useRef, useState, useCallback } from 'react';
import { Image as ImageIcon, Type, X, Send, Music, ArrowUp, ArrowDown, Scissors } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import MusicPicker, { MusicTrack } from './MusicPicker';
import MusicTrimmer from './MusicTrimmer';

const BG_COLORS = [
  'hsl(220, 70%, 50%)',
  'hsl(160, 70%, 40%)',
  'hsl(340, 70%, 50%)',
  'hsl(45,  90%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(0,   0%,  20%)',
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPosted: () => void;
}

export default function StatusComposer({ open, onOpenChange, onPosted }: Props) {
  const { user } = useAuth();

  const [mode,       setMode]       = useState<'text' | 'media'>('text');
  const [text,       setText]       = useState('');
  const [bgColor,    setBgColor]    = useState(BG_COLORS[0]);
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [caption,    setCaption]    = useState('');
  const [posting,    setPosting]    = useState(false);
  const [music,      setMusic]      = useState<MusicTrack[]>([]);
  const [musicOpen,  setMusicOpen]  = useState(false);
  const [trimIdx,    setTrimIdx]    = useState<number | null>(null); // which track is being trimmed

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode('text'); setText(''); setBgColor(BG_COLORS[0]);
    setFile(null); setPreview(null); setCaption('');
    setPosting(false); setMusic([]); setTrimIdx(null);
  };

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error('File too large (max 25 MB)'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setMode('media');
    // Reset input so the same file can be re-picked
    e.target.value = '';
  };

  // Called by MusicTrimmer for each track — store start/segment back into music array
  const handleTrimChange = useCallback((i: number, start: number, segment: number) => {
    setMusic(prev => {
      if (prev[i]?.start === start && prev[i]?.segment === segment) return prev;
      const copy = [...prev];
      copy[i] = { ...copy[i], start, segment };
      return copy;
    });
  }, []);

  const moveTrack = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= music.length) return;
    setMusic(prev => {
      const c = [...prev];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    if (trimIdx === i) setTrimIdx(j);
    else if (trimIdx === j) setTrimIdx(i);
  };

  const removeTrack = (i: number) => {
    setMusic(prev => prev.filter((_, k) => k !== i));
    if (trimIdx === i) setTrimIdx(null);
    else if (trimIdx !== null && trimIdx > i) setTrimIdx(trimIdx - 1);
  };

  const post = async () => {
    if (!user) return;
    setPosting(true);

    const first = music[0];
    const musicFields = first ? {
      music_url:      first.url,
      music_title:    first.title,
      music_artist:   first.artist,
      music_artwork:  first.artwork,
      music_playlist: music,       // full array with start/segment included
    } : {};

    try {
      if (mode === 'text') {
        if (!text.trim()) { setPosting(false); return; }
        const { error } = await supabase.from('statuses').insert({
          user_id: user.id, type: 'text',
          content: text.trim(), background_color: bgColor,
          ...musicFields,
        } as any);
        if (error) throw error;
      } else {
        if (!file) { setPosting(false); return; }
        const ext  = file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('status-media').upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('status-media').getPublicUrl(path);
        const { error } = await supabase.from('statuses').insert({
          user_id: user.id,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          content: pub.publicUrl, caption: caption.trim() || null,
          ...musicFields,
        } as any);
        if (error) throw error;
      }
      toast.success('Status posted!');
      onPosted();
      handleClose(false);
    } catch (e: any) {
      toast.error('Failed to post status', { description: e.message });
      setPosting(false);
    }
  };

  const canPost = mode === 'text' ? !!text.trim() : !!file;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center justify-between">
            <span className="text-base font-semibold">New status</span>
            <div className="flex items-center gap-1">
              <Button
                size="icon" variant={mode === 'text'  ? 'default' : 'ghost'}
                onClick={() => setMode('text')}
                title="Text status"
              >
                <Type className="w-4 h-4" />
              </Button>
              <Button
                size="icon" variant={mode === 'media' ? 'default' : 'ghost'}
                onClick={() => fileInputRef.current?.click()}
                title="Photo / video status"
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button
                size="icon" variant={music.length > 0 ? 'default' : 'ghost'}
                onClick={() => setMusicOpen(true)}
                title="Add music"
              >
                <Music className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] px-5 py-4 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onFileChange}
          />

          {/* Content area */}
          {mode === 'text' ? (
            <>
              <div
                className="rounded-2xl p-6 min-h-[180px] flex items-center justify-center shadow-inner"
                style={{ backgroundColor: bgColor }}
              >
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="What's on your mind?"
                  className="bg-transparent border-0 text-center text-white text-xl placeholder:text-white/50 resize-none focus-visible:ring-0 min-h-0"
                  maxLength={200}
                  autoFocus
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-center">
                {BG_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setBgColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-transform',
                      bgColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {preview ? (
                <div className="rounded-xl overflow-hidden bg-secondary relative">
                  {file?.type.startsWith('video/') ? (
                    <video src={preview} controls className="w-full max-h-[280px]" />
                  ) : (
                    <img src={preview} alt="" className="w-full max-h-[280px] object-contain" />
                  )}
                  <Button
                    size="icon" variant="secondary"
                    className="absolute top-2 right-2 h-7 w-7 opacity-80 hover:opacity-100"
                    onClick={() => { setFile(null); setPreview(null); setMode('text'); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-sm">Choose photo or video</span>
                </button>
              )}
              <Input
                placeholder="Add a caption (optional)"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                maxLength={120}
                className="bg-secondary/50 border-border"
              />
            </div>
          )}

          {/* Music section */}
          {music.length > 0 && (
            <div className="rounded-xl bg-secondary/40 border border-border/60 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {music.length} song{music.length > 1 ? 's' : ''} · plays in order
                  </span>
                </div>
                <button
                  onClick={() => setMusicOpen(true)}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Edit
                </button>
              </div>

              {/* Track list */}
              <div className="divide-y divide-border/30">
                {music.map((m, i) => (
                  <div key={m.url} className="px-3 py-3 space-y-3">
                    {/* Track row */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono w-4 text-center text-muted-foreground shrink-0">{i + 1}</span>
                      <div className="relative w-10 h-10 shrink-0">
                        <img src={m.artwork} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate leading-tight">{m.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.artist}</p>
                        {m.start !== undefined && m.segment !== undefined && (
                          <p className="text-[10px] text-primary font-mono mt-0.5">
                            {Math.floor(m.start)}s – {Math.floor(m.start + m.segment)}s · {m.segment}s clip
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setTrimIdx(trimIdx === i ? null : i)}
                          title="Trim"
                        >
                          <Scissors className={cn("w-3.5 h-3.5", trimIdx === i && "text-primary")} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => moveTrack(i, -1)} disabled={i === 0}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => moveTrack(i, 1)} disabled={i === music.length - 1}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTrack(i)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Trimmer — only shown for the selected track */}
                    {trimIdx === i && (
                      <div className="pt-1">
                        <MusicTrimmer
                          track={m}
                          onChange={(start, segment) => handleTrimChange(i, start, segment)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add music CTA when none selected */}
          {music.length === 0 && (
            <button
              onClick={() => setMusicOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Music className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">Add music</p>
                <p className="text-xs text-muted-foreground">Pick songs from trending or search</p>
              </div>
            </button>
          )}
        </div>

        {/* Post button */}
        <div className="px-5 py-4 border-t border-border/60">
          <Button
            onClick={post}
            disabled={posting || !canPost}
            className="w-full h-11 font-semibold"
          >
            <Send className="w-4 h-4 mr-2" />
            {posting ? 'Posting…' : 'Post status'}
          </Button>
        </div>
      </DialogContent>

      <MusicPicker
        open={musicOpen}
        onOpenChange={setMusicOpen}
        onPick={(tracks) => {
          setMusic(tracks);
          // Preserve existing trim settings for tracks that were already in the list
          setMusic(prev => tracks.map(t => {
            const existing = prev.find(p => p.url === t.url);
            return existing ? { ...t, start: existing.start, segment: existing.segment } : t;
          }));
        }}
        initialTracks={music}
      />
    </Dialog>
  );
}
