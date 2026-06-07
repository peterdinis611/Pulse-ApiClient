import { LogOut } from "lucide-react";
import { useApp } from "@/machines";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type UserAuthAvatarProps = {
  size?: "sm" | "lg";
  showLabel?: boolean;
  className?: string;
};

export function UserAuthAvatar({ size = "sm", showLabel = false, className }: UserAuthAvatarProps) {
  const { user, signOut } = useApp();
  if (!user) return null;

  const avatarSize = size === "lg" ? "size-16" : "size-8";
  const textSize = size === "lg" ? "text-lg" : "text-xs";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center gap-2 rounded-full outline-none", className)}
          title={user.name}
        >
          <Avatar className={avatarSize}>
            <AvatarFallback className={cn("bg-primary text-primary-foreground", textSize)}>
              {user.initials}
            </AvatarFallback>
          </Avatar>
          {showLabel && <span className="text-sm font-medium text-foreground">{user.name}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
