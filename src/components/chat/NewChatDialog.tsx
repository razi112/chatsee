import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Profile } from '@/hooks/useChat';

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  onSelectUser: (userId: string) => void;
}

export default function NewChatDialog({
  open,
  onOpenChange,
  profiles,
  onSelectUser,
}: NewChatDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProfiles = profiles.filter(
    profile =>
      profile.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const handleSelectUser = (userId: string) => {
    onSelectUser(userId);
    onOpenChange(false);
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <UserPlus className="w-5 h-5 text-primary" />
            New Conversation
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Search for users by email to start a conversation
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
          />
        </div>

        <ScrollArea className="max-h-[300px] mt-4">
          {filteredProfiles.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No users found' : 'Type to search users'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProfiles.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => handleSelectUser(profile.id)}
                  className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-secondary transition-colors text-left"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary font-medium text-sm">
                        {getInitials(profile.display_name, profile.email)}
                      </AvatarFallback>
                    </Avatar>
                    {profile.is_online && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-online rounded-full border-2 border-card" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {profile.display_name || profile.email.split('@')[0]}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {profile.email}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
