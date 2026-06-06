import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/hooks/useChat';
import { toast } from 'sonner';

export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'connecting' | 'active' | 'ended';
export type CallRole = 'caller' | 'callee';

export interface ActiveCall {
  id: string;
  type: CallType;
  role: CallRole;
  peer: Profile;
  status: CallStatus;
  startedAt: number;
  answeredAt: number | null;
}

interface DeviceState {
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  selectedMic?: string;
  selectedSpeaker?: string;
  selectedCamera?: string;
}

interface CallContextValue {
  call: ActiveCall | null;
  incoming: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  devices: DeviceState;
  startCall: (peer: Profile, type: CallType, conversationId?: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchToVideo: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  setMic: (deviceId: string) => Promise<void>;
  setSpeaker: (deviceId: string) => void;
  setCamera: (deviceId: string) => Promise<void>;
  speakerSinkId: string | undefined;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const STORAGE_KEY = 'call-device-prefs';

function loadPrefs(): Partial<Pick<DeviceState, 'selectedMic' | 'selectedSpeaker' | 'selectedCamera'>> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function savePrefs(p: Partial<DeviceState>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [devices, setDevices] = useState<DeviceState>({ mics: [], speakers: [], cameras: [], ...loadPrefs() });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // ---- Ringtone ----
  useEffect(() => {
    // Simple synthesized beep loop via WebAudio fallback handled in IncomingCallDialog
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(prev => ({
        ...prev,
        mics: list.filter(d => d.kind === 'audioinput'),
        speakers: list.filter(d => d.kind === 'audiooutput'),
        cameras: list.filter(d => d.kind === 'videoinput'),
      }));
    } catch (e) {
      console.warn('enumerateDevices failed', e);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshDevices]);

  // ---- Signaling channel helper ----
  const sendSignal = useCallback((event: string, payload: Record<string, unknown>) => {
    const ch = signalChannelRef.current;
    if (!ch) return;
    ch.send({ type: 'broadcast', event, payload });
  }, []);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* */ }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];
    if (signalChannelRef.current) {
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
  }, []);

  const updateCallRow = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await supabase.from('calls').update(patch).eq('id', id);
  }, []);

  // ---- Build peer connection ----
  const buildPC = useCallback((callId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice', { callId, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      setRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall(c => c ? { ...c, status: 'active', answeredAt: c.answeredAt || Date.now() } : c);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Let user end manually; show toast
      }
    };
    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  const getMedia = useCallback(async (type: CallType): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: devices.selectedMic ? { deviceId: { exact: devices.selectedMic } } : true,
      video: type === 'video' ? (devices.selectedCamera ? { deviceId: { exact: devices.selectedCamera } } : true) : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    // Refresh device labels (now permitted)
    refreshDevices();
    return stream;
  }, [devices.selectedMic, devices.selectedCamera, refreshDevices]);

  // ---- Join signaling channel for a call ----
  const joinSignaling = useCallback((callId: string, onReady?: () => void) => {
    const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false, ack: true } } });
    signalChannelRef.current = ch;

    ch.on('broadcast', { event: 'ready' }, async () => {
      // callee signaled ready — caller sends offer
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'stable') return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', { callId, sdp: offer });
    });

    ch.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescSetRef.current = true;
      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* */ }
      }
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal('answer', { callId, sdp: answer });
    });

    ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescSetRef.current = true;
      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* */ }
      }
      pendingCandidatesRef.current = [];
    });

    ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!pc) return;
      if (!remoteDescSetRef.current) {
        pendingCandidatesRef.current.push(payload.candidate);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* */ }
    });

    ch.on('broadcast', { event: 'hangup' }, () => {
      endCallInternal('peer');
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') onReady?.();
    });
  }, [sendSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- End call ----
  const endCallInternal = useCallback(async (reason: 'self' | 'peer' | 'reject' | 'missed' | 'cancel') => {
    const current = call;
    if (current) {
      const ended_at = new Date().toISOString();
      const duration = current.answeredAt ? Math.floor((Date.now() - current.answeredAt) / 1000) : 0;
      const status = reason === 'reject' ? 'rejected' : reason === 'missed' ? 'missed' : reason === 'cancel' ? 'cancelled' : 'ended';
      updateCallRow(current.id, { status, ended_at, duration_seconds: duration });
      if (reason === 'self') sendSignal('hangup', { callId: current.id });
    }
    cleanup();
    setCall(null);
    setIncoming(null);
  }, [call, cleanup, sendSignal, updateCallRow]);

  const endCall = useCallback(async () => { await endCallInternal('self'); }, [endCallInternal]);

  // ---- Start call (caller) ----
  const startCall = useCallback(async (peer: Profile, type: CallType, conversationId?: string) => {
    if (!user) return;
    if (call) {
      toast.error('Already in a call');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('calls')
        .insert({
          caller_id: user.id,
          callee_id: peer.id,
          call_type: type,
          conversation_id: conversationId ?? null,
          status: 'ringing',
        })
        .select()
        .single();
      if (error || !data) throw error;

      const active: ActiveCall = {
        id: data.id,
        type,
        role: 'caller',
        peer,
        status: 'ringing',
        startedAt: Date.now(),
        answeredAt: null,
      };
      setCall(active);

      const pc = buildPC(data.id);
      const stream = await getMedia(type);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      joinSignaling(data.id);

      // Auto timeout after 45s if not answered
      setTimeout(() => {
        setCall(c => {
          if (c && c.id === data.id && c.status === 'ringing') {
            endCallInternal('missed');
          }
          return c;
        });
      }, 45000);
    } catch (e) {
      console.error('startCall failed', e);
      toast.error('Could not start call. Check mic/camera permissions.');
      cleanup();
      setCall(null);
    }
  }, [user, call, buildPC, getMedia, joinSignaling, cleanup, endCallInternal]);

  // ---- Accept (callee) ----
  const acceptCall = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    try {
      setIncoming(null);
      const active: ActiveCall = { ...inc, status: 'connecting', answeredAt: Date.now() };
      setCall(active);
      const pc = buildPC(inc.id);
      const stream = await getMedia(inc.type);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await updateCallRow(inc.id, { status: 'accepted', answered_at: new Date().toISOString() });
      joinSignaling(inc.id, () => {
        sendSignal('ready', { callId: inc.id });
      });
    } catch (e) {
      console.error('acceptCall failed', e);
      toast.error('Could not answer call.');
      cleanup();
      setCall(null);
    }
  }, [incoming, buildPC, getMedia, joinSignaling, sendSignal, updateCallRow, cleanup]);

  const rejectCall = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    await supabase.from('calls').update({ status: 'rejected', ended_at: new Date().toISOString() }).eq('id', inc.id);
    setIncoming(null);
  }, [incoming]);

  // ---- Controls ----
  const toggleMute = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const enabled = !s.getAudioTracks()[0]?.enabled;
    s.getAudioTracks().forEach(t => { t.enabled = enabled; });
    setMuted(!enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const tracks = s.getVideoTracks();
    if (tracks.length === 0) return;
    const enabled = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = enabled; });
    setCameraOff(!enabled);
  }, []);

  const switchToVideo = useCallback(async () => {
    if (!call || call.type !== 'voice') return;
    const pc = pcRef.current;
    const s = localStreamRef.current;
    if (!pc || !s) return;
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: devices.selectedCamera ? { deviceId: { exact: devices.selectedCamera } } : true,
      });
      const vTrack = vStream.getVideoTracks()[0];
      s.addTrack(vTrack);
      pc.addTrack(vTrack, s);
      // Renegotiate
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', { callId: call.id, sdp: offer });
      setCall(c => c ? { ...c, type: 'video' } : c);
      await updateCallRow(call.id, { call_type: 'video' });
    } catch (e) {
      console.error('switchToVideo failed', e);
      toast.error('Could not enable camera.');
    }
  }, [call, devices.selectedCamera, sendSignal, updateCallRow]);

  const setMic = useCallback(async (deviceId: string) => {
    savePrefs({ ...loadPrefs(), selectedMic: deviceId });
    setDevices(prev => ({ ...prev, selectedMic: deviceId }));
    const s = localStreamRef.current;
    const pc = pcRef.current;
    if (s && pc) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        const newTrack = newStream.getAudioTracks()[0];
        const sender = pc.getSenders().find(se => se.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(newTrack);
        s.getAudioTracks().forEach(t => { s.removeTrack(t); t.stop(); });
        s.addTrack(newTrack);
      } catch (e) { console.warn(e); }
    }
  }, []);

  const setCamera = useCallback(async (deviceId: string) => {
    savePrefs({ ...loadPrefs(), selectedCamera: deviceId });
    setDevices(prev => ({ ...prev, selectedCamera: deviceId }));
    const s = localStreamRef.current;
    const pc = pcRef.current;
    if (s && pc && call?.type === 'video') {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
        const newTrack = newStream.getVideoTracks()[0];
        const sender = pc.getSenders().find(se => se.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
        s.getVideoTracks().forEach(t => { s.removeTrack(t); t.stop(); });
        s.addTrack(newTrack);
      } catch (e) { console.warn(e); }
    }
  }, [call?.type]);

  const setSpeaker = useCallback((deviceId: string) => {
    savePrefs({ ...loadPrefs(), selectedSpeaker: deviceId });
    setDevices(prev => ({ ...prev, selectedSpeaker: deviceId }));
  }, []);

  // ---- Listen for incoming calls (DB INSERT) ----
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`incoming-calls-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `callee_id=eq.${user.id}`,
      }, async (payload) => {
        const row = payload.new as { id: string; caller_id: string; call_type: CallType; status: string };
        if (row.status !== 'ringing') return;
        const { data: caller } = await supabase.from('profiles').select('*').eq('id', row.caller_id).maybeSingle();
        if (!caller) return;
        setIncoming({
          id: row.id,
          type: row.call_type,
          role: 'callee',
          peer: caller as Profile,
          status: 'ringing',
          startedAt: Date.now(),
          answeredAt: null,
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
      }, (payload) => {
        const row = payload.new as { id: string; status: string };
        // If a call we are tracking is rejected/ended/cancelled by the other side
        setIncoming(prev => (prev && prev.id === row.id && row.status !== 'ringing') ? null : prev);
        setCall(prev => {
          if (prev && prev.id === row.id && (row.status === 'ended' || row.status === 'rejected' || row.status === 'cancelled' || row.status === 'missed')) {
            cleanup();
            return null;
          }
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, cleanup]);

  const value = useMemo<CallContextValue>(() => ({
    call, incoming, localStream, remoteStream, muted, cameraOff, devices,
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera, switchToVideo,
    refreshDevices, setMic, setSpeaker, setCamera,
    speakerSinkId: devices.selectedSpeaker,
  }), [call, incoming, localStream, remoteStream, muted, cameraOff, devices,
    startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchToVideo,
    refreshDevices, setMic, setSpeaker, setCamera]);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
