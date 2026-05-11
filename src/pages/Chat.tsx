import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import Sidebar from '@/components/chat/Sidebar';
import ChatArea from '@/components/chat/ChatArea';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';
import { startChatStateSync, stopChatStateSync } from '@/lib/chatActions';

export default function Chat() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showChat, setShowChat] = useState(false);
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
  } = useChat();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

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

  const handleBack = () => {
    setShowChat(false);
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

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile View */}
      {isMobile ? (
        showChat && currentConversation ? (
          <ChatArea
            conversation={currentConversation}
            messages={messages}
            onSendMessage={sendMessage}
            onBack={handleBack}
          />
        ) : (
          <Sidebar
            conversations={conversations}
            currentConversation={currentConversation}
            profiles={profiles}
            onSelectConversation={handleSelectConversation}
            onStartConversation={handleStartConversation}
          />
        )
      ) : (
        /* Desktop View */
        <>
          <Sidebar
            conversations={conversations}
            currentConversation={currentConversation}
            profiles={profiles}
            onSelectConversation={handleSelectConversation}
            onStartConversation={handleStartConversation}
          />
          <ChatArea
            conversation={currentConversation}
            messages={messages}
            onSendMessage={sendMessage}
          />
        </>
      )}
    </div>
  );
}
