import { useState, useEffect, useRef } from 'react';
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
  Loader2, Home, MessageCircle, Circle,
  Phone, Search, User, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { startChatStateSync, stopChatStateSync } from '@/lib/chatActions';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

type Tab = 'chats' | 'status' | 'search' | 'calls' | 'profile';

const NAV_ITEMS: { key: Tab; label: string; hasDot?: boolean }[] = [
  { key: 'chats',   label: 'Chats'   },
  { key: 'status',  label: 'Status'  },
  { key: 'search',  label: 'Search'  },
  { key: 'calls',   label: 'Calls',   hasDot: true },
  { key: 'profile', label: 'Profile', hasDot: true },
];

export default function Chat() {
  const { user, loading: authLoading } = useAuth();
  const navigate   = useNavigate();
  const isMobile   = useIsMobile();
  const [showChat,         setShowChat]         = useState(false);
  const [tab,              setTab]              = useState<Tab>('chats');
  const [showProfileDialog,setShowProfileDialog]= useState(false);
  const [searchQuery,      setSearchQuery]      = useState('');
  usePresence();

  const {
    conversations, currentConversation, messages, profiles,
    loading, selectConversation, startConversation, sendMessage, createGroup,
  } = useChat();

  // ── Jelly refs (unconditional — Rules of Hooks) ──────────────────────────
  const navRef       = useRef<HTMLDivElement>(null);
  const prevTabIdx   = useRef(NAV_ITEMS.findIndex(n => n.key === 'chats'));
  const jellyAnimRef = useRef<Animation | null>(null);
  const [blobPos, setBlobPos] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      startChatStateSync(user.id);
      return () => { stopChatStateSync(); };
    }
  }, [user]);

  // Jelly animation — desktop sidebar vertical
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const buttons = nav.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    const idx = NAV_ITEMS.findIndex(n => n.key === tab);
    const btn = buttons[idx];
    if (!btn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const top    = btnRect.top  - navRect.top;
    const height = btnRect.height;

    setBlobPos({ top, height });

    const direction = idx > prevTabIdx.current ? 1 : idx < prevTabIdx.current ? -1 : 0;
    prevTabIdx.current = idx;

    const blob = nav.querySelector<HTMLElement>('#jelly-blob');
    if (!blob) return;
    jellyAnimRef.current?.cancel();

    const shiftY = direction * height * 0.15;
    jellyAnimRef.current = blob.animate(
      [
        { transform: `translateY(${shiftY}px) scaleY(1.32) scaleX(0.72)`,       offset: 0    },
        { transform: `translateY(${shiftY * 0.4}px) scaleY(1.12) scaleX(0.92)`, offset: 0.40 },
        { transform: `translateY(0) scaleY(0.93) scaleX(1.07)`,                  offset: 0.62 },
        { transform: `translateY(0) scaleY(1.03) scaleX(0.97)`,                  offset: 0.78 },
        { transform: `translateY(0) scaleY(1) scaleX(1)`,                        offset: 1    },
      ],
      { duration: 420, easing: 'ease-out', fill: 'forwards' }
    );
  }, [tab]);

  // Mobile jelly — bottom nav horizontal
  const mobileNavRef       = useRef<HTMLDivElement>(null);
  const mobilePrevIdx      = useRef(0);
  const mobileJellyAnimRef = useRef<Animation | null>(null);
  const [mobileBlobPos, setMobileBlobPos] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav) return;
    const buttons = nav.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    const idx = NAV_ITEMS.findIndex(n => n.key === tab);
    const btn = buttons[idx];
    if (!btn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const left  = btnRect.left - navRect.left;
    const width = btnRect.width;
    setMobileBlobPos({ left, width });

    const direction = idx > mobilePrevIdx.current ? 1 : idx < mobilePrevIdx.current ? -1 : 0;
    mobilePrevIdx.current = idx;

    const blob = nav.querySelector<HTMLElement>('#mobile-jelly-blob');
    if (!blob) return;
    mobileJellyAnimRef.current?.cancel();

    const shiftX = direction * width * 0.18;
    mobileJellyAnimRef.current = blob.animate(
      [
        { transform: `translateX(${shiftX}px) scaleX(1.38) scaleY(0.68)`,       offset: 0    },
        { transform: `translateX(${shiftX*0.4}px) scaleX(1.14) scaleY(0.90)`,   offset: 0.40 },
        { transform: `translateX(0) scaleX(0.92) scaleY(1.08)`,                  offset: 0.62 },
        { transform: `translateX(0) scaleX(1.04) scaleY(0.96)`,                  offset: 0.78 },
        { transform: `translateX(0) scaleX(1) scaleY(1)`,                        offset: 1    },
      ],
      { duration: 440, easing: 'ease-out', fill: 'forwards' }
    );
  }, [tab]);

  // ─────────────────────────────────────────────────────────────────────────

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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectConversation = (conv: typeof currentConversation) => {
    if (conv) { selectConversation(conv); if (isMobile) setShowChat(true); }
  };
  const handleStartConversation = async (userId: string) => {
    const conv = await startConversation(userId);
    if (conv && isMobile) setShowChat(true);
  };
  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    await createGroup(name, memberIds);
  };
  const switchTab = (next: Tab) => { setTab(next); setShowChat(false); };

  // ── Panels ────────────────────────────────────────────────────────────────
  const getInitials = (name: string | null, email: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
         : email.slice(0, 2).toUpperCase();

  const filteredProfiles = profiles.filter(p =>
    p.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ChatsPanel  = (
    <Sidebar
      conversations={conversations} currentConversation={currentConversation}
      profiles={profiles} onSelectConversation={handleSelectConversation}
      onStartConversation={handleStartConversation} onCreateGroup={handleCreateGroup}
    />
  );
  const StatusPanel = <StatusView profiles={profiles} />;
  const CallsPanel  = <CallsView  profiles={profiles} />;

  const SearchPanel = (
    <div className="w-full h-full flex flex-col bg-sidebar">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Search</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search people..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus />
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
              {filteredProfiles.map(profile => (
                <button key={profile.id}
                  onClick={() => { handleStartConversation(profile.id); setTab('chats'); setSearchQuery(''); }}
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
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {profile.display_name || profile.email.split('@')[0]}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
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
      <button onClick={() => setShowProfileDialog(true)}
        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
        Edit Profile
      </button>
    </div>
  );

  const activePanel =
    tab === 'chats'  ? ChatsPanel  :
    tab === 'status' ? StatusPanel :
    tab === 'search' ? SearchPanel :
    tab === 'calls'  ? CallsPanel  : ProfilePanel;

  // ── Icon map ──────────────────────────────────────────────────────────────
  const iconFor = (key: Tab, active: boolean) => {
    const cls = cn('w-5 h-5 transition-all duration-200', active ? 'scale-110' : '');
    if (key === 'chats')   return <MessageCircle className={cls} />;
    if (key === 'status')  return <Circle        className={cls} />;
    if (key === 'search')  return <Search        className={cls} />;
    if (key === 'calls')   return <Phone         className={cls} />;
    return <User className={cls} />;
  };

  // ── Desktop sidebar nav ───────────────────────────────────────────────────
  const myMeta     = user?.user_metadata || {};
  const myName     = (myMeta.display_name as string) || user?.email?.split('@')[0] || 'You';
  const myAvatar   = myMeta.avatar_url as string | undefined;
  const myInitials = myName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const DesktopSidebar = (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-52 z-40 bg-[#0d0d0d] border-r border-white/[0.05]">

      {/* User header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <div className="relative shrink-0">
          <Avatar className="w-10 h-10 ring-2 ring-primary/40">
            <AvatarImage src={myAvatar} />
            <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">
              {myInitials}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0d0d0d]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{myName}</p>
          <p className="text-[10px] text-white/40 truncate">@{myName.toLowerCase().replace(/\s/g,'')}</p>
        </div>
      </div>

      {/* Nav items */}
      <nav ref={navRef} className="flex-1 relative px-3 space-y-1">
        {/* Jelly blob background */}
        {blobPos && (
          <span
            id="jelly-blob"
            className="absolute left-3 right-3 rounded-2xl pointer-events-none"
            style={{
              top:    blobPos.top,
              height: blobPos.height,
              background: 'linear-gradient(135deg, #ff6b00 0%, #d62976 50%, #7b2ff7 100%)',
              transformOrigin: 'center center',
            }}
          />
        )}

        {NAV_ITEMS.map(item => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              data-tab={item.key}
              onClick={() => switchTab(item.key)}
              className={cn(
                'relative z-10 w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-150 select-none',
                active ? 'text-white' : 'text-white/40 hover:text-white/75 hover:bg-white/5'
              )}
            >
              {iconFor(item.key, active)}
              <span className={cn(
                'text-sm font-semibold tracking-wide transition-all duration-150',
                active ? 'text-white' : 'text-white/50'
              )}>
                {item.label}
              </span>
              {item.hasDot && (
                <span className="ml-auto w-2 h-2 bg-red-500 rounded-full shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="px-3 pb-6">
        <button
          onClick={() => setShowProfileDialog(true)}
          className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-white/40 hover:text-white/75 hover:bg-white/5 transition-all duration-150"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-semibold text-white/50">Settings</span>
        </button>
      </div>
    </aside>
  );

  // ── Mobile bottom pill nav ────────────────────────────────────────────────
  const MobileNav = (
    <nav ref={mobileNavRef} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 md:hidden">
      <div className="relative flex items-center px-2 py-2 rounded-[28px] bg-[#18181c]/95 backdrop-blur-xl border border-white/[0.07] shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
        {mobileBlobPos && (
          <span
            id="mobile-jelly-blob"
            className="absolute top-2 rounded-[18px] pointer-events-none"
            style={{
              left:   mobileBlobPos.left,
              width:  mobileBlobPos.width,
              height: 'calc(100% - 16px)',
              background: 'linear-gradient(135deg,#ff6b00 0%,#d62976 50%,#7b2ff7 100%)',
              transformOrigin: 'center center',
            }}
          />
        )}
        {NAV_ITEMS.map(item => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              data-tab={item.key}
              onClick={() => switchTab(item.key)}
              aria-label={item.label}
              className={cn(
                'relative z-10 flex items-center justify-center w-12 h-12 rounded-[18px] select-none transition-colors duration-150',
                active ? 'text-white' : 'text-white/38 hover:text-white/65'
              )}
            >
              {iconFor(item.key, active)}
              {item.hasDot && (
                <span className="absolute top-[10px] right-[10px] w-[7px] h-[7px] bg-red-500 rounded-full ring-[1.5px] ring-[#18181c]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {DesktopSidebar}

      {/* Main content — offset for desktop sidebar */}
      <div className="flex-1 flex overflow-hidden md:ml-52">
        {isMobile ? (
          showChat && currentConversation && tab === 'chats' ? (
            <ChatArea conversation={currentConversation} messages={messages}
              onSendMessage={sendMessage} onBack={() => setShowChat(false)} />
          ) : activePanel
        ) : (
          <>
            {activePanel}
            {tab === 'chats' ? (
              <ChatArea conversation={currentConversation} messages={messages}
                onSendMessage={sendMessage} />
            ) : (
              <div className="flex-1 hidden md:flex items-center justify-center bg-background">
                <p className="text-muted-foreground text-sm">
                  {tab === 'status'  ? 'Select a status to view'   :
                   tab === 'search'  ? 'Search for people to chat' :
                   tab === 'calls'   ? 'Select a contact to call'  :
                                       'Your profile'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile nav — hide while in chat */}
      {!(isMobile && showChat && tab === 'chats') && MobileNav}

      <ProfileSettingsDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
    </div>
  );
}
