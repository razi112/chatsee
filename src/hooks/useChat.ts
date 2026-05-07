import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import notificationSound from '@/assets/iphone_notification.mp3';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string | null;
  is_online: boolean | null;
  last_seen: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants: Profile[];
  lastMessage?: Message;
}

export function useChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all profiles for searching
  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id || '');

    if (error) {
      console.error('Error fetching profiles:', error);
    } else {
      setProfiles(data || []);
    }
  }, [user?.id]);

  // Fetch user's conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;

    const { data: participantData, error: participantError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (participantError) {
      console.error('Error fetching conversations:', participantError);
      return;
    }

    const conversationIds = participantData?.map(p => p.conversation_id) || [];
    
    if (conversationIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Fetch conversations with participants
    const conversationsWithParticipants: Conversation[] = [];

    for (const convId of conversationIds) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single();

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', convId);

      const participantIds = participants?.map(p => p.user_id) || [];
      
      const { data: participantProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', participantIds);

      // Get last message
      const { data: lastMessageData } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (convData) {
        conversationsWithParticipants.push({
          ...convData,
          participants: participantProfiles || [],
          lastMessage: lastMessageData?.[0],
        });
      }
    }

    // Sort by last message time
    conversationsWithParticipants.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.updated_at;
      const bTime = b.lastMessage?.created_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(conversationsWithParticipants);
    setLoading(false);
  }, [user]);

  // Fetch messages for current conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data || []);
    }
  }, []);

  // Start or get existing conversation with a user
  const startConversation = useCallback(async (otherUserId: string) => {
    if (!user) return null;

    // Check if conversation already exists
    const existingConv = conversations.find(conv => 
      conv.participants.some(p => p.id === otherUserId) &&
      conv.participants.length === 2
    );

    if (existingConv) {
      setCurrentConversation(existingConv);
      fetchMessages(existingConv.id);
      return existingConv;
    }

    // Create or get conversation via RPC (avoids RLS races)
    const { data: convId, error: rpcError } = await supabase
      .rpc('create_direct_conversation', { _other_user: otherUserId });

    if (rpcError || !convId) {
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive',
      });
      return null;
    }

    const { data: newConv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .single();

    if (!newConv) {
      toast({ title: 'Error', description: 'Failed to load conversation', variant: 'destructive' });
      return null;
    }

    // Get other user's profile
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', otherUserId)
      .single();

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const conversation: Conversation = {
      ...newConv,
      participants: [myProfile, otherProfile].filter(Boolean) as Profile[],
    };

    setConversations(prev => [conversation, ...prev]);
    setCurrentConversation(conversation);
    setMessages([]);

    return conversation;
  }, [user, conversations, fetchMessages, toast]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!user || !currentConversation) return;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversation.id,
        sender_id: user.id,
        content,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    }
  }, [user, currentConversation, toast]);

  // Set up real-time subscription for messages
  useEffect(() => {
    if (!currentConversation) return;

    const channel = supabase
      .channel(`messages-${currentConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${currentConversation.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentConversation]);

  // Real-time profile updates (online status, avatar, name)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('profiles-presence')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Profile;
          setProfiles(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          setConversations(prev => prev.map(c => ({
            ...c,
            participants: c.participants.map(p => p.id === updated.id ? { ...p, ...updated } : p),
          })));
          setCurrentConversation(prev => prev ? {
            ...prev,
            participants: prev.participants.map(p => p.id === updated.id ? { ...p, ...updated } : p),
          } : prev);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Global notification subscription for all incoming messages
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      audioRef.current = new Audio(notificationSound);
      audioRef.current.preload = 'auto';
      audioRef.current.volume = 0.8;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`global-messages-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === user.id) return;

          // Check if user is participant of this conversation
          const { data: isParticipant } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!isParticipant) return;

          // Play sound
          try {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              await audioRef.current.play();
            }
          } catch (e) {
            // Autoplay may be blocked until user interacts
          }

          // Get sender name
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name, email, avatar_url')
            .eq('id', msg.sender_id)
            .maybeSingle();

          const senderName = sender?.display_name || sender?.email?.split('@')[0] || 'New message';

          // Show toast only if not currently viewing this conversation
          if (currentConversation?.id !== msg.conversation_id) {
            toast({
              title: senderName,
              description: msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content,
            });
          }

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(senderName, {
              body: msg.content,
              icon: sender?.avatar_url || '/favicon.ico',
            });
          }

          // Refresh conversations list to update last message
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentConversation, toast, fetchConversations]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      fetchConversations();
      fetchProfiles();
    }
  }, [user, fetchConversations, fetchProfiles]);

  // Select a conversation
  const selectConversation = useCallback((conversation: Conversation) => {
    setCurrentConversation(conversation);
    fetchMessages(conversation.id);
  }, [fetchMessages]);

  return {
    conversations,
    currentConversation,
    messages,
    profiles,
    loading,
    selectConversation,
    startConversation,
    sendMessage,
    fetchConversations,
  };
}
