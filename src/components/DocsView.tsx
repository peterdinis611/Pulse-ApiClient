import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cookie,
  Database,
  FileCode2,
  FlaskConical,
  Globe2,
  History,
  Keyboard,
  Lightbulb,
  Lock,
  Palette,
  Radio,
  Search,
  Send,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  FEATURE_DOC_GROUPS,
  FEATURE_DOC_SECTIONS,
  type FeatureDocSection,
} from "@/lib/feature-docs";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  requests: Send,
  auth: Lock,
  response: Sparkles,
  websocket: Radio,
  "pre-request": FileCode2,
  tests: FlaskConical,
  console: Terminal,
  collections: BookOpen,
  environments: Globe2,
  history: History,
  cookies: Cookie,
  themes: Palette,
  search: Keyboard,
  data: Database,
};

function DocInlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\{\{[^}]+\}}|pulse\.[\w.]+(?:\([^)]*\))?|Cmd\/Ctrl[^\s,]*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const isCode =
          (part.startsWith("`") && part.endsWith("`")) ||
          part.startsWith("{{") ||
          part.startsWith("pulse.") ||
          part.startsWith("Cmd/Ctrl");
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
  const [activeId, setActiveId] = useState(FEATURE_DOC_SECTIONS[0]?.id ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FEATURE_DOC_SECTIONS;
    return FEATURE_DOC_SECTIONS.filter((section) => {
      const haystack = [
        section.title,
        section.summary,
        section.group,
        ...section.items,
        ...(section.tips ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

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
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-primary/12 via-card to-card px-5 py-5 shadow-sm sm:px-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-caption text-primary">Feature guide</p>
            <h2 className="text-heading">Everything Pulse can do</h2>
            <p className="max-w-xl text-body text-muted-foreground">
              Browse {FEATURE_DOC_SECTIONS.length} topics across requests, scripting, data, and
              appearance — or search to jump straight to a capability.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search features…"
              className="h-9 border-border/70 bg-background/80 pl-9 shadow-sm backdrop-blur"
            />
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {FEATURE_DOC_GROUPS.map((group) => {
            const count = FEATURE_DOC_SECTIONS.filter((section) => section.group === group).length;
            return (
              <span
                key={group}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur"
              >
                {group}
                <span className="tabular-nums text-foreground/80">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Panel className="h-fit lg:sticky lg:top-0">
          <PanelHeader label="Topics" title={`${filtered.length} shown`} />
          <PanelBody className="max-h-[min(70vh,640px)] space-y-4 overflow-auto p-2">
            {grouped.length === 0 && (
              <p className="px-2 py-6 text-center text-body text-muted-foreground">
                No matching features.
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
                            {section.items.length} points
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
              Try a different search.
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
      <PanelBody className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <SectionIcon id={section.id} className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-title">{section.title}</h3>
            <p className="mt-1 text-body text-muted-foreground">{section.summary}</p>
          </div>
        </div>

        <ol className="space-y-2">
          {section.items.map((item, index) => (
            <li
              key={item}
              className="flex gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/35"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm">
                {index + 1}
              </span>
              <p className="min-w-0 text-body leading-relaxed text-foreground/90">
                <DocInlineText text={item} />
              </p>
            </li>
          ))}
        </ol>

        {section.tips?.map((tip) => (
          <div
            key={tip}
            className="flex gap-3 rounded-lg border border-primary/20 bg-primary/6 px-3.5 py-3"
          >
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-body leading-relaxed text-foreground/90">
              <DocInlineText text={tip} />
            </p>
          </div>
        ))}

        {(prev || next) && (
          <div className="grid gap-2 border-t border-border/50 pt-4 sm:grid-cols-2">
            <NavChip
              label="Previous"
              section={prev}
              align="left"
              onSelect={onSelect}
            />
            <NavChip
              label="Next"
              section={next}
              align="right"
              onSelect={onSelect}
            />
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
