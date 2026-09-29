# Weight Data Manager V2

Browser-based weight data collection and review tool for Part / Node / Rack / Package measurements.
V2 is a redesign of [Weight Data Manager](https://github.com/ayay2270/Weight-Data-Manager) with a project-first,
calmer "Organic" interface. It keeps the original data model, storage, validation, review rules and Excel workflows.

**Live app:** https://ayay2270.github.io/Weight-Data-Manager-V2/

## What changed from V1

| Area | V1 | V2 |
|---|---|---|
| Home | Dashboard | Project gallery: verification ring, level counts, attention strip (pending / recheck / drafts) |
| Weight Data | One paged table with dropdown filters | **All records**: faceted sidebar (Status, Project, Level, Build / Phase, Source, Measured By) with counts, project accordions with status distribution, saved views, Fields, sort, resizable Description |
| Project filter | Dropdown of every project | Search, pinned, selected and recent projects only, plus "View all projects". Stays short with 100+ projects |
| Add Record | Modal | **Measurement session**: set project, phase, level, source, measured by and date once, then enter items quickly with a running session log (Submit & Add Next keeps the context) |
| Review | Modal per row | **Review session**: one record at a time, with the same PN in other projects, the previous measurement and the weight distribution for context. Verify / Need Recheck / Reject / Skip, with keyboard shortcuts |
| Project detail | Summary page | Workspace: records grouped by level, review queue, project details |

Unchanged: Edit / Update Measurement / Duplicate (record form), draft-only delete, the duplicate warning,
Excel import with the official template, Excel / CSV export (all / filtered / project / selected), JSON backup / restore and demo reset.

## Data and compatibility

- Records are stored in the browser's LocalStorage under the **same key and schema as V1** (`wdm.v1.appData`). No migration is needed, and V1's on-read normalisation (legacy statuses, `weightKg` → `weight_kg`) still applies.
- On GitHub Pages, V1 and V2 share the origin `ayay2270.github.io`, so **both apps see and edit the same records**.
- V2-only UI preferences (saved views, visible fields, pinned projects, open groups) use separate `wdm.v2.*` keys. V1 saved views are copied into V2 once; the V1 key is not modified.
- There is no backend. Data stays in the browser until exported or backed up.

## Local development

```bash
npm install
npm run dev        # http://127.0.0.1:43132/Weight-Data-Manager-V2/
npm run build
npm run preview    # http://127.0.0.1:43133/Weight-Data-Manager-V2/
npm test
npm run lint
```

## Deployment (GitHub Pages)

The site is served from the `gh-pages` branch. The build copies `index.html` to `404.html`, so direct links like `/records` load the app.

```bash
npm run build
npx --yes gh-pages -d dist -b gh-pages
```

## Stack

React 19 + TypeScript + Vite, React Router, SheetJS (`xlsx`), lucide-react. LocalStorage persistence, no server.
