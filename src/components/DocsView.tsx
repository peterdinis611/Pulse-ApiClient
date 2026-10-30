import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code2,
  Cookie,
  Cpu,
  Database,
  FileCode2,
  FlaskConical,
  GitBranch,
  Globe2,
  History,
  Keyboard,
  LayoutGrid,
  Lightbulb,
  Link2,
  Lock,
  Palette,
  Plug,
  Radio,
  Search,
  Send,
  Sparkles,
  Terminal,
  Zap,
  Library,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  FEATURE_DOC_GROUP_BLURBS,
  FEATURE_DOC_GROUPS,
  FEATURE_DOC_SECTIONS,
  type FeatureDocGroup,
  type FeatureDocSection,
} from "@/lib/feature-docs";
import { onPulseNavigate } from "@/lib/app-navigate";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  requests: Send,
  "path-params": Link2,
  auth: Lock,
  inherit: GitBranch,
  "code-snippets": Code2,
  response: Sparkles,
  websocket: Radio,
  "pre-request": FileCode2,
  tests: FlaskConical,
  console: Terminal,
  collections: BookOpen,
  environments: Globe2,
  history: History,
  cookies: Cookie,
  "http-engine": Cpu,
  themes: Palette,
  search: Keyboard,
  "whats-new": Sparkles,
  data: Database,
  privacy: Shield,
  "git-workspace": GitBranch,
  "python-cli": Zap,
  mcp: Plug,
  libraries: Library,
};

function DocInlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\{\{[^}]+\}}|pulse\.[\w.]+(?:\([^)]*\))?|Cmd\/Ctrl[^\s,]*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const isKbd = part.startsWith("Cmd/Ctrl");
        const isCode =
          (part.startsWith("`") && part.endsWith("`")) ||
          part.startsWith("{{") ||
          part.startsWith("pulse.");
        if (isKbd) {
          return (
            <kbd key={index} className="ui-kbd mx-0.5">
              {part}
            </kbd>
          );
        }
        if (!isCode) return <span key={index}>{part}</span>;
        const value = part.startsWith("`") ? part.slice(1, -1) : part;
        return (
          <code
            key={index}
            className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[12px] text-foreground"
          >
            {value}
          </code>
        );
      })}
    </>
  );
}

function SectionIcon({ id, className }: { id: string; className?: string }) {
  const Icon = SECTION_ICONS[id] ?? BookOpen;
  return <Icon className={className} />;
}

