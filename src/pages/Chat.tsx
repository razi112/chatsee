import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import Sidebar from '@/components/chat/Sidebar';
import ChatArea from '@/components/chat/ChatArea';
import StatusView from '@/components/chat/StatusView';
import CallsView from '@/components/chat/CallsView';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, MessageCircle, Circle, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startChatStateSync, stopChatStateSync } from '@/lib/chatActions';

type Tab = 'chats' | 'status' | 'calls';

export default function Chat() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showChat, setShowChat] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
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
      return () => { stopChatStateSync(); };
    }
  }, [user]);

  const handleSelectConversation = (conversation: typeof currentConversation) => {
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

  const activePanel = tab === 'chats' ? ChatsPanel : tab === 'status' ? StatusPanel : CallsPanel;

  const BottomNav = (
    <nav className="flex items-center justify-around h-14 border-t border-border bg-sidebar shrink-0">
      <NavBtn label="Chats" icon={<MessageCircle className="w-5 h-5" />} active={tab === 'chats'} onClick={() => { setTab('chats'); setShowChat(false); }} />
      <NavBtn label="Status" icon={<Circle className="w-5 h-5" />} active={tab === 'status'} onClick={() => { setTab('status'); setShowChat(false); }} />
      <NavBtn label="Calls" icon={<Phone className="w-5 h-5" />} active={tab === 'calls'} onClick={() => { setTab('calls'); setShowChat(false); }} />
    </nav>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="flex-1 flex overflow-hidden">
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
                  {tab === 'status' ? 'Select a status to view' : 'Calls coming soon'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      {/* Hide bottom nav when viewing a chat on mobile */}
      {!(isMobile && showChat && tab === 'chats') && BottomNav}
    </div>
  );
}

function NavBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 h-full flex flex-col items-center justify-center gap-0.5 text-xs transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
