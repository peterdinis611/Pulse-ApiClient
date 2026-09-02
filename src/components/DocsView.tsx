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
  Radio,
  Search,
  Send,
  Sparkles,
  Terminal,
  Zap,
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
  data: Database,
  "python-cli": Zap,
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
      <div className="docs-masthead">
        <p className="docs-masthead__kicker">Field manual</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-xl space-y-2">
            <h2 className="text-heading">What Pulse can do</h2>
            <p className="text-body text-muted-foreground">
              {FEATURE_DOC_SECTIONS.length} topics across five desks — same pages as the public
              guide. Search, or pick a chapter.
            </p>
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the manual…"
              className="h-9 border-border/70 bg-background/80 pl-9 shadow-sm"
            />
          </div>
        </div>
        <div className="docs-masthead__rule" />
        <div className="flex flex-wrap gap-2">
          {FEATURE_DOC_GROUPS.map((group, index) => {
            const count = FEATURE_DOC_SECTIONS.filter((section) => section.group === group).length;
            const selected = groupFilter === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(selected ? null : group)}
                title={FEATURE_DOC_GROUP_BLURBS[group]}
                className={cn("docs-chip", selected && "docs-chip--on")}
              >
                <span className="font-mono text-[10px] tracking-wider opacity-60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {group}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[252px_minmax(0,1fr)]">
        <Panel className="h-fit lg:sticky lg:top-0">
          <PanelHeader label="Chapters" title={`${filtered.length} shown`} />
          <PanelBody className="max-h-[min(70vh,640px)] space-y-4 overflow-auto p-2">
            {grouped.length === 0 && (
              <p className="px-2 py-6 text-center text-body text-muted-foreground">
                Nothing matches that search.
              </p>
            )}
            {grouped.map(({ group, sections }) => (
              <div key={group}>
                <p className="mb-1.5 px-2 text-caption">{group}</p>
                <div className="space-y-0.5">
                  {sections.map((section) => {
                    const selected = active?.id === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveId(section.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          selected
                            ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px] shadow-primary/20"
                            : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md",
                            selected ? "bg-primary/15 text-primary" : "bg-muted/60 text-foreground/70",
                          )}
                        >
                          <SectionIcon id={section.id} className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight">
                            {section.title}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {section.items.length} notes
                            {section.howTo?.length ? ` · ${section.howTo.length}-step walkthrough` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>

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
      <PanelBody className="docs-article space-y-6 p-5 sm:p-7">
        <header className="docs-article__lede">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-none bg-primary/12 text-primary">
            <SectionIcon id={section.id} className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-caption">{section.group}</p>
            <h3 className="text-title mt-0.5">{section.title}</h3>
            <p className="mt-2 max-w-2xl text-body leading-relaxed text-muted-foreground">
              {section.summary}
            </p>
          </div>
        </header>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            In the product
          </p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Walkthrough
            </p>
            <ol className="docs-walk">
              {section.howTo.map((step, index) => (
                <li key={step}>
                  <span className="docs-walk__n">{index + 1}</span>
                  <p className="min-w-0 text-body leading-relaxed text-foreground/90">
                    <DocInlineText text={step} />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {section.tips?.map((tip) => (
          <div key={tip} className="docs-tip">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-body leading-relaxed text-foreground/90">
              <DocInlineText text={tip} />
            </p>
          </div>
        ))}

        {(prev || next) && (
          <div className="grid gap-2 border-t border-border/50 pt-4 sm:grid-cols-2">
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
