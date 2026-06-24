import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProfileSettingsDialog({ open, onOpenChange }: Props) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [status,      setStatus]      = useState('');
  const [email,       setEmail]       = useState('');
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [saving,      setSaving]      = useState(false);

  // Load profile from DB whenever dialog opens
  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase
      .from('profiles')
      .select('display_name, status, email, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          toast({ title: 'Error', description: 'Could not load profile', variant: 'destructive' });
        } else if (data) {
          setDisplayName(data.display_name ?? '');
          setStatus(data.status ?? '');
          setEmail(data.email ?? user.email ?? '');
          setAvatarUrl(data.avatar_url ?? null);
        }
        setLoading(false);
      });
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (displayName || email || 'U')
    .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Too large', description: 'Image must be under 5 MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);

    const ext  = file.name.split('.').pop() || 'jpg';
    // Fixed filename per user — overwrite on each upload, cache-bust via query param
    const path = `${user.id}/avatar.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, cacheControl: '1' });

    if (upErr) {
      toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    // Append timestamp so the browser doesn't show the cached old image
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    // 1. Update profiles table
    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', user.id);

    // 2. Sync into auth user metadata so components reading user.user_metadata stay fresh
    await supabase.auth.updateUser({ data: { avatar_url: url } });

    if (dbErr) {
      toast({ title: 'Save failed', description: dbErr.message, variant: 'destructive' });
    } else {
      setAvatarUrl(url);
      toast({ title: '✓ Profile photo updated' });
    }
    setUploading(false);
  };

  // ── Save name / status ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        status:       status.trim()       || null,
      })
      .eq('id', user.id);

    // Keep auth metadata in sync
    if (!error) {
      await supabase.auth.updateUser({
        data: { display_name: displayName.trim() || null },
      });
    }

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✓ Profile saved' });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile & Settings</DialogTitle>
          <DialogDescription>Update your photo, name and status.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={uploading} className="relative group">
                <Avatar className="w-24 h-24 ring-2 ring-border">
                  {/* key forces re-mount when URL changes so new image always loads */}
                  <AvatarImage key={avatarUrl} src={avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploading
                    ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                    : <Camera  className="w-6 h-6 text-white" />}
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*"
                className="hidden" onChange={handleAvatarChange} />
              <p className="text-xs text-muted-foreground">
                {uploading ? 'Uploading…' : 'Tap photo to change'}
              </p>
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="ps-email">Email</Label>
              <Input id="ps-email" value={email} disabled />
            </div>

            {/* Display name */}
            <div className="space-y-2">
              <Label htmlFor="ps-name">Display name</Label>
              <Input id="ps-name" value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="ps-status">About / Status</Label>
              <Textarea id="ps-status" value={status}
                onChange={e => setStatus(e.target.value)}
                placeholder="Hey there! I am using ChatSee" rows={2} />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" className="text-destructive hover:text-destructive"
                onClick={async () => { await signOut(); onOpenChange(false); }}>
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
