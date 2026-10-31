"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { signInWithProvider } from "@/app/auth/actions";
import { GoogleIcon } from "@/components/auth/provider-icons";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "Sign-in was cancelled before permission was granted. You can try again at any time.",
  oauth_start_failed:
    "We couldn't reach the sign-in provider. Please try again in a moment.",
  invalid_provider: "That sign-in option isn't supported.",
};

const FALLBACK_ERROR = "We couldn't complete sign-in. Please try again.";

type LoginFormProps = {
  next?: string;
  error?: string;
};

export function LoginForm({ next, error }: LoginFormProps) {
  return (
    <form action={signInWithProvider} className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="mb-1 rounded-md border border-destructive/30 bg-destructive/[0.06] px-3.5 py-2.5 text-[13px] leading-5 text-destructive"
        >
          {ERROR_MESSAGES[error] ?? FALLBACK_ERROR}
        </p>
      ) : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <ProviderButton provider="google" icon={<GoogleIcon />}>
        Continue with Google
      </ProviderButton>
    </form>
  );
}

function ProviderButton({
  provider,
  icon,
  children,
}: {
  provider: "google";
  icon: ReactNode;
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const active = pending && data?.get("provider") === provider;

  return (
    <Button
      type="submit"
      name="provider"
      value={provider}
      variant="outline"
      size="lg"
      disabled={pending}
      aria-busy={active}
      className="h-11 w-full gap-3 bg-card text-[14px] hover:bg-surface-2"
    >
      {active ? <LoaderCircle className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}
