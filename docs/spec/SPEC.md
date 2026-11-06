# Topico — Software Specification

| | |
|---|---|
| Version | 0.9 |
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
| **ETL** | A processing job for **E**xtraction, **T**ransformation and **L**oading of topics: it reads topics, transforms them and publishes topics. It behaves like a system but is drawn as a small dark box with a loop glyph. |
| **Border / side** | One of the four borders of a box: West, North, East, South. |
| **Upstream system / ETL** | A system or ETL attached to another system, on that system's outer border in the same direction. It talks to its parent, not to the broker. |
| **Leaf** | A system with no upstream systems of its own. |
| **Topic** | A message stream. It is drawn as a tab on the border between a system and its parent. |
| **Interaction** | One system producing or consuming one topic. |
| **Endpoint** | One system or ETL producing or consuming one topic. Same as an interaction. |
| **Bundle** | A named group of **whole topics** that belong together, for example "Reference data". Every endpoint of a bundled topic is in the bundle. |
| **Chain** (topic chain) | A named group of **individual endpoints** that make up one business flow, for example "Order flow". A topic can be in a chain at some systems and outside it at others, and an endpoint can be in several chains. |
| **Focus / filter** | The current selection that limits what the diagram shows. |

## 3. Reference views

| Image | Shows |
|---|---|
| [ALL.png](images/ALL.png) | The full landscape, with systems on all four borders, upstream systems, and ETLs. |
| [CENTRE.png](images/CENTRE.png) | The view with no filter, or with the broker selected. |
| [SINGLE_SYS.png](images/SINGLE_SYS.png) | One system selected (North Sys 1). |
| [MULTI_SYS.png](images/MULTI_SYS.png) | Two systems selected (West Sys 11 and North Sys 1). |
| [TOPICS.png](images/TOPICS.png) | One topic selected (Topic 3). |
| [CHAIN.png](images/CHAIN.png) | Chain view: one chain drawn around the broker as a horizontal tube. |

The built-in sample model (toolbar button **Sample**) recreates ALL.png.

---

## 4. Functional requirements

### 4.1 Modelling

| ID | Requirement | Status | Notes |
|---|---|---|---|
| MOD-01 | A system can be attached to any border of the broker: West, North, East or South. | Done (tested) | |
| MOD-02 | An ETL can be attached to any border of the broker. | Done (tested) | |
| MOD-03 | A topic can be declared as produced or consumed by a system. | Done (tested) | |
| MOD-04 | A topic can be declared as produced or consumed by an ETL. | Done (tested) | |
| MOD-05 | An upstream system can be attached to any system, on that system's border in the same direction. | Done (tested) | A nested node always inherits the border of its root ancestor. |
| MOD-06 | An upstream ETL can be attached to any system, on that system's border in the same direction. | Done (tested) | |
| MOD-07 | Produce and consume are relative to the node's parent: the broker for systems attached to it, and the parent system for upstream nodes. | Done (tested) | **Design decision** (see §7). |
| MOD-08 | A node can both produce and consume the same topic. | Done | It is drawn as a single tab with role "both". |
| MOD-09 | Systems, topics, the broker and groups have free-form properties (key/value pairs) as well as their fixed fields. | Done | Fixed fields: name, description, owner (systems and topics); format (topics). |
| MOD-10 | The user can create, edit and delete systems, ETLs, topics, interactions, bundles and chains. | Done | Deleting a system re-attaches its upstream nodes to the deleted system's parent. |

### 4.2 Diagram rendering

| ID | Requirement | Status | Notes |
|---|---|---|---|
| REN-01 | The broker is drawn in the centre, and systems are drawn on its borders as in ALL.png. | Done (tested) | |
| REN-02 | Topic tabs straddle the border between a node and its parent. Tabs are horizontal on West/East and vertical on North/South. | Done | |
| REN-03 | Inside every container (the broker or a system), an arrow goes from each producer tab of a topic to each consumer tab of that topic. | Done (tested) | |
| REN-04 | A system relays topics between its parent and its upstream nodes: what it consumes it passes on to its children, and what its children produce it receives. | Done (tested) | |
| REN-05 | ETLs are visually distinct from systems. | Done | |
| REN-06 | Hovering a topic highlights its arrows and dims all other arrows. | Done | |

