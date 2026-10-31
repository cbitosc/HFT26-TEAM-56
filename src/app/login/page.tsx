import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
  title: "Log in · vetted.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="flex h-14 items-center justify-between px-6 lg:px-8">
        <Link
          href="/"
          className="-ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 text-[13px] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-3.5" />
          Back to home
        </Link>
        <ThemeToggle className="-mr-1.5" />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-24">
        <div className="w-full max-w-[360px]">
          <Wordmark className="text-[34px]" />
          <h1 className="mt-6 text-[28px] leading-tight">Beyond the Résumé.</h1>
          <p className="type-body mt-3 text-muted-foreground">
            Continue with your Google account. First time here? We&apos;ll
            set up your account automatically.
          </p>

          <div className="mt-8">
            {/* Search params are request data, so only this part waits on them. */}
            <Suspense fallback={<LoginForm />}>
              <LoginFormWithParams searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

async function LoginFormWithParams({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return <LoginForm next={next} error={error} />;
}
