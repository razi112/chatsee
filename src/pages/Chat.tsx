import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import Sidebar from '@/components/chat/Sidebar';
import ChatArea from '@/components/chat/ChatArea';
import StatusView from '@/components/chat/StatusView';
import CallsView from '@/components/chat/CallsView';
import ProfileSettingsDialog from '@/components/chat/ProfileSettingsDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Loader2,
  Home,
  Circle,
  Phone,
  Search,
  User,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { startChatStateSync, stopChatStateSync } from '@/lib/chatActions';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

type Tab = 'chats' | 'status' | 'search' | 'calls' | 'profile';

export default function Chat() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showChat, setShowChat] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  usePresence();

  const {
    conversations,
    currentConversation,
    messages,
    profiles,
    loading,
    selectConversation,
    startConversation,
    sendMessage,
    createGroup,
  } = useChat();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      startChatStateSync(user.id);
      return () => {
        stopChatStateSync();
      };
    }
  }, [user]);

  const handleSelectConversation = (
    conversation: typeof currentConversation
  ) => {
    if (conversation) {
      selectConversation(conversation);
      if (isMobile) setShowChat(true);
    }
  };

  const handleStartConversation = async (userId: string) => {
    const conv = await startConversation(userId);
    if (conv && isMobile) setShowChat(true);
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    await createGroup(name, memberIds);
  };

  if (authLoading || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your chats...</p>
        </div>
      </div>
    );
  }

  const ChatsPanel = (
    <Sidebar
      conversations={conversations}
      currentConversation={currentConversation}
      profiles={profiles}
      onSelectConversation={handleSelectConversation}
      onStartConversation={handleStartConversation}
      onCreateGroup={handleCreateGroup}
    />
  );
  const StatusPanel = <StatusView profiles={profiles} />;
  const CallsPanel = <CallsView profiles={profiles} />;

  const filteredProfiles = profiles.filter(
    (profile) =>
      profile.display_name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      profile.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const SearchPanel = (
    <div className="w-full h-full flex flex-col bg-sidebar">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Search</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredProfiles.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No users found' : 'Type to search users'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    handleStartConversation(profile.id);
                    setTab('chats');
                    setSearchQuery('');
                  }}
                  className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary transition-colors text-left"
                >
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary font-medium">
                        {getInitials(profile.display_name, profile.email)}
                      </AvatarFallback>
                    </Avatar>
                    {profile.is_online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-online rounded-full border-2 border-sidebar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {profile.display_name || profile.email.split('@')[0]}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {profile.email}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const ProfilePanel = (
    <div className="w-full h-full flex flex-col bg-sidebar items-center justify-center p-6">
      <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-4">
        <User className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1">
        {user?.user_metadata?.display_name || user?.email?.split('@')[0]}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">{user?.email}</p>
      <button
        onClick={() => setShowProfileDialog(true)}
        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
      >
        Edit Profile
      </button>
    </div>
  );

  const activePanel =
    tab === 'chats'
      ? ChatsPanel
      : tab === 'status'
        ? StatusPanel
        : tab === 'search'
          ? SearchPanel
          : tab === 'calls'
            ? CallsPanel
            : ProfilePanel;

  const navItems: {
    key: Tab;
    icon: React.ReactNode;
    hasDot?: boolean;
  }[] = [
    { key: 'chats', icon: <Home className="w-6 h-6" /> },
    { key: 'status', icon: <Circle className="w-6 h-6" /> },
    { key: 'search', icon: <Search className="w-6 h-6" /> },
    { key: 'calls', icon: <Phone className="w-6 h-6" />, hasDot: true },
    {
      key: 'profile',
      icon: <User className="w-6 h-6" />,
      hasDot: true,
    },
  ];

  const FloatingNav = (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-2">
      {navItems.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key);
              setShowChat(false);
            }}
            className={cn(
              'relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200',
              active
                ? 'bg-white/20 text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
            aria-label={item.key}
          >
            {item.icon}
            {item.hasDot && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="flex-1 flex overflow-hidden pb-24">
        {isMobile ? (
          showChat && currentConversation && tab === 'chats' ? (
            <ChatArea
              conversation={currentConversation}
              messages={messages}
              onSendMessage={sendMessage}
              onBack={() => setShowChat(false)}
            />
          ) : (
            activePanel
          )
        ) : (
          <>
            {activePanel}
            {tab === 'chats' ? (
              <ChatArea
                conversation={currentConversation}
                messages={messages}
                onSendMessage={sendMessage}
              />
            ) : (
              <div className="flex-1 hidden md:flex items-center justify-center bg-background">
                <p className="text-muted-foreground">
                  {tab === 'status'
                    ? 'Select a status to view'
                    : tab === 'search'
                      ? 'Search for people to chat'
                      : tab === 'calls'
                        ? 'Select a contact to call'
                        : 'Your profile'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Floating Instagram-style nav — hide when viewing a chat on mobile */}
      {!(isMobile && showChat && tab === 'chats') && FloatingNav}

      <ProfileSettingsDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
      />
    </div>
  );
}
