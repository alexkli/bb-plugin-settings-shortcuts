// Settings Shortcuts — footer icons that open a specific bb Settings page directly.
//
// Each pinned Settings page (built-in section, plugin page, or project page) is
// its own sidebar-footer icon; one click navigates there. Pins are chosen on
// this plugin's Settings page (Settings → Plugins → Settings Shortcuts).
//
// Footer items are registered once at setup, so pins live in localStorage
// (readable synchronously at setup) and the window reloads to apply changes.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Settings targets

type Group = "bb" | "Plugins" | "Projects";

interface Target {
  /** Stable key, also the pin id: "section:<id>", "plugin:<id>", "project:<id>". */
  key: string;
  label: string;
  icon: string;
  path: string;
  group: Group;
  /** Extra text matched by search but not shown. */
  keywords?: string;
}

// Mirrors bb's own Settings sidebar (app/dist/assets/settings-sections-*.js).
const BUILTIN_SECTIONS: ReadonlyArray<{ id: string; label: string; icon: string }> = [
  { id: "general", label: "General", icon: "Settings" },
  { id: "providers", label: "Providers", icon: "Bot" },
  { id: "ai-services", label: "AI services", icon: "AiBrain01" },
  { id: "appearance", label: "Appearance", icon: "Palette" },
  { id: "keyboard", label: "Keyboard", icon: "SlidersHorizontal" },
  { id: "browser", label: "Browser", icon: "Browser" },
  { id: "files", label: "Files", icon: "File" },
  { id: "projects", label: "Projects", icon: "FolderGit" },
  { id: "machines", label: "Machines", icon: "Laptop" },
  { id: "mobile", label: "Mobile", icon: "Smartphone" },
  { id: "environment-variables", label: "Environment variables", icon: "Lock" },
  { id: "updates", label: "Updates", icon: "PackageReceive" },
  { id: "plugins", label: "Installed plugins", icon: "Plug02" },
  { id: "marketplaces", label: "Plugin marketplaces", icon: "Puzzle" },
  { id: "experiments", label: "Experiments", icon: "Beaker" },
  { id: "community", label: "Community", icon: "MessageSquare" },
  { id: "archived", label: "Archived threads", icon: "Archive" },
];

const builtinTargets: Target[] = BUILTIN_SECTIONS.map((section) => ({
  key: `section:${section.id}`,
  label: section.label,
  icon: section.icon,
  path: section.id === "general" ? "/settings" : `/settings/${section.id}`,
  group: "bb",
}));

function useAllTargets(): { targets: Target[]; loading: boolean; error: string | null } {
  const sdk = useSdk();
  const [dynamic, setDynamic] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([sdk.plugins.list(), sdk.projects.list()]).then(
      ([pluginsResult, projectsResult]) => {
        if (cancelled) return;
        const next: Target[] = [];
        if (pluginsResult.status === "fulfilled") {
          for (const plugin of pluginsResult.value.plugins) {
            if (!plugin.enabled) continue;
            next.push({
              key: `plugin:${plugin.id}`,
              label: plugin.name ?? plugin.id,
              icon: plugin.icon ?? "Puzzle",
              path: `/settings/plugins/${encodeURIComponent(plugin.id)}`,
              group: "Plugins",
              keywords: plugin.id,
            });
          }
        }
        if (projectsResult.status === "fulfilled") {
          for (const project of projectsResult.value) {
            next.push({
              key: `project:${project.id}`,
              label: project.name,
              icon: "FolderGit",
              path: `/settings/projects/${encodeURIComponent(project.id)}`,
              group: "Projects",
              keywords: "project",
            });
          }
        }
        next.sort((a, b) =>
          a.group === b.group ? a.label.localeCompare(b.label) : 0,
        );
        setDynamic(next);
        const failed = [pluginsResult, projectsResult].find(
          (result) => result.status === "rejected",
        );
        setError(failed ? String((failed as PromiseRejectedResult).reason) : null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sdk]);

  return {
    targets: [...builtinTargets, ...(dynamic ?? [])],
    loading: dynamic === null,
    error,
  };
}

// ---------------------------------------------------------------------------
// Navigation. The SDK has no generic route API, so drive bb's router directly:
// push the path and fire popstate, which the router listens to.

function navigateTo(path: string): void {
  if (window.location.hash.startsWith("#/")) {
    window.location.hash = path;
    return;
  }
  if (window.location.pathname === path) return;
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

// ---------------------------------------------------------------------------
// Pins (localStorage; per browser / desktop app)

interface Pin {
  key: string;
  label: string;
  icon: string;
  path: string;
}

const PINS_STORAGE_KEY = "bb-plugin-settings-shortcuts:pins";

function toPin(target: Target): Pin {
  return { key: target.key, label: target.label, icon: target.icon, path: target.path };
}

/** Used until the user saves their own pins. */
const DEFAULT_PINS: Pin[] = builtinTargets
  .filter((target) => target.key === "section:providers" || target.key === "section:projects")
  .map(toPin);

function readPins(): Pin[] {
  try {
    const raw = window.localStorage.getItem(PINS_STORAGE_KEY);
    if (raw === null) return DEFAULT_PINS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PINS;
    return parsed.filter(
      (pin): pin is Pin =>
        typeof pin === "object" &&
        pin !== null &&
        typeof pin.key === "string" &&
        typeof pin.label === "string" &&
        typeof pin.icon === "string" &&
        typeof pin.path === "string" &&
        pin.path.startsWith("/settings"),
    );
  } catch {
    return DEFAULT_PINS;
  }
}

function writePins(pins: Pin[]): void {
  window.localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins));
}

