import { MenuIcon } from 'lucide-react';
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

// docs/design/ui.md → App shell: a 48px header with the ☰ sidebar toggle (below 768px) and the
// user's menu. The workspace switcher and search arrive with their tasks. `user` is undefined
// while it loads.
interface HeaderProps {
  user: HeaderUser | undefined;
  /** The user could not be loaded. */
  userError?: boolean;
  onLogout: () => void;
  loggingOut?: boolean;
  /** The ☰ button that opens the sidebar below 768px; omitted when there is no sidebar. */
  menu?: { open: boolean; onToggle: () => void };
}

export function Header({
  user,
  userError = false,
  onLogout,
  loggingOut = false,
  menu,
}: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        {menu && (
          <button
            type="button"
            aria-label={menu.open ? 'Close menu' : 'Open menu'}
            aria-expanded={menu.open}
            aria-controls="app-sidebar"
            className="-ml-2 rounded-md p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            onClick={menu.onToggle}
          >
            <MenuIcon aria-hidden="true" className="size-5" />
          </button>
        )}
        <Link to="/" className="font-semibold">
          TaskBoard
        </Link>
      </div>
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
            <DropdownMenuItem disabled={loggingOut} onSelect={onLogout}>
              {loggingOut ? 'Logging out…' : 'Log out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : userError ? (
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link to="/settings/profile" className="underline underline-offset-4">
            Account
          </Link>
          <button
            type="button"
            className="underline underline-offset-4"
            disabled={loggingOut}
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      ) : (
        <div aria-hidden="true" className="size-8 animate-pulse rounded-full bg-muted" />
      )}
    </header>
  );
}
