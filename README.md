# Sceneform

Sceneform is an offline-first screenplay workspace with a responsive Thai interface. Its dashboard creates, renames and deletes projects, supports light and dark themes, and offers home-screen installation.

## Writing a screenplay

- Open a project from the dashboard. Set the INT./EXT. prefix, location and time directly in a scene heading. Locations and character names already in the script appear as suggestions. Scene numbers follow the order of the document.
- Press Enter to insert the next block. A character cue leads to dialogue, dialogue leads to action, and a parenthetical leads back to dialogue. Tab and Shift+Tab cycle the focused text block through the six types. Esc moves focus out of the line editor.
- On a phone or iPad, use the quick actions for block types and location, the character chips for casting dialogue, and the tools drawer for the scene outline.
- Open Speed Dialogue Mode to select characters and send dialogue, action or parentheticals. Returning to the script inserts the entries at the block where you started. Unsent text stays in the saved chat draft and is included on exit when complete.
- Use the format selector to view the same script in international, Thai or two-column visual/audio layouts. The dialogue-quote switch controls how the text appears. Thai mode enables quotes by default.

## Planning and analytics

- Open **วางแผนเรื่อง** from the editor or project card menu. Add and color planning cards on the Beat Board. Drag a card by its handle with a mouse, or long-press the handle on a touch screen to start dragging. The arrow buttons also move cards. Reordering linked cards moves the whole scene, including its dialogue and A/V fields, in the screenplay.
- Convert a planning card to a heading at its current position on the board. The card keeps its notes, color and assigned cast and gains a link to the scene in the editor.
- Add characters and locations to the project libraries. The names appear as autocomplete suggestions in the editor. In the scene outline, open a scene's reference panel to see the location and the characters named in its cues or assigned on its beat card. Reference images are stored in the current browser's IndexedDB.
- Click the page and runtime estimate in the editor to open analytics. The estimate uses about 55 formatted script lines per page and one minute per page. Analytics counts authored dialogue lines and segments Thai words with the browser's locale-aware word segmenter.

## Production checks

Requires Node.js 22 or later.

```sh
npm ci
npm run typecheck
npm run build
```

The production build places the static app in `out/`. Deploy the repository on Vercel with the included configuration. Serve the output over HTTPS to enable the service worker and PWA installation. Once the service worker finishes its initial installation, the dashboard, editor, planning tools and analytics work offline.

Projects and chat drafts live in IndexedDB on the current browser profile and origin. The first launch creates three sample projects. See [AGENTS.md](AGENTS.md) for the project architecture and Cloud workflow.
