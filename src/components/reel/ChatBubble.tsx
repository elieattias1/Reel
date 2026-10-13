import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-zinc-200 text-zinc-600" : "bg-accent-500 text-white"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          isUser ? "bg-zinc-100 text-zinc-900" : "bg-white text-zinc-800"
        )}
      >
        {children}
      </div>
    </div>
  );
}
