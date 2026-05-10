import { useState, useRef, useEffect } from 'react';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Smile, Check, CheckCheck, Bug } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Message, Profile } from '@/hooks/useChat';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onBack?: () => void;
}

export default function ChatArea({ conversation, messages, onSendMessage, onBack }: ChatAreaProps) {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [lagMs, setLagMs] = useState(0);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const receiptUpdatesRef = useRef<Map<string, { is_read: boolean | null; at: number }>>(new Map());
  const [, forceTick] = useState(0);

  const otherParticipant = conversation?.participants.find(p => p.id !== user?.id);

  // Apply simulated lag before exposing real-time message updates to the view
  useEffect(() => {
    if (lagMs <= 0) {
      setDisplayedMessages(messages);
      return;
    }
    const t = setTimeout(() => setDisplayedMessages(messages), lagMs);
    return () => clearTimeout(t);
  }, [messages, lagMs]);

  // Track receipt (is_read) update timestamps per message id (based on what's displayed)
  useEffect(() => {
    const map = receiptUpdatesRef.current;
    let changed = false;
    displayedMessages.forEach(m => {
      const prev = map.get(m.id);
      if (!prev || prev.is_read !== m.is_read) {
        map.set(m.id, { is_read: m.is_read, at: Date.now() });
        changed = true;
      }
    });
    if (changed) forceTick(t => t + 1);
  }, [displayedMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
      inputRef.current?.focus();
    }
  };

  const getInitials = (profile: Profile) => {
    if (profile.display_name) {
      return profile.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return profile.email.slice(0, 2).toUpperCase();
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  const formatMessageTime = (dateString: string) => {
    return format(new Date(dateString), 'h:mm a');
  };

  // Group messages by date
  const groupedMessages = displayedMessages.reduce<{ date: string; messages: Message[] }[]>((acc, message) => {
    const dateKey = formatMessageDate(message.created_at);
    const lastGroup = acc[acc.length - 1];
    
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(message);
    } else {
      acc.push({ date: dateKey, messages: [message] });
    }
    
    return acc;
  }, []);

  if (!conversation || !otherParticipant) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background chat-pattern">
        <div className="text-center animate-fade-in">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-secondary/50 flex items-center justify-center">
            <Send className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium text-foreground mb-2">ChatApp for Desktop</h2>
          <p className="text-muted-foreground max-w-sm">
            Send and receive messages without keeping your phone online.
            <br />
            Select a chat to start messaging.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background chat-pattern">
      {/* Chat Header */}
      <div className="px-4 py-3 flex items-center gap-3 bg-card/95 backdrop-blur border-b border-border">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <Avatar className="w-10 h-10">
          <AvatarImage src={otherParticipant.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-medium">
            {getInitials(otherParticipant)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-medium text-foreground">
            {otherParticipant.display_name || otherParticipant.email.split('@')[0]}
          </h3>
          <p className="text-xs text-muted-foreground">
            {otherParticipant.is_online ? (
              <span className="text-online">Online</span>
            ) : otherParticipant.last_seen ? (
              `Last seen ${format(new Date(otherParticipant.last_seen), 'MMM d, h:mm a')}`
            ) : (
              'Offline'
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDebug(v => !v)}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              showDebug && "text-primary"
            )}
            title="Toggle debug panel"
          >
            <Bug className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {showDebug && (
        <div className="px-4 py-2 bg-card/70 border-b border-border flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span>Simulated real-time lag:</span>
          {[0, 500, 1500, 3000, 6000].map(ms => (
            <Button
              key={ms}
              type="button"
              variant={lagMs === ms ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setLagMs(ms)}
            >
              {ms === 0 ? 'off' : `${ms}ms`}
            </Button>
          ))}
          <span className="ml-auto">applied to incoming message + receipt updates</span>
        </div>
      )}

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4 scrollbar-thin">
        <div className="space-y-4">
          {groupedMessages.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 text-xs bg-card/80 text-muted-foreground rounded-lg">
                  {group.date}
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-1">
                {group.messages.map((message, index) => {
                  const isMine = message.sender_id === user?.id;
                  const showTail = index === 0 || 
                    group.messages[index - 1]?.sender_id !== message.sender_id;

                  const receipt = receiptUpdatesRef.current.get(message.id);
                  const delivered = isMine && !!otherParticipant.is_online;
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex flex-col animate-fade-in",
                        isMine ? "items-end" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] px-3 py-2 rounded-lg relative",
                          isMine
                            ? "bg-chat-sent text-primary-foreground"
                            : "bg-chat-received text-foreground",
                          showTail && (isMine ? "rounded-tr-sm" : "rounded-tl-sm")
                        )}
                      >
                        <p className="text-sm break-words whitespace-pre-wrap">
                          {message.content}
                        </p>
                        <span className={cn(
                          "text-[10px] float-right mt-1 ml-2 inline-flex items-center gap-1",
                          isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {formatMessageTime(message.created_at)}
                          {isMine && (
                            message.is_read ? (
                              <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                            ) : otherParticipant.is_online ? (
                              <CheckCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )
                          )}
                        </span>
                      </div>
                      {showDebug && (
                        <div className={cn(
                          "mt-1 max-w-[70%] px-2 py-1 rounded border border-dashed border-border bg-card/70 text-[10px] font-mono text-muted-foreground space-y-0.5",
                          isMine ? "text-right" : "text-left"
                        )}>
                          <div>id: {message.id.slice(0, 8)}…</div>
                          <div>is_read: <span className={message.is_read ? "text-online" : "text-foreground"}>{String(!!message.is_read)}</span></div>
                          <div>delivered: <span className={delivered ? "text-online" : "text-foreground"}>{isMine ? String(delivered) : 'n/a'}</span></div>
                          <div>receipt updated: {receipt ? format(new Date(receipt.at), 'HH:mm:ss.SSS') : '—'}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="p-3 bg-card/95 backdrop-blur border-t border-border">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Button 
            type="button" 
            variant="ghost" 
            size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Smile className="w-5 h-5" />
          </Button>
          <Input
            ref={inputRef}
            placeholder="Type a message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button 
            type="submit" 
            size="icon"
            disabled={!newMessage.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
