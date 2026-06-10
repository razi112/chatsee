import { useRef, useState } from 'react';
import { Image as ImageIcon, Type, X, Send, Music } from 'lucide-react';
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
  const [music, setMusic] = useState<MusicTrack | null>(null);
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
    setMusic(null);
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
    const musicFields = music
      ? { music_url: music.url, music_title: music.title, music_artist: music.artist, music_artwork: music.artwork }
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
        });
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
        });
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

        <Button onClick={post} disabled={posting || (mode === 'text' ? !text.trim() : !file)} className="w-full">
          <Send className="w-4 h-4 mr-2" />
          {posting ? 'Posting...' : 'Post status'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