### 4.3 Selection and focused views

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SEL-01 | **Single system**: show only that system's topics, the broker, and its related upstream leaves and ETLs (SINGLE_SYS.png). | Done (tested) | The view includes ETLs attached to the broker that share a topic with the system. |
| SEL-02 | **Several systems**: show only their topics and how they interact through the broker, plus their related upstream leaves and ETLs (MULTI_SYS.png). | Done (tested) | By default only topics shared by at least two of the selected systems are shown. A toolbar checkbox, *Shared topics only*, switches to all of their topics. If no topic is shared, all of their topics are shown. |
| SEL-03 | **One or more topics**: show only the systems that relay them, the broker, and the related upstream leaves and ETLs (TOPICS.png). | Done (tested) | Parent systems are always kept so that upstream leaves stay connected. |
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
| GRP-01 | A bundle groups a complete set of topics. Membership belongs to the topic, so it applies to every system that produces or consumes the topic. | Done | A topic belongs to at most one bundle. |
| GRP-02 | A chain groups individual endpoints: for each system producing or consuming a topic, the user chooses whether that endpoint is in the chain. This is what makes a chain different from a bundle. | Done (tested) | |
| GRP-02a | An endpoint can be part of more than one chain. | Done (tested) | An endpoint can be in a chain while its topic is also in a bundle. |
| GRP-03 | Chain membership can be edited from the system pane, the topic pane, and the chain's own pane. | Done | System and topic panes: on each endpoint, the chains it is in are shown as removable chips, with a "+" picker to add more. Chain pane: endpoints listed by topic, with checkboxes and an "also in …" note. Checked in Chrome. |
| GRP-04 | Group membership is visible on the diagram. | Done | Bundles are drawn as a coloured outline around adjacent tabs. A chain colours the tabs of its endpoints, and colours an arrow only for the chains that both of its ends share, so each chain's path is visible. An endpoint in several chains has a tab striped in each chain's colour. An arrow shared by several chains alternates dashes in each colour. The draw.io export uses the first chain's colour for arrows. A legend is shown on the canvas. |
| GRP-05 | The view can collapse each bundle, or each chain, into a single tab per system. | Done (tested) | Toolbar menu *Group topics*. Collapsing by chain merges only the chain's endpoints. An endpoint in several chains appears in each of its chain tabs, and arrows link the tabs of the chains both ends share. Flows that leave the chain stay connected to the plain topic tabs. |
| GRP-06 | The user can focus the view on a whole group. | Done (tested) | Left panel checkbox on the group, or "Focus view" in the group pane. Focusing a bundle shows every endpoint of its topics. Focusing a chain shows only the chain's endpoints, with dashed stubs for the topics' other flows. |
| GRP-08 | A **View** button on each chain in the left panel switches the canvas to a chain view, and switches back when clicked again (CHAIN.png). | Done | The filter bar shows "Chain view: <name>" with a way back. Deleting the chain closes the view. |
| GRP-09 | In the chain view, the broker is drawn as a horizontal tube, and each topic of the chain is a bar inside it. Only the chain's endpoints are shown. | Done (tested) | Bars span from the leftmost to the rightmost system they connect, reaching the tube's end for West/East systems. Overlapping bars are packed into separate lanes. Hidden systems, topics and interactions are left out. |
| GRP-10 | In the chain view, systems sit around the tube on their border: North above, South below, West left, East right. Arrows go from producers into the bar and from the bar to consumers. | Done (tested) | Upstream systems and ETLs stack outside their parent, with a relay arrow labelled with the topic. West/East systems are ordered by the bars they connect to, so their arrows do not cross. Clicking a system or bar opens its details, and hovering a bar highlights its arrows. |
| GRP-11 | The chain view can be exported as SVG and draw.io. | Done | The broker tube is draw.io's horizontal cylinder ("Direct data") shape. The draw.io output was checked to be well formed but not yet opened in draw.io. |
| GRP-07 | Files saved by earlier versions still load. | Done (tested) | A chain stored on a topic (v0.1) is copied to every endpoint of that topic. A single chain stored on an endpoint (v0.2–0.5) becomes a one-item chain list. |

### 4.6 Automatic layout

| ID | Requirement | Status | Notes |
|---|---|---|---|
| LAY-01 | Every selection, hiding or grouping action rearranges and resizes the diagram. | Done (tested) | The layout is recomputed from scratch on every change, and the canvas re-fits to the new size. |
| LAY-02 | Systems never overlap each other or the broker, and tabs never overlap each other. | Done (tested) | Checked in five views by `layoutView › produces no overlapping system boxes`. |
| LAY-03 | Space is used efficiently: each box is sized to its content, and focused views are smaller than the full view. | Done (tested) | |
| LAY-04 | Tabs are ordered to reduce crossing arrows. | Done | Two-pass barycentre heuristic. Tabs of the same bundle stay next to each other. |
| LAY-05 | Changes are animated so the user can follow what moved. | Done | CSS transitions. Animation of arrow paths depends on the browser supporting CSS `d` transitions. |
| LAY-06 | Labels are never hidden under tabs. | Done | Labels are placed in the part of the box that tabs do not cover, and long names wrap. |
| LAY-07 | The user can control the order of systems along a border. | Done (tested) | By drag and drop in the left panel (EXL-01). The order in the left panel is the order on the canvas. |
| LAY-08 | Arrows avoid crossing boxes and labels. | **Open** | Arrows are curves between tab ends and can pass over the broker's label. |

