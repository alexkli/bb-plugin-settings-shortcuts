# Settings Shortcuts (bb plugin)

Sidebar-footer icons that open a specific bb Settings page in one click.

- Defaults: **Providers** and **Projects**.
- Choose and order pages under Settings → Plugins → **Settings Shortcuts** → Footer icons:
  any built-in section, any enabled plugin's page, or any project's settings page.
- Changes apply when you leave that page or click "Apply now" (the window reloads,
  since footer items register once per app load).

Notes
- Choices live in `localStorage`, so they're per client (desktop app vs. remote browser).
- bb shows only a few plugin icons in the footer; extras go into its "More footer
  actions" (…) menu, in your chosen order.
- Navigation pushes the Settings URL into bb's router directly (the SDK has no route
  API), and the built-in section list mirrors bb's — both may need updating if bb
  changes its Settings routes.

Build: `bb plugin build . && bb plugin reload settings-shortcuts`
