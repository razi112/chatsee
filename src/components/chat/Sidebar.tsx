import { useEffect, useState } from 'react';
import { Search, Plus, LogOut, Settings, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Profile } from '@/hooks/useChat';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import NewChatDialog from './NewChatDialog';
import ProfileSettingsDialog from './ProfileSettingsDialog';
import { isDeleted, onChatActionsChanged } from '@/lib/chatActions';

interface SidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  profiles: Profile[];
  onSelectConversation: (conversation: Conversation) => void;
  onStartConversation: (userId: string) => void;
}

export default function Sidebar({
  conversations,
  currentConversation,
  profiles,
  onSelectConversation,
  onStartConversation,
}: SidebarProps) {
  const { user, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const myProfile = profiles.find(p => p.id === user?.id);
  // Note: profiles list excludes current user, so fall back to user metadata
  const myAvatarUrl = myProfile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);
  const myInitials = ((user?.user_metadata?.display_name as string) || user?.email || 'U')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [actionsVersion, setActionsVersion] = useState(0);
  useEffect(() => onChatActionsChanged(() => setActionsVersion(v => v + 1)), []);

  const filteredConversations = conversations.filter(conv => {
    if (isDeleted(conv.id) && !conv.lastMessage) return false;
    if (isDeleted(conv.id)) {
      // Hide deleted unless a new message arrived after deletion timestamp — simple: hide always until user starts again
      return false;
    }
    const otherParticipant = conv.participants.find(p => p.id !== user?.id);
    return otherParticipant?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           otherParticipant?.email?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getOtherParticipant = (conversation: Conversation) => {
    return conversation.participants.find(p => p.id !== user?.id);
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-sidebar border-r border-border">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 group rounded-lg p-1 -m-1 hover:bg-secondary transition-colors"
        >
          <Avatar className="w-10 h-10">
            <AvatarImage src={myAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary font-medium">
              {myInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-foreground">My Profile</span>
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setShowNewChat(true)}
            title="New chat"
          >
            <Plus className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setShowProfile(true)}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={signOut}
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="px-2 pb-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No conversations yet</p>
              <p className="text-muted-foreground text-xs mt-1">
                Click + to start chatting
              </p>
            </div>
          ) : (
            filteredConversations.map(conversation => {
              const other = getOtherParticipant(conversation);
              if (!other) return null;

              const isSelected = currentConversation?.id === conversation.id;
              const lastMessage = conversation.lastMessage;

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    "w-full p-3 rounded-lg flex items-center gap-3 transition-colors text-left",
                    isSelected 
                      ? "bg-primary/10" 
                      : "hover:bg-secondary"
                  )}
                >
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={other.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary font-medium">
                        {getInitials(other.display_name, other.email)}
                      </AvatarFallback>
                    </Avatar>
                    {other.is_online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-online rounded-full border-2 border-sidebar animate-pulse-online" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate">
                        {other.display_name || other.email.split('@')[0]}
                      </span>
                      {lastMessage && (
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {lastMessage?.content || other.status || 'Start a conversation'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* New Chat Dialog */}
      <NewChatDialog
        open={showNewChat}
        onOpenChange={setShowNewChat}
        profiles={profiles}
        onSelectUser={onStartConversation}
      />

      {/* Profile / Settings Dialog */}
      <ProfileSettingsDialog open={showProfile} onOpenChange={setShowProfile} />
    </div>
  );
}
