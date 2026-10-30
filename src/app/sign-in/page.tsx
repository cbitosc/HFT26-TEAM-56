import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/landing/placeholder-page";

export const metadata: Metadata = {
  title: "Sign in · vetted.",
};

export default function SignInPage() {
  return (
    <PlaceholderPage
      title="Sign in"
      body="Account access is not available yet."
    />
  );
}
