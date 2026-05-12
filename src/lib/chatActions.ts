// Per-user chat clear/undo state is persisted on the backend so it stays
// consistent across devices. Delete/block remain local-only (per-device).

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function persistClearedAt(
  userId: string,
  convId: string,
  clearedAtIso: string | null,
  label: 'clear' | 'undo clear'
): Promise<boolean> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('user_chat_state')
      .upsert(
        { user_id: userId, conversation_id: convId, cleared_at: clearedAtIso },
        { onConflict: 'user_id,conversation_id' }
      );
    if (!error) {
      if (attempt > 1) toast.success(`Chat ${label} synced`);
      return true;
    }
    lastError = error;
    console.warn(`${label} persist attempt ${attempt} failed`, error);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
  console.error(`${label} persist failed after ${MAX_RETRIES} attempts`, lastError);
  toast.error(`Couldn't sync ${label} across devices`, {
    description: 'Saved locally. Tap retry to try again.',
    action: {
      label: 'Retry',
      onClick: () => {
        void persistClearedAt(userId, convId, clearedAtIso, label);
      },
    },
  });
  return false;
}

const DELETE_KEY = (convId: string) => `chat-deleted:${convId}`;
const BLOCK_KEY = (userId: string) => `chat-blocked:${userId}`;

// In-memory cache of cleared_at (ms epoch) per conversation for the signed-in user.
const clearedCache = new Map<string, number | null>();
let cacheUserId: string | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let startingPromise: Promise<void> | null = null;

function emit() {
  window.dispatchEvent(new Event('chat-actions-changed'));
}

export function getClearedAt(convId: string): number | null {
  return clearedCache.get(convId) ?? null;
}

export async function clearChat(convId: string, userId: string) {
  const ts = Date.now();
  clearedCache.set(convId, ts);
  emit();
  await persistClearedAt(userId, convId, new Date(ts).toISOString(), 'clear');
}

export async function unclearChat(convId: string, userId: string) {
  clearedCache.set(convId, null);
  emit();
  await persistClearedAt(userId, convId, null, 'undo clear');
}

// Initial fetch + realtime sync for all of the user's chat-state rows.
export async function startChatStateSync(userId: string) {
  if (cacheUserId === userId && realtimeChannel) return;
  await stopChatStateSync();
  cacheUserId = userId;

  const { data, error } = await supabase
    .from('user_chat_state')
    .select('conversation_id, cleared_at')
    .eq('user_id', userId);
  if (error) {
    console.error('chat state initial load failed', error);
  } else {
    clearedCache.clear();
    for (const row of data ?? []) {
      clearedCache.set(
        row.conversation_id as string,
        row.cleared_at ? new Date(row.cleared_at as string).getTime() : null
      );
    }
    emit();
  }

  realtimeChannel = supabase
    .channel(`user-chat-state-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_chat_state', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as { conversation_id: string; cleared_at: string | null } | null;
        if (!row) return;
        if (payload.eventType === 'DELETE') {
          clearedCache.delete(row.conversation_id);
        } else {
          clearedCache.set(
            row.conversation_id,
            row.cleared_at ? new Date(row.cleared_at).getTime() : null
          );
        }
        emit();
      }
    )
    .subscribe();
}

export async function stopChatStateSync() {
  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  cacheUserId = null;
  clearedCache.clear();
}

// --- Local-only state below ---

export function isDeleted(convId: string): boolean {
  return localStorage.getItem(DELETE_KEY(convId)) === '1';
}
export function deleteChat(convId: string) {
  localStorage.setItem(DELETE_KEY(convId), '1');
  emit();
}
export function undeleteChat(convId: string) {
  localStorage.removeItem(DELETE_KEY(convId));
  emit();
}
export function isBlocked(userId: string): boolean {
  return localStorage.getItem(BLOCK_KEY(userId)) === '1';
}
export function setBlocked(userId: string, blocked: boolean) {
  if (blocked) localStorage.setItem(BLOCK_KEY(userId), '1');
  else localStorage.removeItem(BLOCK_KEY(userId));
  emit();
}

export function onChatActionsChanged(cb: () => void) {
  window.addEventListener('chat-actions-changed', cb);
  return () => window.removeEventListener('chat-actions-changed', cb);
}
