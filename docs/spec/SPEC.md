# Topico — Software Specification

| | |
|---|---|
| Version | 0.1 (initial build) |
| Last updated | 2026-11-07 |
| Reference material | [`images/`](images/) (hand-drawn target views), [`Topico.drawio`](Topico.drawio) (source sketch) |

This document lists what Topico must do. Each requirement has a status, so the spec can be used to track progress. When behaviour changes, update the requirement, its status and the change log at the end.

**Status values**

- **Done (tested)**: implemented and covered by an automated test in `src/engine/engine.test.ts`.
- **Done**: implemented, but not covered by an automated test and not yet checked by hand in the browser.
- **Partial**: some of the requirement is implemented. The notes say what is missing.
- **Open**: not implemented.

---

## 1. Purpose

Topico draws the systems that produce and consume topics around a central brokering system. Users describe their systems, topics and who produces or consumes what. They get a readable diagram that can be cut down to any part of the landscape and exported for documentation.

## 2. Glossary

| Term | Meaning |
|---|---|
| **Centre / broker** | The central brokering system. There is exactly one, and it is drawn in the middle of the canvas. |
| **System** | An application that produces or consumes topics. |
| **Exe** | An executable or processing job (for example an ETL). It behaves like a system but is drawn as a small dark box with a loop glyph. |
| **Border / side** | One of the four borders of a box: West, North, East, South. |
| **Upstream system / exe** | A system or exe attached to another system, on that system's outer border in the same direction. It talks to its parent, not to the broker. |
| **Leaf** | A system with no upstream systems of its own. |
| **Topic** | A message stream. It is drawn as a tab on the border between a system and its parent. |
| **Interaction** | One system producing or consuming one topic. |
| **Bundle** | A named group of topics that belong together, for example "Reference data". |
| **Functional chain** | A named group of topics that make up one business flow, for example "Order flow". |
| **Focus / filter** | The current selection that limits what the diagram shows. |

## 3. Reference views

| Image | Shows |
|---|---|
| [ALL.png](images/ALL.png) | The full landscape, with systems on all four borders, upstream systems, and exes. |
| [CENTRE.png](images/CENTRE.png) | The view with no filter, or with the broker selected. |
| [SINGLE_SYS.png](images/SINGLE_SYS.png) | One system selected (North Sys 1). |
| [MULTI_SYS.png](images/MULTI_SYS.png) | Two systems selected (West Sys 11 and North Sys 1). |
| [TOPICS.png](images/TOPICS.png) | One topic selected (Topic 3). |

The built-in sample model (toolbar button **Sample**) recreates ALL.png.

---

## 4. Functional requirements

### 4.1 Modelling

| ID | Requirement | Status | Notes |
|---|---|---|---|
| MOD-01 | A system can be attached to any border of the broker: West, North, East or South. | Done (tested) | |
| MOD-02 | An exe can be attached to any border of the broker. | Done (tested) | |
| MOD-03 | A topic can be declared as produced or consumed by a system. | Done (tested) | |
| MOD-04 | A topic can be declared as produced or consumed by an exe. | Done (tested) | |
| MOD-05 | An upstream system can be attached to any system, on that system's border in the same direction. | Done (tested) | A nested node always inherits the border of its root ancestor. |
| MOD-06 | An upstream exe can be attached to any system, on that system's border in the same direction. | Done (tested) | |
| MOD-07 | Produce and consume are relative to the node's parent: the broker for systems attached to it, and the parent system for upstream nodes. | Done (tested) | **Design decision** (see §7). |
| MOD-08 | A node can both produce and consume the same topic. | Done | It is drawn as a single tab with role "both". |
| MOD-09 | Systems, topics, the broker and groups have free-form properties (key/value pairs) as well as their fixed fields. | Done | Fixed fields: name, description, owner (systems and topics); format (topics). |
| MOD-10 | The user can create, edit and delete systems, exes, topics, interactions, bundles and chains. | Done | Deleting a system re-attaches its upstream nodes to the deleted system's parent. |

### 4.2 Diagram rendering