### 4.7 Left panel (explorer)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| EXL-01 | In the Systems section, the user can drag a system to change its order within its parent section. The canvas reorders the systems on that border to match. | Done (tested) | Drop on the top or bottom edge of a row to place the system before or after it. Checked in Chrome. |
| EXL-02 | The user can drag a system to another border. Its upstream systems move with it, and the canvas updates. | Done (tested) | Drop on a border heading (West, North, East, South) to add it at the end of that border. All four headings are always shown, even when empty, so they can be dropped on. Dropping next to a system on another border also moves it there. |
| EXL-03 | The user can drag a system onto another system to make it upstream of that system. | Done (tested) | Drop on the middle of a row. Not in the original request, but it uses the same gesture. A system cannot be dropped onto itself or its own upstream systems. |
| EXL-04 | Right-clicking any item in the left panel opens a menu with Delete and Duplicate. | Done | Applies to systems, ETLs, topics, bundles and chains. The menu also offers Rename. For the broker, Duplicate and Delete are disabled. Delete asks for confirmation. Checked in Chrome. |
| EXL-05 | Double-clicking any item in the left panel lets the user rename it in place. | Done | Enter or clicking away saves, Escape cancels. Also works for the broker. Checked in Chrome. |
| EXL-06 | Duplicates are placed directly after the original. | Done (tested) | What is copied is described in §7, decision 10. |
| EXL-07 | The user can rearrange topics in the Topics section by drag and drop. | Done (tested) | Drop on the top or bottom half of a row. There is no separate "manual" mode: the list always shows the user's order. Checked in Chrome. |
| EXL-08 | One button in the Topics header sorts the list A–Z or Z–A and shows the current order. | Done (tested) | The button shows ↑ (A–Z), ↓ (Z–A) or ↕ (custom order, for example after a drag). Clicking sorts A–Z, or Z–A when the list is already A–Z. Sorting uses natural, case-insensitive order, so TOPIC 2 comes before TOPIC 10. The sorted result becomes the order the user can then drag. Checked in Chrome. |

### 4.8 Details pane

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DET-01 | Clicking a topic opens a vertical pane on the right of the canvas where its details can be viewed and edited. | Done | The pane also lists the topic's producers and consumers and can add or remove them. |
| DET-02 | Clicking a system opens the right pane, where its details can be viewed and edited. | Done | |
| DET-03 | The system pane has subsections for its produced topics and its consumed topics. Each topic's details can be viewed and edited there. | Done | Each topic is a collapsible card with the full set of topic fields. |
| DET-04 | Clicking the broker or a group opens its details. | Done | |
| DET-05 | A single click opens details without changing the view. | Done | **Design decision**: click opens details, double-click focuses the view. |

### 4.9 Export and persistence

| ID | Requirement | Status | Notes |
|---|---|---|---|
| EXP-01 | Any view can be exported as SVG. | Done | Exports exactly what is on screen, including the current filter. Checked by rendering sample views to PNG. |
| EXP-02 | Any view can be exported in a format draw.io can open. | Done | `.drawio` (mxGraph XML). The XML was checked to be well formed. **Not yet opened in draw.io.** Optional hand-drawn sketch style. |
| EXP-03 | The model is saved automatically. | Done | Browser localStorage. |
| EXP-04 | The model can be saved to and loaded from a file. | Done | JSON. Missing fields are filled with defaults on load. |
| EXP-05 | An existing `.drawio` file can be imported. | **Open** | Not requested. Listed only to track the idea. |

---

