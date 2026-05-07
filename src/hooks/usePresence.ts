import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePresence() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const setOnline = async (online: boolean) => {
      await supabase
        .from('profiles')
        .update({
          is_online: online,
          last_seen: new Date().toISOString(),
        })
        .eq('id', user.id);
    };

    setOnline(true);

    // Heartbeat to keep last_seen fresh
    const heartbeat = setInterval(() => {
      setOnline(true);
    }, 30_000);

    const handleVisibility = () => {
      setOnline(!document.hidden);
    };
    const handleUnload = () => {
      // Best-effort offline marker
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        new Blob(
          [JSON.stringify({ is_online: false, last_seen: new Date().toISOString() })],
          { type: 'application/json' }
        )
      );
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      setOnline(false);
    };
  }, [user]);
}
