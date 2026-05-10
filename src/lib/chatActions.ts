// Frontend-only helpers for clear chat / delete chat / block user.
// State persists in localStorage and broadcasts a `chat-actions-changed` event.

const CLEAR_KEY = (convId: string) => `chat-cleared:${convId}`;
const DELETE_KEY = (convId: string) => `chat-deleted:${convId}`;
const BLOCK_KEY = (userId: string) => `chat-blocked:${userId}`;

export function getClearedAt(convId: string): number | null {
  const v = localStorage.getItem(CLEAR_KEY(convId));
  return v ? Number(v) : null;
}
export function clearChat(convId: string) {
  localStorage.setItem(CLEAR_KEY(convId), String(Date.now()));
  emit();
}
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

function emit() {
  window.dispatchEvent(new Event('chat-actions-changed'));
}

export function onChatActionsChanged(cb: () => void) {
  window.addEventListener('chat-actions-changed', cb);
  return () => window.removeEventListener('chat-actions-changed', cb);
}
