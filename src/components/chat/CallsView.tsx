import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Settings } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import type { Profile } from '@/hooks/useChat';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import DeviceSettingsDialog from './DeviceSettingsDialog';

interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'voice' | 'video';
  status: string;
  started_at: string;
  duration_seconds: number;
  peer?: Profile;
}

interface Props { profiles: Profile[]; }

export default function CallsView({ profiles }: Props) {
  const { user } = useAuth();
  const { startCall } = useCall();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchCalls = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('calls')
      .select('*')
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .order('started_at', { ascending: false })
      .limit(100);
    const rows = (data || []) as CallRow[];
    const peerIds = Array.from(new Set(rows.map(r => r.caller_id === user.id ? r.callee_id : r.caller_id)));
    const profMap = new Map<string, Profile>();
    profiles.forEach(p => profMap.set(p.id, p));
    const missing = peerIds.filter(id => !profMap.has(id));
    if (missing.length) {
      const { data: extra } = await supabase.from('profiles').select('*').in('id', missing);
      (extra || []).forEach(p => profMap.set(p.id, p as Profile));
    }
    rows.forEach(r => { r.peer = profMap.get(r.caller_id === user.id ? r.callee_id : r.caller_id); });
    setCalls(rows);
    setLoading(false);
  };

  useEffect(() => {
    fetchCalls();
    if (!user) return;
    const ch = supabase
      .channel(`calls-list-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => fetchCalls())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profiles]);

  const formatTime = (s: string) => {
    const d = new Date(s);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d');
  };

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-sidebar border-r border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Calls</h1>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Audio & video settings">
          <Settings className="w-5 h-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="p-8 text-center">
            <Phone className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No calls yet. Start one from a chat.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {calls.map(c => {
              const outgoing = c.caller_id === user?.id;
              const missed = c.status === 'missed' || (!outgoing && c.status === 'rejected');
              const name = c.peer?.display_name || c.peer?.email.split('@')[0] || 'Unknown';
              const initials = (c.peer?.display_name || c.peer?.email || '?').slice(0, 2).toUpperCase();
              return (
                <li key={c.id} className="px-4 py-3 hover:bg-accent/40 flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={c.peer?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className={cn("font-medium truncate", missed && "text-destructive")}>{name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {missed ? <PhoneMissed className="w-3 h-3 text-destructive" /> :
                       outgoing ? <PhoneOutgoing className="w-3 h-3" /> : <PhoneIncoming className="w-3 h-3" />}
                      <span>{formatTime(c.started_at)}</span>
                      {c.duration_seconds > 0 && (
                        <span>· {Math.floor(c.duration_seconds / 60)}:{(c.duration_seconds % 60).toString().padStart(2, '0')}</span>
                      )}
                    </div>
                  </div>
                  {c.peer && (
                    <Button variant="ghost" size="icon" onClick={() => startCall(c.peer!, c.call_type)} title={`${c.call_type} call`}>
                      {c.call_type === 'video' ? <Video className="w-5 h-5 text-primary" /> : <Phone className="w-5 h-5 text-primary" />}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DeviceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
