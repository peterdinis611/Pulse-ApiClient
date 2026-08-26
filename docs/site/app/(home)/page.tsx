import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <main className="pulse-hero mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-xl space-y-6 text-left">
        <p className="pulse-kicker">Local-first · desktop</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Pulse
          <span className="mt-2 block text-2xl font-medium tracking-tight text-fd-muted-foreground sm:text-3xl">
            the request workspace, documented.
          </span>
        </h1>
        <p className="text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
          Path params, collection inherit, variable layers, and code snippets — the same guide that
          lives in the app rail, built with Fumadocs.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs"
            className="inline-flex items-center rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-semibold text-fd-primary-foreground no-underline"
          >
            Open the guide
          </Link>
          <Link
            href="/docs/workspace/path-params"
            className="inline-flex items-center rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 text-sm font-medium no-underline"
          >
            Path params
          </Link>
        </div>
      </div>
      <Image
        src="/screenshots/request.png"
        alt="Pulse request workspace"
        width={960}
        height={640}
        className="pulse-shot w-full max-w-xl rounded-xl lg:-mb-6 lg:max-w-lg"
        priority
      />
    </main>
  );
}