// ---------------------------------------------------------------------------
// Pin editor (rendered on this plugin's Settings page)

function matches(target: Target, query: string): boolean {
  if (query === "") return true;
  const haystack = `${target.label} ${target.group} ${target.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function PinsEditor() {
  const { targets, loading, error } = useAllTargets();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<Pin[]>(() => readPins());
  const [dirty, setDirty] = useState(false);
  const pinnedKeys = useMemo(() => new Set(pins.map((pin) => pin.key)), [pins]);

  const rows = useMemo(() => {
    const filtered = targets.filter((target) => matches(target, query));
    const sections: Array<{ title: string; items: Target[] }> = [];
    for (const group of ["bb", "Plugins", "Projects"] as const) {
      const items = filtered.filter((target) => target.group === group);
      if (items.length > 0) sections.push({ title: group, items });
    }
    return sections;
  }, [targets, query]);

  // The footer is hidden on Settings pages, so apply on leaving this page too.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(
    () => () => {
      if (dirtyRef.current) window.setTimeout(() => window.location.reload(), 50);
    },
    [],
  );

  const update = (change: (current: Pin[]) => Pin[]) => {
    setPins((current) => {
      const next = change(current);
      writePins(next);
      return next;
    });
    setDirty(true);
  };
  const toggle = (target: Target) =>
    update((current) =>
      current.some((pin) => pin.key === target.key)
        ? current.filter((pin) => pin.key !== target.key)
        : [...current, toPin(target)],
    );
  const move = (index: number, delta: number) =>
    update((current) => {
      const next = [...current];
      const [pin] = next.splice(index, 1);
      if (pin) next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, pin);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium">In the footer</span>
          {dirty ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Apply now (reloads window)
            </button>
          ) : null}
        </div>
        {pins.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Nothing pinned. Pick pages below.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pins.map((pin, index) => (
              <li key={pin.key} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Icon name={pin.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{pin.label}</span>
                <IconButton label={`Move ${pin.label} earlier`} icon="ArrowUp" disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton label={`Move ${pin.label} later`} icon="ArrowDown" disabled={index === pins.length - 1} onClick={() => move(index, 1)} />
                <IconButton label={`Remove ${pin.label}`} icon="X" onClick={() => update((current) => current.filter((p) => p.key !== pin.key))} />
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          bb shows only a few plugin icons in the footer; the rest go into its "More footer
          actions" (…) menu, in this order.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Icon name="Search" className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter settings pages…"
            aria-label="Filter settings pages"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {rows.map((section) => (
            <div key={section.title} className="py-0.5">
              <div className="px-4 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </div>
              {section.items.map((target) => (
                <label
                  key={target.key}
                  className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <input
                    type="checkbox"
                    checked={pinnedKeys.has(target.key)}
                    onChange={() => toggle(target)}
                    aria-label={`Show ${target.label} in footer`}
                  />
                  <Icon name={target.icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{target.label}</span>
                </label>
              ))}
            </div>
          ))}
          {loading ? (
            <div className="px-4 py-1.5 text-xs text-muted-foreground">Loading plugins and projects…</div>
          ) : null}
          {error !== null ? <div className="px-4 py-1.5 text-xs text-destructive">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

function IconButton(props: { label: string; icon: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      <Icon name={props.icon} className="size-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------

export default definePluginApp((app) => {
  for (const pin of readPins()) {
    app.experimental_sidebarFooter.register({
      kind: "action",
      id: `pin-${pin.key.replace(/[^A-Za-z0-9_-]/g, "_")}`,
      label: pin.label,
      icon: pin.icon,
      onActivate: () => navigateTo(pin.path),
    });
  }

  app.slots.settingsSection({
    id: "footer-icons",
    title: "Footer icons",
    description: "Settings pages that get their own icon in the sidebar footer.",
    component: PinsEditor,
  });
});
