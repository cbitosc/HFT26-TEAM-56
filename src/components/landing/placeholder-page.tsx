import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

type PlaceholderPageProps = {
  title: string;
  body: string;
};

export function PlaceholderPage({ title, body }: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-24">
      <Link
        href="/"
        className="w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Wordmark />
      </Link>
      <h1 className="mt-8 text-3xl font-medium tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
      <Link
        href="/"
        className="mt-8 text-sm text-primary transition-colors duration-200 hover:text-foreground"
      >
        Back to home
      </Link>
    </main>
  );
}
