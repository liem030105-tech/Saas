import { Link } from 'react-router';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { UserDto } from '@trello-clone/shared';

/** What the header shows about the signed-in user. */
export type HeaderUser = Pick<UserDto, 'name' | 'email' | 'avatarUrl'>;

/** Up to two initials, for the avatar fallback. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

// docs/design/ui.md → App shell: a 48px header. The workspace switcher, search, and sidebar toggle
// arrive with their tasks. `user` is undefined while it loads; `userError` when it could not load.
export function Header({
  user,
  userError = false,
}: {
  user: HeaderUser | undefined;
  userError?: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      <Link to="/" className="font-semibold">
        TaskBoard
      </Link>
      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Account menu for ${user.name}`}
            className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Avatar>
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate">{user.name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings/profile">Profile</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : userError ? (
        <Link to="/settings/profile" className="text-sm font-medium underline underline-offset-4">
          Account
        </Link>
      ) : (
        <div aria-hidden="true" className="size-8 animate-pulse rounded-full bg-muted" />
      )}
    </header>
  );
}
