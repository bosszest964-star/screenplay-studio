# Screenplay Studio

## Cloud workflow

- Do not start or leave a development or production server running in a Cloud session. If browser verification is needed, use a short-lived preview process that shuts down automatically when verification ends.
- After each implementation milestone, run `npm run typecheck` and `npm run build`. Both must pass without errors. Keep the production build deployable on Vercel.
- Commit the npm lockfile with dependency changes. Keep browser runtime assets local so the installed app can work offline.

## Architecture

- Use Next.js App Router with TypeScript, Tailwind CSS, Zustand for client UI state, and Dexie.js over IndexedDB for project persistence. IndexedDB is the source of truth for projects. A production build exports the static app to `out/` and generates a versioned service worker that precaches the app shell and its assets.
- Store each screenplay as ordered JSON blocks with stable IDs. The supported kinds are Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, and Audio/Visual. Preserve visual and audio fields alongside text when present. Evolve the IndexedDB schema through versioned Dexie migrations.
- Render the same blocks as a Final Draft-style international screenplay, a Thai line-by-line screenplay with automatic dialogue quotation marks, or a two-column screenplay with visuals on the left and audio on the right. Switching formats changes presentation only. Keep the underlying blocks intact and add quotation marks at render time.
- On desktop, use left and right sidebars. On iPad and phones, in both orientations, use bottom navigation and a slide-over drawer. Maintain the Web App Manifest, install icons, and service worker for standalone home-screen installation and offline launch.
- Use locally bundled Sarabun for Thai text and Courier Prime for screenplay typography. For mixed-language script text, use Courier Prime with Sarabun as the Thai glyph fallback. Allow enough line height for Thai vowels and tone marks.

## Phase 1

The dashboard handles local project creation, rename and deletion, appearance, and PWA installation.

## Phase 2

- Open projects at `/editor/?project=<id>`. Use the static editor route and resolve the project in IndexedDB on the client. The service worker precaches both the dashboard and editor so navigation works offline.
- Store structured scene fields alongside their canonical text. Derive scene numbers and autocomplete suggestions from the current block order and contents. Persist the format and quote preference with the project.
- Save edits and Speed Dialogue drafts in IndexedDB as the user types. Serialize writes with an editor revision to detect concurrent edits. Convert Speed Dialogue entries and clear the draft in the same write when returning to the script.
- Position the mobile quick actions and chat composer from Visual Viewport geometry. Keep typing focus when a touch action changes or inserts a block.

## Phase 3

- Serve the Beat Board, character and location libraries, and analytics from the precached `/production/` route. Resolve projects by ID in IndexedDB and observe changes with Dexie live queries.
- Link beat cards to stable scene-heading IDs. Split the screenplay at heading boundaries and move whole scenes in a transaction that updates the board order, blocks and editor revision together. Keep any opening blocks before the first heading in place.
- Store profile metadata with the project and reference image blobs in the Dexie v2 `referenceImages` store. Write and delete image references transactionally. Resolve scene cues and locations by normalized names and retain prior names as aliases when renaming a profile.
- Derive timer and analytics values from the screenplay blocks. Estimate one minute per 55 formatted lines rounded to a page. Use Thai-aware word segmentation and keep the estimates independent of the selected paper view.

## Phase 4

- Keep the offline Next.js static export and use the standalone Vercel function at `/api/google` for authorization code flow with PKCE and encrypted HttpOnly sessions. Request only `drive.file` and `documents`. Cloud configuration is optional.
- Keep project and reference data authoritative in IndexedDB. Store per-account sync bookmarks in Dexie v3. Use immutable Drive snapshots with parent references to detect divergent edits and keep both versions. Upload reference images before publishing a snapshot.
- Run the same reconciliation from the visible app and from the service worker when Background Sync is available. Only cache the static shell and local fonts. Keep OAuth and Google API responses out of the service worker cache.
- Build PDF, print preview, and one-way Google Docs export from the same screenplay representation. Bundle Thai-capable Sarabun font files and their licenses for offline PDF export.
