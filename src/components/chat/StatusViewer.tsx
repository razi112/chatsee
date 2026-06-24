import { useEffect, useRef, useState } from 'react';
import { X, Send, Eye, Trash2, Music } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile } from '@/hooks/useChat';
import { StatusRow } from './StatusView';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Group {
  user: Profile;
  statuses: StatusRow[];
}

interface Props {
  group: Group;
  onClose: () => void;
}

const DURATION_MS = 40000; // 40 seconds for text and image statuses

export default function StatusViewer({ group, onClose }: Props) {
  const { user } = useAuth();
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [paused, setPaused] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState<{ viewer_id: string; viewed_at: string; profile?: Profile }[]>([]);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicIdx, setMusicIdx] = useState(0);

  const current = group.statuses[idx];
  const isMine = current?.user_id === user?.id;

  const playlist: { url: string; title: string; artist: string; artwork: string }[] = (() => {
    if (!current) return [];
    if (current.music_playlist && current.music_playlist.length > 0) return current.music_playlist;
    if (current.music_url) return [{
      url: current.music_url,
      title: current.music_title || '',
      artist: current.music_artist || '',
      artwork: current.music_artwork || '',
    }];
    return [];
  })();
  const currentTrack = playlist[musicIdx] || playlist[0];

  // Mark as viewed
  useEffect(() => {
    if (!user || !current || isMine) return;
    supabase.from('status_views').insert({ status_id: current.id, viewer_id: user.id }).then(() => {});
  }, [current?.id, user?.id, isMine]);

  // Reset playlist index when status changes
  useEffect(() => { setMusicIdx(0); }, [current?.id]);

  // Play the current track in the playlist
  useEffect(() => {
    musicAudioRef.current?.pause();
    musicAudioRef.current = null;
    if (!currentTrack) return;
    if (current?.type === 'video') return; // don't overlap with video audio

    // start/segment are stored directly in the playlist JSON objects
    const trackStart   = (currentTrack as any).start   ?? 0;
    const trackSegment = (currentTrack as any).segment ?? 0; // 0 = play to end

    const a = new Audio(currentTrack.url);
    a.loop = playlist.length === 1 && trackSegment === 0;
    musicAudioRef.current = a;

    const startPlayback = () => {
      try { a.currentTime = trackStart; } catch {}
      a.play().catch(() => {});
    };
    if (a.readyState >= 1) startPlayback();
    else a.addEventListener('loadedmetadata', startPlayback, { once: true });

    const onTime = () => {
      if (trackSegment > 0 && a.currentTime >= trackStart + trackSegment) {
        // Advance to next track or loop back to start of segment
        if (playlist.length > 1) {
          setMusicIdx((i) => (i + 1) % playlist.length);
        } else {
          try { a.currentTime = trackStart; } catch {}
        }
      }
    };
    a.addEventListener('timeupdate', onTime);
    a.onended = () => {
      if (playlist.length > 1) setMusicIdx((i) => (i + 1) % playlist.length);
    };
    return () => { a.pause(); a.removeEventListener('timeupdate', onTime); };
  }, [current?.id, musicIdx, currentTrack?.url, current?.type, playlist.length]);

  // Pause/resume music with the status itself
  useEffect(() => {
    const a = musicAudioRef.current;
    if (!a) return;
    if (paused) a.pause(); else a.play().catch(() => {});
  }, [paused]);

  useEffect(() => () => { musicAudioRef.current?.pause(); }, []);

  // Progress timer
  useEffect(() => {
    if (paused || !current) return;
    if (current.type === 'video') return; // video drives its own duration
    setProgress(0);
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / DURATION_MS) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(t);
        next();
      }
    }, 50);
    return () => clearInterval(t);
  }, [idx, paused, current?.id]);

  const next = () => {
    if (idx < group.statuses.length - 1) setIdx(idx + 1);
    else onClose();
  };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  const sendReply = async () => {
    if (!reply.trim() || !user || !current) return;
    const { error } = await supabase.from('status_replies').insert({
      status_id: current.id,
      sender_id: user.id,
      content: reply.trim(),
    });
    if (error) toast.error('Failed to send reply');
    else { toast.success('Reply sent'); setReply(''); }
  };

  const deleteStatus = async () => {
    if (!current || !user) return;
    const { error } = await supabase.from('statuses').delete().eq('id', current.id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Status deleted');
    if (group.statuses.length === 1) onClose();
    else { group.statuses.splice(idx, 1); setIdx(Math.max(0, idx - 1)); }
  };

  const openViews = async () => {
    if (!current) return;
    setPaused(true);
    setViewsOpen(true);
    const { data } = await supabase
      .from('status_views')
      .select('viewer_id, viewed_at')
      .eq('status_id', current.id);
    const ids = (data || []).map((v: any) => v.viewer_id);
    let profileMap: Record<string, Profile> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
      profileMap = Object.fromEntries((profs || []).map((p: Profile) => [p.id, p]));
    }
    setViews((data || []).map((v: any) => ({ ...v, profile: profileMap[v.viewer_id] })));
  };

  if (!current) return null;
  const getInitials = (n: string | null, e: string) =>
    n ? n.split(' ').map((x) => x[0]).join('').toUpperCase().slice(0, 2) : e.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Progress bars */}
      <div className="flex gap-1 p-2">
        {group.statuses.map((_, i) => (
          <div key={i} className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2">
        <Avatar className="w-9 h-9">
          <AvatarImage src={group.user.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {getInitials(group.user.display_name, group.user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">
            {isMine ? 'You' : group.user.display_name || group.user.email.split('@')[0]}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
          </p>
        </div>
        {isMine && (
          <Button size="icon" variant="ghost" onClick={deleteStatus} title="Delete">
            <Trash2 className="w-5 h-5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onClose} title="Close">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <button className="absolute left-0 top-0 w-1/3 h-full" onClick={prev} aria-label="Previous" />
        <button className="absolute right-0 top-0 w-1/3 h-full" onClick={next} aria-label="Next" />

        {current.type === 'text' && (
          <div
            className="w-full h-full flex items-center justify-center p-8"
            style={{ backgroundColor: current.background_color || 'hsl(var(--primary))' }}
          >
            <p className="text-2xl text-white text-center break-words font-medium max-w-md">
              {current.content}
            </p>
          </div>
        )}
        {current.type === 'image' && (
          <img src={current.content} alt="" className="max-h-full max-w-full object-contain" />
        )}
        {current.type === 'video' && (
          <video
            src={current.content}
            autoPlay
            controls
            onEnded={next}
            className="max-h-full max-w-full"
          />
        )}
        {current.caption && current.type !== 'text' && (
          <div className="absolute bottom-16 left-0 right-0 text-center px-4">
            <p className="text-foreground bg-background/70 inline-block px-3 py-1 rounded-lg text-sm">
              {current.caption}
            </p>
          </div>
        )}
        {currentTrack && (
          <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white rounded-full pl-1 pr-3 py-1 max-w-xs">
              {currentTrack.artwork ? (
                <img src={currentTrack.artwork} alt="" className="w-7 h-7 rounded-full object-cover animate-spin-slow" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                  <Music className="w-3.5 h-3.5" />
                </span>
              )}
              <div className="min-w-0 text-left">
                <p className="text-xs font-medium truncate leading-tight">{currentTrack.title}</p>
                <p className="text-[10px] opacity-80 truncate leading-tight">{currentTrack.artist}</p>
              </div>
              {playlist.length > 1 && (
                <span className="text-[10px] opacity-70 ml-1 shrink-0">{musicIdx + 1}/{playlist.length}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 flex items-center gap-2 border-t border-border">
        {isMine ? (
          <Button variant="ghost" onClick={openViews} className="w-full justify-start">
            <Eye className="w-4 h-4 mr-2" /> View viewers
          </Button>
        ) : (
          <>
            <Input
              placeholder={`Reply to ${group.user.display_name || group.user.email.split('@')[0]}...`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onKeyDown={(e) => e.key === 'Enter' && sendReply()}
              className="bg-secondary border-0"
            />
            <Button size="icon" onClick={sendReply} disabled={!reply.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      <Sheet open={viewsOpen} onOpenChange={(o) => { setViewsOpen(o); if (!o) setPaused(false); }}>
        <SheetContent side="bottom" className="bg-card">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Viewed by {views.length}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
            {views.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-6">No views yet</p>
            )}
            {views.map((v) => (
              <div key={v.viewer_id} className="flex items-center gap-3 p-2">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={v.profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {getInitials(v.profile?.display_name || null, v.profile?.email || '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {v.profile?.display_name || v.profile?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
