import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, initials } from '@/lib/utils';

interface UserAvatarProps {
  user: { name: string; avatarUrl: string | null };
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/** A person's avatar, or their initials; decorative (the name is always given next to it). */
export function UserAvatar({ user, size = 'default', className }: UserAvatarProps) {
  return (
    <Avatar size={size} aria-hidden="true" className={cn(className)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
      <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
