import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button } from "@/components/reel/Button";
import { Input, Label } from "@/components/reel/Input";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">Reel</h1>
        <p className="mb-8 text-sm text-zinc-500">Create your account.</p>

        <form action={signup} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
          </div>
          {error && <p className="text-[13px] text-danger-600">{error}</p>}
          <Button type="submit" className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
