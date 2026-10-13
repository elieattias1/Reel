import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/reel/Button";

export function TopNav({ email, title }: { email?: string | null; title?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 px-6">
      <Link href="/projects" className="text-[15px] font-semibold tracking-tight text-zinc-900">
        Reel{title && <span className="ml-2 font-normal text-zinc-400">/ {title}</span>}
      </Link>
      <div className="flex items-center gap-3">
        {email && <span className="text-[13px] text-zinc-500">{email}</span>}
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
