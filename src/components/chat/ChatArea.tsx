import { useState, useRef, useEffect } from 'react';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Smile, Check, CheckCheck, Bug, Download, Trash2, Eraser, Ban, ShieldOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Message, Profile } from '@/hooks/useChat';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  clearChat,
  deleteChat,
  getClearedAt,
  isBlocked,
  onChatActionsChanged,
  setBlocked,
  unclearChat,
} from '@/lib/chatActions';
import { useToast } from '@/hooks/use-toast';

const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','🤔','😴','😢','😭','😡','👍','👎','👏','🙏','💪','🔥','✨','🎉','❤️','💔','💯','😅','😉','😋','🤗','🤭','😇','🥰','😜','🤪','😏','😬','🙄','😤','🤯','😱','🥶','🤤','😈','👻','💀','🤖','🎁','☕','🍕'];

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onBack?: () => void;
}

export default function ChatArea({ conversation, messages, onSendMessage, onBack }: ChatAreaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [lagMs, setLagMs] = useState(0);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const receiptUpdatesRef = useRef<Map<string, { is_read: boolean | null; at: number }>>(new Map());
  const [, forceTick] = useState(0);
  const [confirm, setConfirm] = useState<null | 'clear' | 'delete' | 'block'>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [, setActionsVersion] = useState(0);

  useEffect(() => onChatActionsChanged(() => setActionsVersion(v => v + 1)), []);

  const otherParticipant = conversation?.participants.find(p => p.id !== user?.id);
  const blocked = otherParticipant ? isBlocked(otherParticipant.id) : false;
  const clearedAt = conversation ? getClearedAt(conversation.id) : null;

  // Apply simulated lag before exposing real-time message updates to the view
  useEffect(() => {
    if (lagMs <= 0) {
      setDisplayedMessages(messages);
      return;
    }
    const t = setTimeout(() => setDisplayedMessages(messages), lagMs);
    return () => clearTimeout(t);
  }, [messages, lagMs]);

  // Tick-state log for export
  type TickState = 'sent' | 'delivered' | 'read' | 'incoming';
  interface LogEntry {
    ts: number;
    iso: string;
    event: 'created' | 'state_change';
    message_id: string;
    sender_id: string;
    is_mine: boolean;
    is_read: boolean;
    delivered: boolean;
    tick: TickState;
    prev_tick: TickState | null;
    lag_ms: number;
    created_at: string;
  }
  const prevStateRef = useRef<Map<string, { is_read: boolean; delivered: boolean; tick: TickState }>>(new Map());
  const [log, setLog] = useState<LogEntry[]>([]);

  const computeTick = (msg: Message, isMine: boolean, delivered: boolean): TickState => {
    if (!isMine) return 'incoming';
    if (msg.is_read) return 'read';
    if (delivered) return 'delivered';
    return 'sent';
  };

  // Track receipt (is_read) update timestamps + log every state change
  useEffect(() => {
    const map = receiptUpdatesRef.current;
    const prev = prevStateRef.current;
    const otherOnline = !!otherParticipant?.is_online;
    const newEntries: LogEntry[] = [];
    let changed = false;

    displayedMessages.forEach(m => {
      const isMine = m.sender_id === user?.id;
      const delivered = isMine && otherOnline;
      const isRead = !!m.is_read;
      const tick = computeTick(m, isMine, delivered);

      const prevReceipt = map.get(m.id);
      if (!prevReceipt || prevReceipt.is_read !== m.is_read) {
        map.set(m.id, { is_read: m.is_read, at: Date.now() });
        changed = true;
      }

      const prevState = prev.get(m.id);
      const ts = Date.now();
      if (!prevState) {
        prev.set(m.id, { is_read: isRead, delivered, tick });
        newEntries.push({
          ts,
          iso: new Date(ts).toISOString(),
          event: 'created',
          message_id: m.id,
          sender_id: m.sender_id,
          is_mine: isMine,
          is_read: isRead,
          delivered,
          tick,
          prev_tick: null,
          lag_ms: lagMs,
          created_at: m.created_at,
        });
      } else if (prevState.is_read !== isRead || prevState.delivered !== delivered || prevState.tick !== tick) {
        newEntries.push({
          ts,
          iso: new Date(ts).toISOString(),
          event: 'state_change',
          message_id: m.id,
          sender_id: m.sender_id,
          is_mine: isMine,
          is_read: isRead,
          delivered,
          tick,
          prev_tick: prevState.tick,
          lag_ms: lagMs,
          created_at: m.created_at,
        });
        prev.set(m.id, { is_read: isRead, delivered, tick });
      }
    });

    if (newEntries.length) setLog(l => [...l, ...newEntries]);
    if (changed) forceTick(t => t + 1);
  }, [displayedMessages, otherParticipant?.is_online, user?.id, lagMs]);

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportLogJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      conversation_id: conversation?.id ?? null,
      viewer_id: user?.id ?? null,
      other_participant_id: otherParticipant?.id ?? null,
      current_lag_ms: lagMs,
      entries: log,
    };
    downloadFile(`tick-log-${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const exportLogCsv = () => {
    const headers = ['ts','iso','event','message_id','sender_id','is_mine','is_read','delivered','tick','prev_tick','lag_ms','created_at'];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = log.map(e => headers.map(h => escape((e as unknown as Record<string, unknown>)[h])).join(','));
    downloadFile(`tick-log-${Date.now()}.csv`, [headers.join(','), ...rows].join('\n'), 'text/csv');
  };

  const clearLog = () => {
    setLog([]);
    prevStateRef.current.clear();
  };

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

  // Filter out cleared messages, then group by date
  const visibleMessages = clearedAt
    ? displayedMessages.filter(m => new Date(m.created_at).getTime() > clearedAt)
    : displayedMessages;

  const groupedMessages = visibleMessages.reduce<{ date: string; messages: Message[] }[]>((acc, message) => {
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setConfirm('clear')}>
                <Eraser className="w-4 h-4 mr-2" /> Clear chat
              </DropdownMenuItem>
              {clearedAt && (
                <DropdownMenuItem onClick={() => { if (conversation) { unclearChat(conversation.id); toast({ title: 'Chat restored' }); } }}>
                  <Eraser className="w-4 h-4 mr-2" /> Undo clear
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirm('delete')}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete chat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {blocked ? (
                <DropdownMenuItem onClick={() => { setBlocked(otherParticipant.id, false); toast({ title: 'User unblocked' }); }}>
                  <ShieldOff className="w-4 h-4 mr-2" /> Unblock user
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirm('block')} className="text-destructive focus:text-destructive">
                  <Ban className="w-4 h-4 mr-2" /> Block user
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {clearedAt && (
        <div className="px-4 py-2 bg-muted/60 border-b border-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Eraser className="w-3.5 h-3.5" />
            <span>
              Chat cleared on {format(new Date(clearedAt), 'MMM d, h:mm a')}. Older messages are hidden from your view.
            </span>
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => { if (conversation) { unclearChat(conversation.id); toast({ title: 'Chat restored' }); } }}
          >
            Undo
          </Button>
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'clear' && 'Clear this chat?'}
              {confirm === 'delete' && 'Delete this chat?'}
              {confirm === 'block' && `Block ${otherParticipant.display_name || otherParticipant.email}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'clear' && 'Messages will be hidden from your view. The other participant will still see them.'}
              {confirm === 'delete' && 'This chat will be removed from your list. New incoming messages will bring it back.'}
              {confirm === 'block' && 'You will not be able to send messages to this user until you unblock them.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!conversation) return;
                if (confirm === 'clear') { clearChat(conversation.id); toast({ title: 'Chat cleared' }); }
                if (confirm === 'delete') { deleteChat(conversation.id); toast({ title: 'Chat deleted' }); onBack?.(); }
                if (confirm === 'block') { setBlocked(otherParticipant.id, true); toast({ title: 'User blocked' }); }
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {showDebug && (
        <div className="px-4 py-2 bg-card/70 border-b border-border flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span>Tick log: <span className="text-foreground">{log.length}</span> entries</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={exportLogJson}
            disabled={log.length === 0}
          >
            <Download className="w-3 h-3 mr-1" /> JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={exportLogCsv}
            disabled={log.length === 0}
          >
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={clearLog}
            disabled={log.length === 0}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
          <span className="ml-auto">records created + every tick transition with current lag</span>
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
        {blocked ? (
          <div className="flex items-center justify-center gap-3 py-2 text-sm text-muted-foreground">
            <Ban className="w-4 h-4" />
            <span>You blocked this user.</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => { if (otherParticipant) { setBlocked(otherParticipant.id, false); toast({ title: 'User unblocked' }); } }}
            >
              Unblock
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Emoji"
                >
                  <Smile className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72 p-2">
                <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      className="text-xl rounded hover:bg-accent p-1 transition-colors"
                      onClick={() => {
                        setNewMessage(m => m + e);
                        setEmojiOpen(false);
                        inputRef.current?.focus();
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
        )}
      </div>
    </div>
  );
}
