# Topico

Diagram topic producers and consumers around a central brokering system.

Requirements, their status and the design decisions are tracked in [docs/spec/SPEC.md](docs/spec/SPEC.md). The reference sketches are in [docs/spec/images](docs/spec/images).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (filtering, grouping, layout overlap)
npm run build
```

## Model

| Element | Notes |
|---|---|
| **Centre** | The broker. Always drawn in the middle. |
| **System** / **Exe** | Attached to a centre border (West, North, East, South), or *upstream* of another system, in which case it sits on that system's outer border in the same direction. |
| **Topic** | Drawn as a tab on the border between a system and its parent. |
| **Interaction** | A system *produces* or *consumes* a topic. The direction is always relative to the system's parent (the broker, or the upstream system it hangs off). |
| **Bundle** | A named group of whole topics. It is drawn as an outline around adjacent tabs. |
| **Functional chain** | A named group of individual endpoints (this system producing or consuming this topic). The same topic can be in a chain at one system and outside it at another. The chain colours its endpoint tabs, and colours the arrows that link two of its endpoints. |

Arrows are derived automatically. Inside each container (the broker or a system), every producer of a topic points to every consumer of that topic. A system relays a topic to its upstream systems: what it consumes from the broker it passes to its children, and the reverse.

The model is saved automatically in the browser (localStorage). Use **Save JSON** and **Open…** to keep files.

## Using the views

- **Click** a system, topic or the broker to edit it in the right pane. The system pane lists its produced and consumed topics, each with editable details.
- **Double-click** a system or topic to focus the view on it. **Shift+double-click** adds more. You can also use the checkboxes in the left panel.
  - One system: its topics, its upstream leaves and the executables on the broker it exchanges with.
  - Several systems: only the topics they exchange (turn off *Shared topics only* to see all of their topics).
  - Topics: only the systems that produce or consume them.
  - The broker, or **Show all**: everything.
- Dashed arrows (*Off-view flows*) show that a topic also flows to or from systems outside the current focus.
- In the left panel:
  - Drag a system by its ⋮⋮ handle. Drop it above or below another row to reorder, on a border heading to move it to that border, or on the middle of a row to make it upstream of that system. The canvas follows the order in the left panel.
  - Topics: drag topics to reorder them. The sort button in the section header shows ↑ (A–Z), ↓ (Z–A) or ↕ (custom order). Click it to sort A–Z, or Z–A when the list is already A–Z.
  - Double-click any item to rename it.
  - Right-click any item for Rename, Duplicate and Delete.
- ● / ◌ hides or shows a system (with its upstream systems) or a topic. Single interactions can be hidden from the system or topic pane.
- **Group topics** collapses topics into one tab per bundle or per functional chain.
- The layout is recomputed on every change. It sizes boxes to their content, reorders tabs to reduce crossings and keeps bundle members together, and it never lets boxes overlap.

## Export

- **SVG**: the current view, as a standalone file.
- **draw.io**: an mxGraph `.drawio` file of the current view, which opens in diagrams.net or the draw.io desktop app. Tick *sketch style* to get the hand-drawn look.

## Code map

- `src/model`: types, sample data (based on `docs/spec/images/ALL.png`) and the Zustand store.
- `src/engine/view.ts`: hiding, filtering, grouping, logical arrows and off-view stubs.
- `src/engine/layout.ts`: geometry. It places nodes recursively per border and reorders tabs with a barycentre pass.
- `src/export`: SVG and draw.io exporters.
- `src/components`: toolbar, explorer (left), canvas, details pane (right).
