import { useState } from 'react';
import { Search, Users, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Profile } from '@/hooks/useChat';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  onCreate: (name: string, memberIds: string[]) => Promise<void> | void;
}

export default function CreateGroupDialog({ open, onOpenChange, profiles, onCreate }: Props) {
  const [step, setStep] = useState<'members' | 'name'>('members');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = profiles.filter(
    (p) =>
      p.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const reset = () => {
    setStep('members');
    setSearch('');
    setSelected(new Set());
    setName('');
    setSubmitting(false);
  };

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.size === 0) return;
    setSubmitting(true);
    await onCreate(name.trim(), Array.from(selected));
    setSubmitting(false);
    handleClose(false);
  };

  const getInitials = (n: string | null, e: string) =>
    n ? n.split(' ').map((x) => x[0]).join('').toUpperCase().slice(0, 2) : e.slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Users className="w-5 h-5 text-primary" />
            {step === 'members' ? 'Add group members' : 'Group name'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 'members'
              ? `${selected.size} selected`
              : 'Give your group a name'}
          </DialogDescription>
        </DialogHeader>

        {step === 'members' ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary border-0"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-[320px] mt-2">
              <div className="space-y-1">
                {filtered.map((p) => {
                  const isSel = selected.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        'w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary transition-colors text-left',
                        isSel && 'bg-primary/10'
                      )}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={p.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                          {getInitials(p.display_name, p.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {p.display_name || p.email.split('@')[0]}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border flex items-center justify-center',
                          isSel ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                        )}
                      >
                        {isSel && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button
                onClick={() => setStep('name')}
                disabled={selected.size === 0}
                className="w-full"
              >
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Input
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={50}
            />
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setStep('members')}>
                Back
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || submitting}>
                {submitting ? 'Creating...' : 'Create group'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
