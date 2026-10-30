import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/landing/placeholder-page";

export const metadata: Metadata = {
  title: "Get started · vetted.",
};

export default function GetStartedPage() {
  return (
    <PlaceholderPage
      title="Start your assessment"
      body="Assessment setup is not available yet."
    />
  );
}