## 5. Non-functional requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| NFR-01 | Runs in a modern desktop browser with no server. | Done | |
| NFR-02 | Layout runs fast enough to feel instant (under 50 ms) at the size of the sample, about 15 systems and 10 topics. | Done (not measured at larger scale) | |
| NFR-03 | The view engine and layout engine are pure functions with no UI dependency, and are unit-tested. | Done | |
| NFR-04 | The data model is a plain JSON document that can be edited by hand and put under version control. | Done | |
| NFR-05 | Can be hosted as a static site on GitLab Pages, built and published by CI from the default branch. | Done (tested) | The pipeline was run locally with `gitlab-ci-local` in a `node:22` Linux container, and both jobs passed. Not yet run on a real GitLab instance. |
| NFR-06 | Can be hosted as a static site on GitHub Pages, built and published by GitHub Actions from the default branch. | Done (partly tested) | The `test` job was run locally with `act` (Ubuntu container) and passed. The build commands are the same ones checked in the GitLab run. The `configure-pages` and `deploy` steps need GitHub itself and have not been run. |

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
5. **The ETLs shown with a single system** are the ETLs attached directly to the broker that share a topic with it, plus any ETLs in that system's own upstream subtree.
6. **The on-screen style is clean, not hand-drawn.** The hand-drawn style is only an option of the draw.io export.
7. **Technology:** Vite, React and TypeScript, with Zustand and Immer for state. Rendering is SVG from a custom layout engine.
8. **An endpoint can belong to several chains** (changed in v0.6). A topic still belongs to at most one bundle.
9. **A group's type cannot be changed after creation.** Bundle members are topics and chain members are endpoints, so membership cannot be carried over from one type to the other.
10. **What Duplicate copies:**
    - **System or ETL:** its fields and its produced and consumed topics, including their chain membership. Its upstream systems are not copied.
    - **Topic:** its fields, its bundle, and its producers and consumers. The copied endpoints are not put in any chain.
    - **Chain:** its name, colour, description and endpoints, because an endpoint can be in several chains.
    - **Bundle:** its name, colour and description only. It has no members, because a topic is in at most one bundle.
11. **The order of systems is the order of the model's system list.** Dragging a system in the left panel changes that order, and the canvas follows it.
12. **The topic order only affects lists, not the canvas.** On the canvas, tabs are still ordered to reduce crossing arrows (LAY-04). The order is saved in the model file. The sort indicator is worked out from the list itself and is not stored, so it always matches what is shown. Sorting is a one-off action: new or renamed topics are not re-sorted automatically.
13. **Terminology:** groups of endpoints are called **chains** (topic chains), not "functional chains". Processing jobs are called **ETLs**, not "exe" or "executable". Files that use the old `exe` kind are converted to `etl` when loaded.
14. **In the chain view, West/East systems are ordered for readability**, by the bars they connect to, rather than in the left-panel order. North/South systems keep the left-panel order. The chain view is not a filtered diagram: the focus, grouping and off-view-flow settings do not apply to it.

## 8. Open questions

- Is a separate "both directions" role needed in the editor, or are two interactions enough?
- Should topics carry more structured fields, such as schema, retention, partitions or SLA, instead of free-form properties?
- Is a shared, server-side model needed so that several people can edit the same diagram?
- Should a chain record the order of its steps, for example to number the arrows along the flow?

## 9. Change log

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1 | Initial build covering §4.1–4.6 and §4.8–4.9. Reference material moved to `docs/spec/`. |
| 2026-11-07 | 0.9 | Chain view: broker-tube layout for one chain, toggled from the left panel, with SVG and draw.io export (GRP-08 to GRP-11). Terminology: "functional chain" becomes "chain", and "exe/executable" becomes "ETL" (decision 13). |
| 2026-11-07 | 0.8 | GitHub Pages: Actions workflow (`.github/workflows/pages.yml`) (NFR-06). |
| 2026-11-07 | 0.7 | GitLab Pages: CI pipeline (`.gitlab-ci.yml`) and relative asset paths (NFR-05). |
| 2026-11-07 | 0.6 | An endpoint can be part of several chains (GRP-02a). Multi-chain pickers, striped tabs, multi-colour arrows, and collapse-by-chain showing a shared endpoint in each chain tab. Duplicating a chain now copies its endpoints. The sample model gains a "Settlement" chain. |
| 2026-11-07 | 0.5 | Topics section: the A–Z/Manual switch is replaced by drag and drop plus one A–Z/Z–A sort button (EXL-07, EXL-08). Removed EXL-09: details pane lists follow the topic order without needing a separate rule. |
| 2026-11-07 | 0.4 | Topics section: A–Z or Manual order, with drag-and-drop reordering (EXL-07 to EXL-09). |
| 2026-11-07 | 0.3 | Left panel: drag and drop systems to reorder them, move them to another border or make them upstream (EXL-01 to EXL-03, LAY-07 done). Right-click menu with Rename, Duplicate and Delete (EXL-04). Double-click to rename (EXL-05). |
| 2026-11-07 | 0.2 | Chains now group individual endpoints instead of whole topics (GRP-02 to GRP-07). Arrows are computed per endpoint, so collapsed chain tabs connect to plain topic tabs. |
