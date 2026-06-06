import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Settings, Maximize2, Minimize2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCall } from '@/contexts/CallContext';
import { cn } from '@/lib/utils';
import DeviceSettingsDialog from './DeviceSettingsDialog';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallScreen() {
  const { call, localStream, remoteStream, muted, cameraOff, toggleMute, toggleCamera, switchToVideo, endCall, speakerSinkId } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => { /* */ });
    }
  }, [remoteStream]);

  // Apply speaker sink
  useEffect(() => {
    const els = [remoteVideoRef.current, remoteAudioRef.current];
    els.forEach(el => {
      if (el && speakerSinkId && 'setSinkId' in el) {
        (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(speakerSinkId).catch(() => { /* */ });
      }
    });
  }, [speakerSinkId, remoteStream]);

  useEffect(() => {
    if (!call?.answeredAt) return;
    const start = call.answeredAt;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [call?.answeredAt]);

  if (!call) return null;

  const isVideo = call.type === 'video';
  const showRemoteVideo = isVideo && remoteStream && remoteStream.getVideoTracks().length > 0;

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const initials = (call.peer.display_name || call.peer.email || '?').slice(0, 2).toUpperCase();
  const name = call.peer.display_name || call.peer.email.split('@')[0];
  const statusText = call.status === 'ringing' ? (call.role === 'caller' ? 'Calling…' : 'Incoming…') :
                     call.status === 'connecting' ? 'Connecting…' :
                     formatDuration(elapsed);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Remote video / placeholder */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {showRemoteVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-primary/20 to-background">
            <Avatar className="w-32 h-32 mb-6 ring-4 ring-primary/30">
              <AvatarImage src={call.peer.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/30 text-3xl">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-semibold text-foreground">{name}</h2>
            <p className="text-muted-foreground mt-2">{statusText}</p>
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay />

        {/* Top status bar (video mode) */}
        {showRemoteVideo && (
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent text-white">
            <div>
              <div className="font-semibold">{name}</div>
              <div className="text-xs opacity-80">{statusText}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/10">
              {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
          </div>
        )}

        {/* Local video PIP */}
        {isVideo && localStream && (
          <div className="absolute bottom-28 right-4 w-32 h-44 sm:w-40 sm:h-56 rounded-lg overflow-hidden border-2 border-white/30 shadow-xl bg-black">
            <video ref={localVideoRef} autoPlay playsInline muted className={cn("w-full h-full object-cover", cameraOff && "opacity-0")} />
            {cameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <VideoOff className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-6 bg-card/95 backdrop-blur border-t border-border flex items-center justify-center gap-3 sm:gap-4">
        <Button
          variant={muted ? 'destructive' : 'secondary'}
          size="icon"
          className="w-14 h-14 rounded-full"
          onClick={toggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        {isVideo ? (
          <Button
            variant={cameraOff ? 'destructive' : 'secondary'}
            size="icon"
            className="w-14 h-14 rounded-full"
            onClick={toggleCamera}
            title={cameraOff ? 'Camera on' : 'Camera off'}
          >
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="icon"
            className="w-14 h-14 rounded-full"
            onClick={switchToVideo}
            title="Switch to video"
          >
            <Video className="w-6 h-6" />
          </Button>
        )}

        <Button
          variant="destructive"
          size="icon"
          className="w-14 h-14 rounded-full"
          onClick={endCall}
          title="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </Button>

        <Button
          variant="secondary"
          size="icon"
          className="w-14 h-14 rounded-full"
          onClick={() => setSettingsOpen(true)}
          title="Devices"
        >
          <Settings className="w-6 h-6" />
        </Button>

        {!showRemoteVideo && (
          <Button
            variant="secondary"
            size="icon"
            className="w-14 h-14 rounded-full"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            {fullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
          </Button>
        )}
      </div>

      <DeviceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export function CallIcons() { return <Phone className="hidden" />; }