export function DocsView() {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<FeatureDocGroup | null>(null);
  const [activeId, setActiveId] = useState(FEATURE_DOC_SECTIONS[0]?.id ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURE_DOC_SECTIONS.filter((section) => {
      if (groupFilter && section.group !== groupFilter) return false;
      if (!q) return true;
      const haystack = [
        section.title,
        section.summary,
        section.group,
        ...section.items,
        ...(section.howTo ?? []),
        ...(section.tips ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, groupFilter]);

  useEffect(() => {
    return onPulseNavigate((detail) => {
      if (!detail.docsSection) return;
      setGroupFilter(null);
      setQuery("");
      setActiveId(detail.docsSection);
    });
  }, []);

  useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.some((section) => section.id === activeId)) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  const active = filtered.find((section) => section.id === activeId) ?? filtered[0] ?? null;
  const activeIndex = active ? filtered.findIndex((section) => section.id === active.id) : -1;
  const prev = activeIndex > 0 ? filtered[activeIndex - 1] : null;
  const next =
    activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

  const grouped = useMemo(() => {
    return FEATURE_DOC_GROUPS.map((group) => ({
      group,
      sections: filtered.filter((section) => section.group === group),
    })).filter((entry) => entry.sections.length > 0);
  }, [filtered]);

  return (
    <PageShell resetKey="docs" width="wide">
      <div className="docs-masthead" data-tour="docs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-xl space-y-2">
            <h2 className="text-heading tracking-tight">Manual</h2>
            <p className="text-body text-muted-foreground">
              {FEATURE_DOC_SECTIONS.length} topics on five desks — same guide as the public site.
              Search, or open a chapter.
            </p>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search topics…"
              className="h-10 border-border/70 bg-background/90 pl-9"
              aria-label="Search documentation"
            />
          </div>
        </div>
        <div className="docs-masthead__rule" />
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chapters">
          {FEATURE_DOC_GROUPS.map((group) => {
            const count = FEATURE_DOC_SECTIONS.filter((section) => section.group === group).length;
            const selected = groupFilter === group;
            return (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setGroupFilter(selected ? null : group)}
                title={FEATURE_DOC_GROUP_BLURBS[group]}
                className={cn("docs-chip", selected && "docs-chip--on")}
              >
                {group}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
        <nav className="docs-toc h-fit lg:sticky lg:top-0" aria-label="Topics">
          <div className="docs-toc__head">
            <span>Topics</span>
            <span className="tabular-nums text-muted-foreground">{filtered.length}</span>
          </div>
          <div className="docs-toc__body max-h-[min(70vh,640px)] space-y-4 overflow-auto">
            {grouped.length === 0 && (
              <p className="px-2 py-8 text-center text-body text-muted-foreground">
                Nothing matches that search.
              </p>
            )}
            {grouped.map(({ group, sections }) => (
              <div key={group}>
                <p className="docs-toc__group">{group}</p>
                <div className="space-y-0.5">
                  {sections.map((section) => {
                    const selected = active?.id === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveId(section.id)}
                        aria-current={selected ? "page" : undefined}
                        className={cn("docs-toc__item", selected && "docs-toc__item--on")}
                      >
                        <SectionIcon id={section.id} className="size-3.5 shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1 truncate">{section.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {active ? (
          <DocArticle
            section={active}
            prev={prev}
            next={next}
            onSelect={setActiveId}
          />
        ) : (
          <Panel>
            <PanelBody className="py-16 text-center text-body text-muted-foreground">
              Try a different search or chapter.
            </PanelBody>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function DocArticle({
  section,
  prev,
  next,
  onSelect,
}: {
  section: FeatureDocSection;
  prev: FeatureDocSection | null;
  next: FeatureDocSection | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel className="min-w-0">
      <PanelHeader
        label={section.group}
        title={section.title}
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!prev}
              aria-label="Previous topic"
              onClick={() => prev && onSelect(prev.id)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!next}
              aria-label="Next topic"
              onClick={() => next && onSelect(next.id)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />
      <PanelBody className="docs-article space-y-8 p-5 sm:p-8">
        <header className="docs-article__lede">
          <div className="min-w-0">
            <p className="text-caption text-primary">{section.group}</p>
            <h3 className="text-title mt-1 text-[clamp(1.35rem,1.1rem+1vw,1.75rem)] tracking-tight">
              {section.title}
            </h3>
            <p className="mt-3 max-w-[42ch] text-body leading-relaxed text-muted-foreground">
              {section.summary}
            </p>
          </div>
        </header>

        <section className="space-y-3">
          <h4 className="docs-section-label">In the product</h4>
          <ul className="docs-notes">
            {section.items.map((item) => (
              <li key={item}>
                <DocInlineText text={item} />
              </li>
            ))}
          </ul>
        </section>

        {section.howTo && section.howTo.length > 0 && (
          <section className="space-y-3">
            <h4 className="docs-section-label">Walkthrough</h4>
            <ol className="docs-walk">
              {section.howTo.map((step, index) => (
                <li key={step}>
                  <span className="docs-walk__n" aria-hidden>
                    {index + 1}
                  </span>
                  <p className="min-w-0 text-body leading-relaxed text-foreground/90">
                    <DocInlineText text={step} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {section.tips?.map((tip) => (
          <aside key={tip} className="docs-tip">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-body leading-relaxed text-foreground/90">
              <DocInlineText text={tip} />
            </p>
          </aside>
        ))}

        {(prev || next) && (
          <div className="grid gap-2 border-t border-border/50 pt-5 sm:grid-cols-2">
            <NavChip label="Previous" section={prev} align="left" onSelect={onSelect} />
            <NavChip label="Next" section={next} align="right" onSelect={onSelect} />
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function NavChip({
  label,
  section,
  align,
  onSelect,
}: {
  label: string;
  section: FeatureDocSection | null;
  align: "left" | "right";
  onSelect: (id: string) => void;
}) {
  if (!section) {
    return <div className="hidden sm:block" />;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5",
        align === "right" && "sm:flex-row-reverse sm:text-right",
      )}
    >
      {align === "left" ? (
        <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="block truncate text-[13px] font-medium">{section.title}</span>
      </span>
    </button>
  );
}
