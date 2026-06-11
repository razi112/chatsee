import { useRef, useState } from 'react';
import { Image as ImageIcon, Type, X, Send, Music, ArrowUp, ArrowDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import MusicPicker, { MusicTrack } from './MusicPicker';

const BG_COLORS = [
  'hsl(220, 70%, 50%)',
  'hsl(160, 70%, 40%)',
  'hsl(340, 70%, 50%)',
  'hsl(45, 90%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 0%, 20%)',
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPosted: () => void;
}

export default function StatusComposer({ open, onOpenChange, onPosted }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'text' | 'media'>('text');
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [musicOpen, setMusicOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode('text');
    setText('');
    setBgColor(BG_COLORS[0]);
    setFile(null);
    setPreview(null);
    setCaption('');
    setPosting(false);
    setMusic([]);
  };

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      toast.error('File too large (max 25MB)');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setMode('media');
  };

  const post = async () => {
    if (!user) return;
    setPosting(true);
    const first = music[0];
    const musicFields: Record<string, any> = first
      ? {
          music_url: first.url,
          music_title: first.title,
          music_artist: first.artist,
          music_artwork: first.artwork,
          music_playlist: music,
        }
      : {};
    try {
      if (mode === 'text') {
        if (!text.trim()) { setPosting(false); return; }
        const { error } = await supabase.from('statuses').insert({
          user_id: user.id,
          type: 'text',
          content: text.trim(),
          background_color: bgColor,
          ...musicFields,
        } as any);
        if (error) throw error;
      } else {
        if (!file) { setPosting(false); return; }
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('status-media')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('status-media').getPublicUrl(path);
        const isVideo = file.type.startsWith('video/');
        const { error } = await supabase.from('statuses').insert({
          user_id: user.id,
          type: isVideo ? 'video' : 'image',
          content: pub.publicUrl,
          caption: caption.trim() || null,
          ...musicFields,
        } as any);
        if (error) throw error;
      }
      toast.success('Status posted');
      onPosted();
      handleClose(false);
    } catch (e: any) {
      toast.error('Failed to post status', { description: e.message });
      setPosting(false);
    }
  };

  const moveMusic = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= music.length) return;
    const copy = [...music];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setMusic(copy);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>New status</span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant={mode === 'text' ? 'default' : 'ghost'}
                onClick={() => setMode('text')}
              >
                <Type className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant={mode === 'media' ? 'default' : 'ghost'}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant={music.length > 0 ? 'default' : 'ghost'}
                onClick={() => setMusicOpen(true)}
                title="Add music"
              >
                <Music className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onFileChange}
        />

        {mode === 'text' ? (
          <>
            <div
              className="rounded-lg p-6 min-h-[200px] flex items-center justify-center"
              style={{ backgroundColor: bgColor }}
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a status..."
                className="bg-transparent border-0 text-center text-white text-xl placeholder:text-white/60 resize-none focus-visible:ring-0"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-center">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2',
                    bgColor === c ? 'border-primary' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {preview ? (
              <div className="rounded-lg overflow-hidden bg-secondary relative">
                {file?.type.startsWith('video/') ? (
                  <video src={preview} controls className="w-full max-h-[300px]" />
                ) : (
                  <img src={preview} alt="" className="w-full max-h-[300px] object-contain" />
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => { setFile(null); setPreview(null); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="h-32">
                <ImageIcon className="w-6 h-6 mr-2" /> Choose photo or video
              </Button>
            )}
            <Input
              placeholder="Add a caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
            />
          </>
        )}

        {music.length > 0 && (
          <div className="rounded-lg bg-secondary p-2 space-y-1 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {music.length} song{music.length > 1 ? 's' : ''} · plays in order
              </p>
              <button
                onClick={() => setMusicOpen(true)}
                className="text-xs text-primary hover:underline"
              >
                Edit
              </button>
            </div>
            {music.map((m, i) => (
              <div key={m.url} className="flex items-center gap-2 p-1.5 rounded-md bg-background/50">
                <span className="text-xs font-mono w-5 text-center text-muted-foreground">{i + 1}</span>
                <img src={m.artwork} alt="" className="w-8 h-8 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.artist}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveMusic(i, -1)} disabled={i === 0}>
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveMusic(i, 1)} disabled={i === music.length - 1}>
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMusic(music.filter((_, k) => k !== i))}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button onClick={post} disabled={posting || (mode === 'text' ? !text.trim() : !file)} className="w-full">
          <Send className="w-4 h-4 mr-2" />
          {posting ? 'Posting...' : 'Post status'}
        </Button>
      </DialogContent>
      <MusicPicker
        open={musicOpen}
        onOpenChange={setMusicOpen}
        onPick={setMusic}
        initialTracks={music}
      />
    </Dialog>
  );
}
