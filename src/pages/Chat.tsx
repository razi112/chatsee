import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import { supabase } from '@/integrations/supabase/client';
import Sidebar from '@/components/chat/Sidebar';
import ChatArea from '@/components/chat/ChatArea';
import StatusView from '@/components/chat/StatusView';
import CallsView from '@/components/chat/CallsView';
import ProfileSettingsDialog from '@/components/chat/ProfileSettingsDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, MessageCircle, Circle, Phone, Search, User, Settings } from 'lucide-react';
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
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const [showChat,          setShowChat]          = useState(false);
  const [tab,               setTab]               = useState<Tab>('chats');
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  usePresence();

  const {
    conversations, currentConversation, messages, profiles,
    loading, selectConversation, startConversation, sendMessage, createGroup,
  } = useChat();

  // ── Own profile (avatar + name) — fetched directly since profiles list excludes self ──
  const [myOwnProfile, setMyOwnProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  // ── Jelly refs — ALL hooks declared before any early return ──────────────
  const navRef        = useRef<HTMLDivElement>(null);
  const prevTabIdx    = useRef(NAV_ITEMS.findIndex(n => n.key === 'chats'));
  const jellyAnimRef  = useRef<Animation | null>(null);
  const [blobPos, setBlobPos] = useState<{ top: number; height: number } | null>(null);

  const mobileNavRef       = useRef<HTMLDivElement>(null);
  const mobilePrevIdx      = useRef(0);
  const mobileJellyAnimRef = useRef<Animation | null>(null);
  const [mobileBlobPos, setMobileBlobPos] = useState<{ left: number; width: number } | null>(null);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // Chat state sync
  useEffect(() => {
    if (user) {
      startChatStateSync(user.id);
      return () => { stopChatStateSync(); };
    }
  }, [user]);

  // Fetch own profile once on login
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setMyOwnProfile(data as typeof myOwnProfile); });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: update own profile when changed (e.g. after avatar upload)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('my-profile-live')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const p = payload.new as { display_name: string | null; avatar_url: string | null };
          setMyOwnProfile(prev => prev ? { ...prev, ...p } : p);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop jelly
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const buttons = nav.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    const idx = NAV_ITEMS.findIndex(n => n.key === tab);
    const btn = buttons[idx];
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setBlobPos({ top: btnRect.top - navRect.top, height: btnRect.height });
    const direction = idx > prevTabIdx.current ? 1 : idx < prevTabIdx.current ? -1 : 0;
    prevTabIdx.current = idx;
    const blob = nav.querySelector<HTMLElement>('#jelly-blob');
    if (!blob) return;
    jellyAnimRef.current?.cancel();
    const shiftY = direction * btnRect.height * 0.15;
    jellyAnimRef.current = blob.animate([
      { transform: `translateY(${shiftY}px) scaleY(1.32) scaleX(0.72)`,       offset: 0    },
      { transform: `translateY(${shiftY*.4}px) scaleY(1.12) scaleX(0.92)`,    offset: 0.40 },
      { transform: `translateY(0) scaleY(0.93) scaleX(1.07)`,                  offset: 0.62 },
      { transform: `translateY(0) scaleY(1.03) scaleX(0.97)`,                  offset: 0.78 },
      { transform: `translateY(0) scaleY(1) scaleX(1)`,                        offset: 1    },
    ], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  }, [tab]);

  // Mobile jelly
  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav) return;
    const buttons = nav.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    const idx = NAV_ITEMS.findIndex(n => n.key === tab);
    const btn = buttons[idx];
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setMobileBlobPos({ left: btnRect.left - navRect.left, width: btnRect.width });
    const direction = idx > mobilePrevIdx.current ? 1 : idx < mobilePrevIdx.current ? -1 : 0;
    mobilePrevIdx.current = idx;
    const blob = nav.querySelector<HTMLElement>('#mobile-jelly-blob');
    if (!blob) return;
    mobileJellyAnimRef.current?.cancel();
    const shiftX = direction * btnRect.width * 0.18;
    mobileJellyAnimRef.current = blob.animate([
      { transform: `translateX(${shiftX}px) scaleX(1.38) scaleY(0.68)`,      offset: 0    },
      { transform: `translateX(${shiftX*.4}px) scaleX(1.14) scaleY(0.90)`,   offset: 0.40 },
      { transform: `translateX(0) scaleX(0.92) scaleY(1.08)`,                 offset: 0.62 },
      { transform: `translateX(0) scaleX(1.04) scaleY(0.96)`,                 offset: 0.78 },
      { transform: `translateX(0) scaleX(1) scaleY(1)`,                       offset: 1    },
    ], { duration: 440, easing: 'ease-out', fill: 'forwards' });
  }, [tab]);

  // ── Early return AFTER all hooks ─────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getInitials = (name: string | null, email: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
         : email.slice(0, 2).toUpperCase();

  const filteredProfiles = profiles.filter(p =>
    p.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Panels ────────────────────────────────────────────────────────────────
  const ChatsPanel = (
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
      <div className="relative mb-4">
        <Avatar className="w-24 h-24 ring-2 ring-primary/40">
          <AvatarImage src={myOwnProfile?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
            {getInitials(myOwnProfile?.display_name ?? null, user?.email ?? '')}
          </AvatarFallback>
        </Avatar>
        <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-sidebar" />
      </div>
      <h2 className="text-lg font-semibold mb-1">
        {myOwnProfile?.display_name || user?.email?.split('@')[0]}
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
    if (key === 'chats')  return <MessageCircle className={cls} />;
    if (key === 'status') return <Circle        className={cls} />;
    if (key === 'search') return <Search        className={cls} />;
    if (key === 'calls')  return <Phone         className={cls} />;
    return <User className={cls} />;
  };

  // ── Sidebar display values (from DB, not stale auth metadata) ─────────────
  const myName     = myOwnProfile?.display_name || user?.email?.split('@')[0] || 'You';
  const myAvatar   = myOwnProfile?.avatar_url   || undefined;
  const myInitials = myName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // ── Desktop sidebar ───────────────────────────────────────────────────────
  const DesktopSidebar = (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 z-40"
      style={{ background: 'linear-gradient(180deg,#050f08 0%,#071209 40%,#040d07 100%)' }}>

      <div className="pointer-events-none absolute top-0 left-0 right-0 h-40 opacity-30"
        style={{ background: 'radial-gradient(ellipse at 30% 0%,#00ff7744 0%,transparent 70%)' }} />

      {/* Brand */}
      <div className="px-5 pt-7 pb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#00e676,#00c853)' }}>
            <MessageCircle className="w-4 h-4 text-black" />
          </div>
          <span className="text-lg font-extrabold tracking-tight"
            style={{ background: 'linear-gradient(90deg,#00e676,#69f0ae)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            ChatSee
          </span>
        </div>
        <p className="text-[10px] text-green-500/40 pl-0.5 tracking-widest uppercase">Messenger</p>
      </div>

      <div className="mx-5 h-px mb-3" style={{ background: 'linear-gradient(90deg,#00e67622,transparent)' }} />

      {/* Nav */}
      <nav ref={navRef} className="flex-1 relative px-3 space-y-0.5">
        {blobPos && (
          <span id="jelly-blob" className="absolute left-3 right-3 rounded-2xl pointer-events-none"
            style={{
              top: blobPos.top, height: blobPos.height,
              background: 'linear-gradient(135deg,#00c853,#00e676,#69f0ae)',
              boxShadow: '0 0 20px #00e67640,0 0 40px #00e67620',
              transformOrigin: 'center center',
            }} />
        )}
        {NAV_ITEMS.map(item => {
          const active = tab === item.key;
          return (
            <button key={item.key} data-tab={item.key} onClick={() => switchTab(item.key)}
              className={cn(
                'relative z-10 w-full flex items-center gap-3.5 px-4 py-[11px] rounded-2xl transition-all duration-150 select-none group',
                active ? 'text-black' : 'text-green-500/40 hover:text-green-400 hover:bg-green-500/5'
              )}>
              <span className={cn('transition-transform duration-200', active ? 'scale-110' : 'group-hover:scale-105')}>
                {iconFor(item.key, active)}
              </span>
              <span className={cn('text-sm font-bold tracking-wide',
                active ? 'text-black' : 'text-green-500/50 group-hover:text-green-400')}>
                {item.label}
              </span>
              {item.hasDot && (
                <span className={cn('ml-auto w-2 h-2 rounded-full shrink-0',
                  active ? 'bg-black/60' : 'bg-red-500')} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mx-5 h-px mt-2 mb-3" style={{ background: 'linear-gradient(90deg,#00e67622,transparent)' }} />

      {/* Bottom: settings + user card */}
      <div className="px-3 pb-6 space-y-1">
        <button onClick={() => setShowProfileDialog(true)}
          className="w-full flex items-center gap-3.5 px-4 py-[11px] rounded-2xl text-green-500/40 hover:text-green-400 hover:bg-green-500/5 transition-all duration-150 group">
          <Settings className="w-5 h-5 transition-transform duration-150 group-hover:rotate-45" />
          <span className="text-sm font-bold text-green-500/50 group-hover:text-green-400 tracking-wide">Settings</span>
        </button>

        {/* User card — reads from DB profile */}
        <div className="mx-1 mt-1 px-3 py-3 rounded-2xl flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg,#00e6760d,#00c8530d)', border:'1px solid #00e67615' }}>
          <div className="relative shrink-0">
            <Avatar className="w-9 h-9">
              <AvatarImage src={myAvatar} />
              <AvatarFallback className="text-xs font-bold text-black"
                style={{ background: 'linear-gradient(135deg,#00c853,#00e676)' }}>
                {myInitials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2"
              style={{ borderColor:'#050f08' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-green-300 truncate">{myName}</p>
            <p className="text-[10px] text-green-500/40 truncate">● Online</p>
          </div>
        </div>
      </div>
    </aside>
  );

  const MobileNav = (
    <nav ref={mobileNavRef} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden">
      <div className="relative flex items-center px-3 py-1.5 rounded-[22px] border shadow-2xl"
        style={{
          background: 'linear-gradient(135deg,#050f08ee,#071209ee)',
          borderColor: '#00e67618', backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8),0 0 30px rgba(0,230,118,0.08)',
          minWidth: '72vw',
          maxWidth: '360px',
        }}>
        {mobileBlobPos && (
          <span id="mobile-jelly-blob" className="absolute top-1.5 rounded-[16px] pointer-events-none"
            style={{
              left: mobileBlobPos.left, width: mobileBlobPos.width,
              height: 'calc(100% - 12px)',
              background: 'linear-gradient(135deg,#00c853,#00e676,#69f0ae)',
              boxShadow: '0 0 16px #00e67650', transformOrigin: 'center center',
            }} />
        )}
        {NAV_ITEMS.map(item => {
          const active = tab === item.key;
          return (
            <button key={item.key} data-tab={item.key} onClick={() => switchTab(item.key)}
              aria-label={item.label}
              className={cn(
                'relative z-10 flex items-center justify-center flex-1 h-10 rounded-[16px] select-none transition-colors duration-150',
                active ? 'text-black' : 'text-green-500/50 hover:text-green-400'
              )}>
              {iconFor(item.key, active)}
              {item.hasDot && (
                <span className="absolute top-[8px] right-[8px] w-[6px] h-[6px] bg-red-500 rounded-full"
                  style={{ boxShadow:'0 0 0 1.5px #050f08' }} />
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
      {DesktopSidebar}
      <div className="flex-1 flex overflow-hidden md:ml-56">
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
                   tab === 'calls'   ? 'Select a contact to call'  : 'Your profile'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {!(isMobile && showChat && tab === 'chats') && MobileNav}
      <ProfileSettingsDialog
        open={showProfileDialog}
        onOpenChange={(open) => {
          setShowProfileDialog(open);
          // Refresh own profile when settings dialog closes
          if (!open && user) {
            supabase.from('profiles').select('display_name, avatar_url')
              .eq('id', user.id).single()
              .then(({ data }) => { if (data) setMyOwnProfile(data as typeof myOwnProfile); });
          }
        }}
      />
    </div>
  );
}
