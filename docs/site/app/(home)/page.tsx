import Link from 'next/link';
import Image from 'next/image';
import { CHAPTERS } from '@/lib/chapters';

const START = [
  { title: 'Send a request', href: '/docs/workspace/requests' },
  { title: 'Path parameters', href: '/docs/workspace/path-params' },
  { title: 'Environments', href: '/docs/data/environments' },
  { title: 'Keyboard shortcuts', href: '/docs/productivity/search' },
] as const;

const CHAPTER_TONES = [
  'var(--pulse-chapter-1)',
  'var(--pulse-chapter-2)',
  'var(--pulse-chapter-3)',
  'var(--pulse-chapter-4)',
  'var(--pulse-chapter-5)',
] as const;

export default function HomePage() {
  return (
    <main className="pulse-home">
      <section className="pulse-hero">
        <h1 className="sr-only">Pulse manual</h1>
        <div className="pulse-hero__fields">
          <div className="pulse-hero__field pulse-hero__field--bone">
            <p className="pulse-hero__word pulse-hero__word--top pulse-fade" aria-hidden>
              Pulse
            </p>
          </div>
          <div className="pulse-hero__field pulse-hero__field--ink">
            <p className="pulse-hero__word pulse-hero__word--bottom pulse-fade pulse-fade-2" aria-hidden>
              manual
            </p>
            <div className="pulse-hero__rail">
              <p className="pulse-hero__lede pulse-fade pulse-fade-3">
                The request desk, written down. Same pages as Docs in the app rail.
              </p>
              <div className="pulse-fade pulse-fade-4 flex flex-wrap gap-3">
                <Link href="/docs" className="pulse-btn">
                  Open the guide
                </Link>
                <Link href="/docs/workspace/requests" className="pulse-btn pulse-btn--ghost">
                  Send a request
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="pulse-section pulse-section--chapter"
        style={{ ['--pulse-chapter' as string]: CHAPTER_TONES[0] }}
      >
        <h2 className="pulse-section__head">Five desks. One source.</h2>
        <ul className="pulse-capabilities">
          {CHAPTERS.map((chapter) => (
            <li key={chapter.n}>
              <Link href={chapter.href}>
                <span className="pulse-capabilities__title">{chapter.title}</span>
                <p className="pulse-capabilities__blurb">{chapter.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="pulse-shot-band" aria-label="Product screens">
        <div className="pulse-shot-band__inner">
          <Image
            src="/screenshots/request.png"
            alt="Pulse request workspace with URL, params, and response"
            width={1280}
            height={800}
            className="pulse-shot"
            priority={false}
          />
          <div>
            <Image
              src="/screenshots/overview.png"
              alt="Pulse overview of saved requests"
              width={960}
              height={640}
              className="pulse-shot mb-6"
            />
            <p className="pulse-shot-band__copy">
              Local SQLite, no cloud account. The guide mirrors what you already have on disk.
            </p>
          </div>
        </div>
      </section>

      <section
        className="pulse-section pulse-section--chapter"
        style={{ ['--pulse-chapter' as string]: CHAPTER_TONES[2] }}
      >
        <h2 className="pulse-section__head">Start here</h2>
        <nav className="pulse-path" aria-label="Recommended reading">
          {START.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.title}
            </Link>
          ))}
        </nav>
      </section>

      <section className="pulse-cta">
        <h2>Read it at the desk</h2>
        <div className="pulse-cta__rail">
          <p>Open Docs from the left rail, or stay here — both sync from the same feature list.</p>
          <Link href="/docs" className="pulse-btn">
            Enter the guide
          </Link>
        </div>
      </section>

      <footer className="pulse-footer">
        <p className="pulse-footer__name" aria-hidden>
          Pulse
        </p>
        <nav className="pulse-footer__links" aria-label="Footer">
          <Link href="/docs">Guide</Link>
          <Link href="/docs/productivity/privacy">Privacy</Link>
          <Link href="/docs/productivity/mcp">MCP</Link>
          <Link href="/docs/productivity/python-cli">Python CLI</Link>
          <a href="https://github.com/peterdinis611/Pulse-ApiClient">GitHub</a>
        </nav>
      </footer>
    </main>
  );
}
