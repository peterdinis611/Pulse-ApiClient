import Link from 'next/link';
import Image from 'next/image';
import { CHAPTERS } from '@/lib/chapters';
import { cn } from '@/lib/cn';

export default function HomePage() {
  return (
    <main className="pulse-hero mx-auto w-full max-w-6xl">
      <div className="pulse-hero__grain" aria-hidden />

      <div className="relative z-[1] grid items-end gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-7">
          <p className="pulse-kicker pulse-fade">Local-first · desktop · no cloud</p>
          <h1 className="pulse-display pulse-fade pulse-fade-2 text-[clamp(3.2rem,8vw,6.4rem)] leading-[0.88] font-semibold">
            Pulse
            <span className="mt-3 block max-w-lg text-[1.35rem] leading-snug font-medium tracking-tight text-fd-muted-foreground sm:text-3xl">
              Field manual for the request workspace.
            </span>
          </h1>
          <div className="pulse-rule pulse-fade pulse-fade-3 max-w-xs" />
          <p className="pulse-fade pulse-fade-3 max-w-md text-base leading-relaxed text-fd-muted-foreground sm:text-lg">
            Path params, collection inherit, variable layers, snippets, runner data files, and a
            timing waterfall — the same guide that lives in the app rail.
          </p>
          <div className="pulse-fade pulse-fade-4 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center rounded-none bg-fd-primary px-5 py-2.5 text-sm font-semibold tracking-wide text-fd-primary-foreground no-underline"
            >
              Open the guide
            </Link>
            <Link
              href="/docs/workspace/path-params"
              className="inline-flex items-center rounded-none border border-fd-border bg-fd-card/70 px-5 py-2.5 text-sm font-medium no-underline"
            >
              Path params
            </Link>
          </div>
          <dl className="pulse-fade pulse-fade-4 grid max-w-md grid-cols-3 gap-4 pt-2 font-mono text-[11px] tracking-wide uppercase">
            <div>
              <dt className="text-fd-muted-foreground">Topics</dt>
              <dd className="mt-1 text-lg font-semibold tracking-tight text-fd-foreground">19</dd>
            </div>
            <div>
              <dt className="text-fd-muted-foreground">Chapters</dt>
              <dd className="mt-1 text-lg font-semibold tracking-tight text-fd-foreground">05</dd>
            </div>
            <div>
              <dt className="text-fd-muted-foreground">Sync</dt>
              <dd className="mt-1 text-lg font-semibold tracking-tight text-fd-foreground">SQLite</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto mb-8 w-full max-w-xl pb-16 lg:mx-0 lg:mb-0">
          <Image
            src="/screenshots/request.png"
            alt="Pulse request workspace"
            width={960}
            height={640}
            className="pulse-shot pulse-shot--tilt relative z-[1] w-full"
            priority
          />
          <Image
            src="/screenshots/overview.png"
            alt="Pulse overview"
            width={640}
            height={420}
            className="pulse-shot pulse-shot--tilt-b absolute -right-4 -bottom-10 z-[2] hidden w-[58%] sm:block"
          />
        </div>
      </div>

      <section className="relative z-[1] mt-20 space-y-6 sm:mt-28">
        <div className="flex items-end justify-between gap-4">
          <h2 className="pulse-display text-3xl font-semibold tracking-tight sm:text-4xl">Chapters</h2>
          <p className="hidden max-w-xs text-right text-sm text-fd-muted-foreground sm:block">
            Five desks. Same source as in-app Docs.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHAPTERS.map((chapter, index) => (
            <Link
              key={chapter.n}
              href={chapter.href}
              className={cn('pulse-chapter', index === 4 && 'sm:col-span-2 lg:col-span-1 lg:col-start-2')}
            >
              <span className="pulse-chapter__n">{chapter.n}</span>
              <span className="pulse-display text-2xl leading-none font-semibold">{chapter.title}</span>
              <span className="text-sm leading-relaxed text-fd-muted-foreground">{chapter.blurb}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