| ID | Requirement | Status | Notes |
|---|---|---|---|
| REN-01 | The broker is drawn in the centre, and systems are drawn on its borders as in ALL.png. | Done (tested) | |
| REN-02 | Topic tabs straddle the border between a node and its parent. Tabs are horizontal on West/East and vertical on North/South. | Done | |
| REN-03 | Inside every container (the broker or a system), an arrow goes from each producer tab of a topic to each consumer tab of that topic. | Done (tested) | |
| REN-04 | A system relays topics between its parent and its upstream nodes: what it consumes it passes on to its children, and what its children produce it receives. | Done (tested) | |
| REN-05 | Exes are visually distinct from systems. | Done | |
| REN-06 | Hovering a topic highlights its arrows and dims all other arrows. | Done | |

### 4.3 Selection and focused views

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SEL-01 | **Single system**: show only that system's topics, the broker, and its related upstream leaves and exes (SINGLE_SYS.png). | Done (tested) | The view includes exes attached to the broker that share a topic with the system. |
| SEL-02 | **Several systems**: show only their topics and how they interact through the broker, plus their related upstream leaves and exes (MULTI_SYS.png). | Done (tested) | By default only topics shared by at least two of the selected systems are shown. A toolbar checkbox, *Shared topics only*, switches to all of their topics. If no topic is shared, all of their topics are shown. |
| SEL-03 | **One or more topics**: show only the systems that relay them, the broker, and the related upstream leaves and exes (TOPICS.png). | Done (tested) | Parent systems are always kept so that upstream leaves stay connected. |
| SEL-04 | **Clearing the filter or selecting the broker** shows everything (CENTRE.png). | Done (tested) | |
| SEL-05 | A selection can be made on the canvas or in a selector panel. | Done | Canvas: double-click to focus, Shift/Cmd/Ctrl+double-click to add. Left panel: checkboxes. Filter bar: removable chips and a "Show all" link. |
| SEL-06 | In a focused view, flows to or from systems outside the view are shown as dashed stub arrows. | Done (tested) | **Design decision**, based on the loose arrows in SINGLE_SYS.png. A toolbar checkbox, *Off-view flows*, turns them off. |

### 4.4 Hiding

| ID | Requirement | Status | Notes |
|---|---|---|---|
| HID-01 | The user can hide some systems or leaf systems. | Done (tested) | Hiding a system also hides its upstream subtree. |
| HID-02 | The user can hide some topics, together with their interactions. | Done (tested) | |
| HID-03 | The user can hide individual interactions. | Done (tested) | Done from the system pane (hide checkbox on each topic) or the topic pane (hide checkbox on each producer or consumer). |
| HID-04 | Hidden elements stay in the model and can be shown again. | Done | Left panel: ● is visible, ◌ is hidden. |

### 4.5 Grouping

| ID | Requirement | Status | Notes |
|---|---|---|---|
| GRP-01 | Topics can be grouped into bundles. | Done | A topic belongs to at most one bundle. |
| GRP-02 | Topics can be grouped into functional chains. | Done | A topic belongs to at most one chain, and can be in both a bundle and a chain. |
| GRP-03 | Group membership is visible on the diagram. | Done | Bundles are drawn as a coloured outline around adjacent tabs. Chains colour the tab fill and the arrows. A legend is shown on the canvas. |
| GRP-04 | The view can collapse each bundle or each chain into a single tab. | Done (tested) | Toolbar menu *Group topics*: individually, by bundle, or by functional chain. |
| GRP-05 | The user can focus the view on a whole group. | Done | Left panel checkbox on the group. |

### 4.6 Automatic layout

| ID | Requirement | Status | Notes |
|---|---|---|---|
| LAY-01 | Every selection, hiding or grouping action rearranges and resizes the diagram. | Done (tested) | The layout is recomputed from scratch on every change, and the canvas re-fits to the new size. |
| LAY-02 | Systems never overlap each other or the broker, and tabs never overlap each other. | Done (tested) | Checked in five views by `layoutView › produces no overlapping system boxes`. |
| LAY-03 | Space is used efficiently: each box is sized to its content, and focused views are smaller than the full view. | Done (tested) | |
| LAY-04 | Tabs are ordered to reduce crossing arrows. | Done | Two-pass barycentre heuristic. Tabs of the same bundle stay next to each other. |
| LAY-05 | Changes are animated so the user can follow what moved. | Done | CSS transitions. Animation of arrow paths depends on the browser supporting CSS `d` transitions. |
| LAY-06 | Labels are never hidden under tabs. | Done | Labels are placed in the part of the box that tabs do not cover, and long names wrap. |
| LAY-07 | The user can control the order of systems along a border. | **Open** | Systems are placed in the order they were created. |
| LAY-08 | Arrows avoid crossing boxes and labels. | **Open** | Arrows are curves between tab ends and can pass over the broker's label. |

