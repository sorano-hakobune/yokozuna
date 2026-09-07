# Yokozuna

**A lightweight, cross-platform 2D timeline animation editor inspired by Flash / Adobe Animate**

Yokozuna is a modern authoring tool for creating timeline-based 2D animations, comfortable to use both in the browser and as a desktop app.  
It draws inspiration from the workflow of Adobe Animate (formerly Flash Professional), reimagined with a contemporary UI and architecture.

- **Runtime**: Tauri 2 (lightweight, fast, easy to distribute)
- **Frontend**: React + TypeScript + Vite
- **Canvas**: SVG-based stage (precise transforms and export)
- **State**: Zustand
- **Project format**: `.yoko` (JSON-based)

[日本語](README.md)

---

## Features

### Animation Core

- **Keyframe model** — Multiple properties per keyframe (Flash-style)
- **Motion tween** — Position, scale, rotation, and opacity interpolation with easing
- **Shape tween** — Contour-resample morphing between shapes
- **Custom easing** — 30+ Penner curves + arbitrary cubic Bézier
- **Motion path** — Follow a path with optional orientation
- **Onion skin** — Ghost frames before and after the playhead
- **Frame labels** — Named markers on the timeline

### Drawing & Editing

- Rectangle / ellipse / line / path / text
- Bézier path editing (handles, smooth / straighten)
- Path vertex insert / delete / move
- Paint bucket + eyedropper
- Gradient fills (linear / radial)
- Free pivot (transform origin)
- Multi-select + group transform
- Align & distribute tools

### Layers & Symbols

- Normal / guide / mask layers
- Layer folders (nested, collapsible)
- Symbol create / place / edit mode (F8 / double-click)
- Layer lock / visibility / reorder

### Assets & Audio

- SVG / image import (vector-preferred or bitmap)
- Audio tracks (MP3 / WAV, etc.) on the timeline
- Library management (sort, grid, duplicate, usage)

### Export

- PNG sequence (transparent) + ZIP package
- WebM video (with audio mix)
- Project save (`.yoko` / legacy `.json`)

### UX

- Japanese UI (menus, inspector, playback controls)
- Undo / redo (snapshot history)
- Autosave + recent files
- Grid / snap / guides
- Extensive shortcuts (Flash-inspired)

---

## Development Setup

### Requirements

- Node.js 20+
- pnpm (recommended) or npm / yarn
- Rust (for Tauri 2)
- Supported OS: Windows / macOS / Linux

### Install

```bash
# Clone the repository
git clone https://github.com/sorano-hakobune/yokozuna.git
cd yokozuna

# Install dependencies
pnpm install

# Start web dev server
pnpm dev

# Launch as Tauri desktop app
pnpm tauri dev
```

### Build

```bash
# Web build
pnpm build

# Desktop distribution build
pnpm tauri build
```

---

## Project Structure (Overview)

```text
src/
├── types/               # Project / Layer / Keyframe / Symbol types
├── lib/
│   ├── project/         # createEmptyProject, generateId, fileIo, etc.
│   ├── easing.ts        # Easing functions
│   ├── transformGeometry.ts
│   └── ...
├── stores/
│   └── projectStore.ts  # Zustand main store + selectors
├── components/
│   ├── Editor/          # Main editor shell
│   ├── Stage/           # Canvas, transform handles, drawing tools
│   ├── Timeline/        # Timeline UI
│   ├── Inspector/       # Right dock (Color / Library / Properties)
│   ├── MenuBar/
│   ├── ToolsPanel/
│   └── Playback/
└── hooks/               # Playback sync, autosave, etc.
```

---

## Project Data Model (Excerpt)

```ts
interface Project {
  version: string;
  meta: { name: string; createdAt: string; updatedAt: string };
  settings: ProjectSettings;
  compositions: Composition[];
  symbols: Symbol[];
  assets: Asset[];
  activeCompositionId: string;
}

interface Keyframe {
  id: string;
  frame: number;
  elements: Element[]; // Objects on this keyframe
  tween?: TweenType; // motion | shape | none
  easing?: EasingType;
  easingBezier?: [number, number, number, number];
  motionPath?: PathPoint[];
}
```

See `src/types/project.ts` for full definitions.

---

## Keyboard Shortcuts (Selection)

| Key                             | Action                    |
| ------------------------------- | ------------------------- |
| `Space` / `Enter`               | Play / Stop               |
| `Shift + L`                     | Toggle loop               |
| `O`                             | Onion skin                |
| `F5`                            | Insert frames             |
| `F6`                            | Insert keyframe           |
| `F8`                            | Convert to symbol         |
| `Ctrl + Z` / `Ctrl + Shift + Z` | Undo / Redo               |
| `Ctrl + C / X / V`              | Copy / Cut / Paste        |
| `G`                             | Toggle grid               |
| `T`                             | Text tool                 |
| `K` / `I`                       | Paint bucket / Eyedropper |

---

## Roadmap

- [ ] Bone / skinning
- [ ] Particles
- [ ] Script panel (lightweight ActionScript-compatible or JS)
- [ ] Cloud sync / collaboration
- [ ] Plugin system
- [ ] Stronger i18n support

---

## Contributing

Issues and pull requests are welcome.  
For larger changes, please open an issue first to discuss the approach.

---

## License

[GPL-3.0](LICENSE)

---

## Acknowledgments

- The long-standing design philosophy of Adobe Animate / Flash Professional
- Open-source projects including Tauri, React, Zustand, and Vite

---

**Yokozuna** — Give everything on the dohyō.
