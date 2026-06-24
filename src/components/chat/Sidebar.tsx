import { useEffect, useState } from 'react';
import { Search, Plus, LogOut, Settings, MessageCircle, Users, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Conversation, Profile } from '@/hooks/useChat';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import NewChatDialog from './NewChatDialog';
import ProfileSettingsDialog from './ProfileSettingsDialog';
import CreateGroupDialog from './CreateGroupDialog';
import { isDeleted, onChatActionsChanged } from '@/lib/chatActions';

interface SidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  profiles: Profile[];
  onSelectConversation: (conversation: Conversation) => void;
  onStartConversation: (userId: string) => void;
  onCreateGroup?: (name: string, memberIds: string[]) => Promise<void> | void;
}

export default function Sidebar({
  conversations, currentConversation, profiles,
  onSelectConversation, onStartConversation, onCreateGroup,
}: SidebarProps) {
  const { user, signOut } = useAuth();
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showNewChat,     setShowNewChat]     = useState(false);
  const [showProfile,     setShowProfile]     = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Fetch own profile directly — the profiles list from useChat excludes current user
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  const fetchMyProfile = () => {
    if (!user) return;
    supabase.from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setMyProfile(data); });
  };

  useEffect(() => { fetchMyProfile(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: own profile updated (avatar upload, name change)
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('sidebar-my-profile')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const p = payload.new as { display_name: string | null; avatar_url: string | null };
          setMyProfile(prev => prev ? { ...prev, ...p } : p);
        }
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const myAvatarUrl = myProfile?.avatar_url ?? undefined;
  const myInitials  = (myProfile?.display_name || user?.email || 'U')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [, setActionsVersion] = useState(0);
  useEffect(() => onChatActionsChanged(() => setActionsVersion(v => v + 1)), []);

  const filteredConversations = conversations.filter(conv => {
    if (isDeleted(conv.id)) return false;
    const q = searchQuery.toLowerCase();
    if (conv.is_group) return (conv.name || '').toLowerCase().includes(q);
    const other = conv.participants.find(p => p.id !== user?.id);
    return other?.display_name?.toLowerCase().includes(q) ||
           other?.email?.toLowerCase().includes(q);
  });

  const getOtherParticipant = (conv: Conversation) =>
    conv.participants.find(p => p.id !== user?.id);

  const getInitials = (name: string | null, email: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
         : email.slice(0, 2).toUpperCase();

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-sidebar border-r border-border">

      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <button onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 group rounded-lg p-1 -m-1 hover:bg-secondary transition-colors">
          <Avatar className="w-10 h-10">
            {/* key forces re-render when avatar URL changes */}
            <AvatarImage key={myAvatarUrl} src={myAvatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary font-medium">
              {myInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-foreground">
            {myProfile?.display_name || user?.email?.split('@')[0] || 'My Profile'}
          </span>
        </button>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-secondary">
                <Plus className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => setShowNewChat(true)}>
                <UserPlus className="w-4 h-4 mr-2" /> New chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCreateGroup(true)}>
                <Users className="w-4 h-4 mr-2" /> New group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setShowProfile(true)} title="Settings">
            <Settings className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={signOut} title="Sign out">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search conversations..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary" />
        </div>
      </div>

      {/* Conversations */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="px-2 pb-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No conversations yet</p>
              <p className="text-muted-foreground text-xs mt-1">Click + to start chatting</p>
            </div>
          ) : (
            filteredConversations.map(conversation => {
              const isGroup = !!conversation.is_group;
              const other   = isGroup ? null : getOtherParticipant(conversation);
              if (!isGroup && !other) return null;

              const isSelected  = currentConversation?.id === conversation.id;
              const lastMessage = conversation.lastMessage;
              const displayName = isGroup
                ? conversation.name || 'Group'
                : other!.display_name || other!.email.split('@')[0];
              const avatarUrl   = isGroup ? conversation.avatar_url : other!.avatar_url;
              const fallback    = isGroup
                ? (conversation.name || 'G').slice(0, 2).toUpperCase()
                : getInitials(other!.display_name, other!.email);

              return (
                <button key={conversation.id} onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'w-full p-3 rounded-lg flex items-center gap-3 transition-colors text-left',
                    isSelected ? 'bg-primary/10' : 'hover:bg-secondary'
                  )}>
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <AvatarImage key={avatarUrl} src={avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary font-medium">
                        {isGroup ? <Users className="w-5 h-5" /> : fallback}
                      </AvatarFallback>
                    </Avatar>
                    {!isGroup && other!.is_online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-online rounded-full border-2 border-sidebar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate">{displayName}</span>
                      {lastMessage && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-1">
                          {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {lastMessage?.content ||
                        (isGroup ? `${conversation.participants.length} members` : other!.status) ||
                        'Start a conversation'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      <NewChatDialog open={showNewChat} onOpenChange={setShowNewChat}
        profiles={profiles} onSelectUser={onStartConversation} />

      {onCreateGroup && (
        <CreateGroupDialog open={showCreateGroup} onOpenChange={setShowCreateGroup}
          profiles={profiles} onCreate={onCreateGroup} />
      )}

      <ProfileSettingsDialog open={showProfile}
        onOpenChange={(o) => {
          setShowProfile(o);
          // Re-fetch own profile when dialog closes (avatar/name may have changed)
          if (!o) fetchMyProfile();
        }} />
    </div>
  );
}