### 4.7 Details pane

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DET-01 | Clicking a topic opens a vertical pane on the right of the canvas where its details can be viewed and edited. | Done | The pane also lists the topic's producers and consumers and can add or remove them. |
| DET-02 | Clicking a system opens the right pane, where its details can be viewed and edited. | Done | |
| DET-03 | The system pane has subsections for its produced topics and its consumed topics. Each topic's details can be viewed and edited there. | Done | Each topic is a collapsible card with the full set of topic fields. |
| DET-04 | Clicking the broker or a group opens its details. | Done | |
| DET-05 | A single click opens details without changing the view. | Done | **Design decision**: click opens details, double-click focuses the view. |

### 4.8 Export and persistence

| ID | Requirement | Status | Notes |
|---|---|---|---|
| EXP-01 | Any view can be exported as SVG. | Done | Exports exactly what is on screen, including the current filter. Checked by rendering sample views to PNG. |
| EXP-02 | Any view can be exported in a format draw.io can open. | Done | `.drawio` (mxGraph XML). The XML was checked to be well formed. **Not yet opened in draw.io.** Optional hand-drawn sketch style. |
| EXP-03 | The model is saved automatically. | Done | Browser localStorage. |
| EXP-04 | The model can be saved to and loaded from a file. | Done | JSON. Missing fields are filled with defaults on load. |
| EXP-05 | An existing `.drawio` file can be imported. | **Open** | Not requested. Listed only to track the idea. |

---

## 5. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-01 | Runs in a modern desktop browser with no server. | Done |
| NFR-02 | Layout runs fast enough to feel instant (under 50 ms) at the size of the sample, about 15 systems and 10 topics. | Done (not measured at larger scale) |
| NFR-03 | The view engine and layout engine are pure functions with no UI dependency, and are unit-tested. | Done |
| NFR-04 | The data model is a plain JSON document that can be edited by hand and put under version control. | Done |

## 6. User interface

```
┌──────────────────────────────── Toolbar ────────────────────────────────┐
│ New · Sample · Open · Save JSON │ Group topics · Shared only · Off-view │ Export SVG · draw.io │
├──────────────┬─────────────────────────────────────────┬────────────────┤
│ Explorer     │ Filter bar (chips / Show all)           │ Details pane   │
│  search      │                                         │  centre /      │
│  systems by  │            Canvas                       │  system /      │
│  border      │   (scroll = zoom, drag = pan)           │  topic /       │
│  topics      │                                         │  group         │
│  bundles     │ Legend                     Fit + −      │                │
│  chains      │                                         │                │
└──────────────┴─────────────────────────────────────────┴────────────────┘
```

## 7. Design decisions

The original request did not settle these points. They were decided during the initial build and should be confirmed or changed.

1. **Interaction direction is relative to the parent.** An upstream system's produce/consume refers to its parent system, not to the broker. In the sample, West Sys 2.1 produces Topic 4 into West Sys 2, and West Sys 2 produces it into the broker.
2. **Several systems selected: shared topics only by default** (SEL-02).
3. **Off-view flows are shown as dashed stubs** (SEL-06).
4. **Click opens details, double-click focuses the view** (DET-05).
5. **The exes shown with a single system** are the exes attached directly to the broker that share a topic with it, plus any exes in that system's own upstream subtree.
6. **The on-screen style is clean, not hand-drawn.** The hand-drawn style is only an option of the draw.io export.
7. **Technology:** Vite, React and TypeScript, with Zustand and Immer for state. Rendering is SVG from a custom layout engine.

## 8. Open questions

- Should users be able to fix the order of systems along a border, or drag systems to reorder them (LAY-07)?
- Is a separate "both directions" role needed in the editor, or are two interactions enough?
- Should topics carry more structured fields, such as schema, retention, partitions or SLA, instead of free-form properties?
- Is a shared, server-side model needed so that several people can edit the same diagram?

## 9. Change log

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1 | Initial build covering §4.1–4.8. Reference material moved to `docs/spec/`. |
