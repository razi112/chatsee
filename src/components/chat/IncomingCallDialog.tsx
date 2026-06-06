import { useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';

export default function IncomingCallDialog() {
  const { incoming, acceptCall, rejectCall } = useCall();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!incoming) return;
    // Synthesize a simple ringtone
    let ctx: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      ctx = new AudioContext();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();
      let on = false;
      interval = setInterval(() => {
        if (!gain || !ctx) return;
        on = !on;
        gain.gain.setTargetAtTime(on ? 0.15 : 0, ctx.currentTime, 0.01);
      }, 600);
    } catch { /* */ }
    return () => {
      if (interval) clearInterval(interval);
      try { osc?.stop(); } catch { /* */ }
      ctx?.close().catch(() => { /* */ });
    };
  }, [incoming]);

  if (!incoming) return null;

  const name = incoming.peer.display_name || incoming.peer.email.split('@')[0];
  const initials = (incoming.peer.display_name || incoming.peer.email).slice(0, 2).toUpperCase();

  return (
    <Dialog open={!!incoming} onOpenChange={(o) => { if (!o) rejectCall(); }}>
      <DialogContent className="max-w-sm text-center" onInteractOutside={(e) => e.preventDefault()}>
        <audio ref={audioRef} />
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {incoming.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            <span>Incoming {incoming.type} call</span>
          </div>
          <Avatar className="w-24 h-24 ring-4 ring-primary/30 animate-pulse">
            <AvatarImage src={incoming.peer.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/30 text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-semibold">{name}</h2>
          <div className="flex items-center gap-6 pt-4">
            <Button
              variant="destructive"
              size="icon"
              className="w-14 h-14 rounded-full"
              onClick={rejectCall}
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
            <Button
              size="icon"
              className="w-14 h-14 rounded-full bg-online hover:bg-online/90"
              onClick={acceptCall}
            >
              <Phone className="w-6 h-6" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
