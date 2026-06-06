import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCall } from '@/contexts/CallContext';
import { Volume2, Play, Square } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export default function DeviceSettingsDialog({ open, onOpenChange }: Props) {
  const { devices, setMic, setSpeaker, setCamera, refreshDevices, speakerSinkId } = useCall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [testing, setTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const animRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (open) {
      // Request permissions so device labels populate
      navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(s => { s.getTracks().forEach(t => t.stop()); refreshDevices(); })
        .catch(() => refreshDevices());
    }
    return () => { stopMicTest(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopMicTest = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => { /* */ });
    ctxRef.current = null;
    setMicLevel(0);
    setTesting(false);
  };

  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: devices.selectedMic ? { deviceId: { exact: devices.selectedMic } } : true,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, (avg / 128) * 100));
        animRef.current = requestAnimationFrame(tick);
      };
      setTesting(true);
      tick();
    } catch (e) {
      console.error(e);
    }
  };

  const testSpeaker = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (speakerSinkId && 'setSinkId' in audio) {
      try { await (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(speakerSinkId); } catch { /* */ }
    }
    audio.currentTime = 0;
    audio.play().catch(() => { /* */ });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) stopMicTest(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Audio & Video</DialogTitle>
          <DialogDescription>Select your devices and test them.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Microphone</Label>
            <Select value={devices.selectedMic} onValueChange={setMic}>
              <SelectTrigger><SelectValue placeholder="Default microphone" /></SelectTrigger>
              <SelectContent>
                {devices.mics.map(d => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0, 6)})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={testing ? stopMicTest : startMicTest}>
                {testing ? <><Square className="w-3 h-3 mr-1" /> Stop</> : <><Play className="w-3 h-3 mr-1" /> Test</>}
              </Button>
              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${micLevel}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Speaker</Label>
            <Select value={devices.selectedSpeaker} onValueChange={setSpeaker}>
              <SelectTrigger><SelectValue placeholder="Default speaker" /></SelectTrigger>
              <SelectContent>
                {devices.speakers.length === 0 && <SelectItem value="default">System default</SelectItem>}
                {devices.speakers.map(d => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0, 6)})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={testSpeaker}>
              <Volume2 className="w-3 h-3 mr-1" /> Test speaker
            </Button>
            <audio ref={audioRef} src="data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAEAAAAAP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A" preload="auto" />
          </div>

          <div className="space-y-2">
            <Label>Camera</Label>
            <Select value={devices.selectedCamera} onValueChange={setCamera}>
              <SelectTrigger><SelectValue placeholder="Default camera" /></SelectTrigger>
              <SelectContent>
                {devices.cameras.map(d => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera (${d.deviceId.slice(0, 6)})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
