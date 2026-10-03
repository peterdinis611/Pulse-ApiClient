import { useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Plug,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useI18n, useT } from "@/hooks/useLocale";
import { pickCopy } from "@/lib/changelog";
import { MCP_GUIDE_INTRO, MCP_GUIDE_SECTIONS } from "@/lib/mcp-guide";
import { navigatePulse } from "@/lib/app-navigate";
import { toast } from "@/lib/toast";
import { useApp } from "@/machines";
import { cn } from "@/lib/utils";

const SECTION_ICONS = {
  setup: CheckCircle2,
  talk: Sparkles,
  tools: Wrench,
  resources: BookOpen,
  safety: Shield,
  cli: Terminal,
} as const;

function GuideInline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={index}
              className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[12px] text-foreground"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function McpView() {
  const t = useT();
  const { resolvedLocale } = useI18n();
  const { setMainView } = useApp();
  const locale = resolvedLocale === "sk" ? "sk" : "en";

  const sections = useMemo(
    () =>
      MCP_GUIDE_SECTIONS.map((section) => ({
        ...section,
        title: pickCopy(section.title, locale),
        body: pickCopy(section.body, locale),
        bullets: section.bullets?.map((item) => pickCopy(item, locale)),
      })),
    [locale],
  );

  const intro = pickCopy(MCP_GUIDE_INTRO, locale);

  const copyBlock = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("mcp.copied"));
    } catch {
      toast.error(t("mcp.copyFailed"));
    }
  };

  return (
    <PageShell resetKey="mcp" width="wide">
      <div className="docs-masthead" data-tour="mcp">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Plug className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">{t("mcp.eyebrow")}</p>
            <h1 className="text-display mt-1 text-balance">{t("view.mcp.title")}</h1>
            <p className="mt-2 max-w-3xl text-body text-muted-foreground">{intro}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setMainView("docs");
              navigatePulse({ view: "docs", docsSection: "mcp" });
            }}
          >
            <BookOpen className="size-3.5" />
            {t("mcp.openDocs")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMainView("docs");
              navigatePulse({ view: "docs", docsSection: "python-cli" });
            }}
          >
            <Terminal className="size-3.5" />
            {t("mcp.openCliDocs")}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex flex-col gap-4">
          {sections.map((section) => {
            const Icon = SECTION_ICONS[section.id as keyof typeof SECTION_ICONS] ?? Plug;
            return (
              <Panel key={section.id} id={section.id} className="scroll-mt-4">
                <PanelHeader
                  label={section.id}
                  title={section.title}
                  actions={<Icon className="size-4 text-muted-foreground" />}
                />
                <PanelBody className="space-y-3">
                  <p className="text-body text-muted-foreground">
                    <GuideInline text={section.body} />
                  </p>
                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="space-y-2">
                      {section.bullets.map((bullet, index) => (
                        <li
                          key={index}
                          className="flex gap-2 text-[13px] leading-relaxed text-foreground/90"
                        >
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                          <span>
                            <GuideInline text={bullet} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.code && (
                    <div className="relative">
                      <pre
                        className={cn(
                          "overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-3",
                          "font-mono text-[11.5px] leading-relaxed text-foreground",
                        )}
                      >
                        {section.code}
                      </pre>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-2 top-2 size-7"
                        aria-label={t("mcp.copy")}
                        onClick={() => void copyBlock(section.code!)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </PanelBody>
              </Panel>
            );
          })}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-3 space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="text-caption px-1">{t("mcp.onThisPage")}</p>
            <nav className="flex flex-col gap-0.5">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-lg px-2 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
