import { useEffect, useState } from 'react';
import { Plus, Camera, Type, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Profile } from '@/hooks/useChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import StatusComposer from './StatusComposer';
import StatusViewer from './StatusViewer';

export interface MusicTrackData {
  url: string;
  title: string;
  artist: string;
  artwork: string;
}

export interface StatusRow {
  id: string;
  user_id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  background_color: string | null;
  font_style: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  music_url: string | null;
  music_title: string | null;
  music_artist: string | null;
  music_artwork: string | null;
  music_playlist: MusicTrackData[] | null;
}

interface UserStatusGroup {
  user: Profile;
  statuses: StatusRow[];
  hasUnseen: boolean;
}

interface Props {
  profiles: Profile[];
}

export default function StatusView({ profiles }: Props) {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerUser, setViewerUser] = useState<UserStatusGroup | null>(null);

  const myProfile = profiles.find((p) => p.id === user?.id);
  const myMeta = user?.user_metadata || {};
  const me: Profile | undefined = myProfile || (user
    ? {
        id: user.id,
        email: user.email || '',
        display_name: (myMeta.display_name as string) || null,
        avatar_url: (myMeta.avatar_url as string) || null,
        status: null,
        is_online: true,
        last_seen: null,
      }
    : undefined);

  const load = async () => {
    const { data } = await supabase
      .from('statuses')
      .select('*')
      .order('created_at', { ascending: true });
    setStatuses(((data || []) as unknown) as StatusRow[]);
    if (user) {
      const { data: views } = await supabase
        .from('status_views')
        .select('status_id')
        .eq('viewer_id', user.id);
      setSeenIds(new Set((views || []).map((v: { status_id: string }) => v.status_id)));
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`statuses-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const grouped = (() => {
    const map = new Map<string, StatusRow[]>();
    for (const s of statuses) {
      if (!map.has(s.user_id)) map.set(s.user_id, []);
      map.get(s.user_id)!.push(s);
    }
    const result: UserStatusGroup[] = [];
    map.forEach((list, uid) => {
      const profile = uid === user?.id ? me : profiles.find((p) => p.id === uid);
      if (!profile) return;
      result.push({
        user: profile,
        statuses: list,
        hasUnseen: uid !== user?.id && list.some((s) => !seenIds.has(s.id)),
      });
    });
    return result;
  })();

  const myGroup = grouped.find((g) => g.user.id === user?.id);
  const otherRecent = grouped.filter((g) => g.user.id !== user?.id && g.hasUnseen);
  const otherViewed = grouped.filter((g) => g.user.id !== user?.id && !g.hasUnseen);

  const getInitials = (n: string | null, e: string) =>
    n ? n.split(' ').map((x) => x[0]).join('').toUpperCase().slice(0, 2) : e.slice(0, 2).toUpperCase();

  const RingAvatar = ({ group, isMine }: { group: UserStatusGroup; isMine?: boolean }) => (
    <div className="relative">
      <div
        className={`p-[2px] rounded-full ${
          isMine ? '' : group.hasUnseen ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <Avatar className="w-12 h-12 ring-2 ring-background">
          <AvatarImage src={group.user.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-medium">
            {getInitials(group.user.display_name, group.user.email)}
          </AvatarFallback>
        </Avatar>
      </div>
      {isMine && (
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
          <Plus className="w-3 h-3" />
        </span>
      )}
    </div>
  );

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-sidebar border-r border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Status</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setComposerOpen(true)}
            title="Text status"
            className="text-muted-foreground hover:text-foreground"
          >
            <Type className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setComposerOpen(true)}
            title="Media status"
            className="text-muted-foreground hover:text-foreground"
          >
            <Camera className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* My status */}
          {me && (
            <button
              onClick={() => myGroup ? setViewerUser(myGroup) : setComposerOpen(true)}
              className="w-full p-2 rounded-lg flex items-center gap-3 hover:bg-secondary text-left"
            >
              <RingAvatar
                group={myGroup || { user: me, statuses: [], hasUnseen: false }}
                isMine
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">My status</p>
                <p className="text-sm text-muted-foreground truncate">
                  {myGroup
                    ? `${myGroup.statuses.length} update${myGroup.statuses.length > 1 ? 's' : ''} · ${formatDistanceToNow(new Date(myGroup.statuses[myGroup.statuses.length - 1].created_at), { addSuffix: true })}`
                    : 'Tap to add status update'}
                </p>
              </div>
              {myGroup && (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}

          {otherRecent.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground px-2 mt-4 mb-1 uppercase tracking-wide">Recent updates</p>
              {otherRecent.map((g) => (
                <StatusListItem key={g.user.id} group={g} onOpen={() => setViewerUser(g)} />
              ))}
            </>
          )}
          {otherViewed.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground px-2 mt-4 mb-1 uppercase tracking-wide">Viewed updates</p>
              {otherViewed.map((g) => (
                <StatusListItem key={g.user.id} group={g} onOpen={() => setViewerUser(g)} />
              ))}
            </>
          )}
          {otherRecent.length === 0 && otherViewed.length === 0 && !myGroup && (
            <div className="px-4 py-12 text-center">
              <p className="text-muted-foreground text-sm">No status updates yet</p>
              <p className="text-muted-foreground text-xs mt-1">Tap the buttons above to share one</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <StatusComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onPosted={load}
      />
      {viewerUser && (
        <StatusViewer
          group={viewerUser}
          onClose={() => { setViewerUser(null); load(); }}
        />
      )}
    </div>
  );
}

function StatusListItem({ group, onOpen }: { group: UserStatusGroup; onOpen: () => void }) {
  const last = group.statuses[group.statuses.length - 1];
  const getInitials = (n: string | null, e: string) =>
    n ? n.split(' ').map((x) => x[0]).join('').toUpperCase().slice(0, 2) : e.slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onOpen}
      className="w-full p-2 rounded-lg flex items-center gap-3 hover:bg-secondary text-left transition-colors"
    >
      <div className={`p-[2px] rounded-full ${group.hasUnseen ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <Avatar className="w-12 h-12 ring-2 ring-background">
          <AvatarImage src={group.user.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-medium">
            {getInitials(group.user.display_name, group.user.email)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">
          {group.user.display_name || group.user.email.split('@')[0]}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}
