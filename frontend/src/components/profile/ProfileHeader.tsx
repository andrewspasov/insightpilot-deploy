import { User } from '@/types';
import { User as UserIcon } from 'lucide-react';

interface ProfileHeaderProps {
  user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-hover to-accent p-8 mb-8 animate-in">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-10 -mb-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-primary-foreground mb-2">
            Account & Profile
          </h1>
          <p className="text-primary-foreground/80 text-base">
            Manage your profile, subscription, tools, and security in one place.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              className="h-16 w-16 rounded-full border-2 border-white/50"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/50">
              <UserIcon className="h-8 w-8 text-primary-foreground" />
            </div>
          )}
          <div>
            <p className="font-semibold text-primary-foreground">{user.fullName}</p>
            <p className="text-sm text-primary-foreground/70">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
