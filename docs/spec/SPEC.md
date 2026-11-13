# Topico — Software Specification

| | |
|---|---|
| Version | 0.25 |
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
| **System of System (SoS) view** | A view of the landscape as a central "System of System" box holding the **inner** systems, with the **outer** systems arranged around it like the petals of a flower. |
| **SoS role** | Per system: **Inner** (inside the SoS box), **Outer** (around it) or **Not shown**. The broker is Inner by default. |
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
| [SOS.png](images/SOS.png) | System of System view: inner systems in a central box, outer systems around it with note callouts. |

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
| REN-08 | The canvas dock (*Topic names*) chooses how a topic name longer than its box is shown: rolling text, the full name in a smaller font, or wider boxes that fit the name. | Done (tested) | Default: rolling. Applies to the diagram tabs and the chain tube bars, and is remembered between sessions. Wider boxes give all the tabs of a system the length of its longest name, and systems and the broker grow to make room. In small font, names reduce down to 4 px at the smallest, and short names keep the normal size. SVG exports follow the choice. draw.io has no rolling text, so its exports show the full name at a size that fits. Checked in Chrome with real text widths. |

### 4.3 Selection and focused views

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SEL-01 | **Single system**: show only that system's topics, the broker, and its related upstream leaves and ETLs (SINGLE_SYS.png). | Done (tested) | The view includes ETLs attached to the broker that share a topic with the system. |
| SEL-02 | **Several systems**: show only their topics and how they interact through the broker, plus their related upstream leaves and ETLs (MULTI_SYS.png). | Done (tested) | By default only topics shared by at least two of the selected systems are shown. *Shared only*, under *Settings* in the canvas dock, switches to all of their topics. If no topic is shared, all of their topics are shown. |
| SEL-03 | **One or more topics**: show only the systems that relay them, the broker, and the related upstream leaves and ETLs (TOPICS.png). | Done (tested) | Parent systems are always kept so that upstream leaves stay connected. |
| SEL-04 | **Clearing the filter or selecting the broker** shows everything (CENTRE.png). | Done (tested) | |
| SEL-05 | A selection can be made on the canvas or in a selector panel. | Done | Canvas: double-click to focus, Shift/Cmd/Ctrl+double-click to add. Left panel: checkboxes. Filter bar: removable chips and a "Show all" link. |
| SEL-06 | In a focused view, flows to or from systems outside the view are shown as dashed stub arrows. | Done (tested) | **Design decision**, based on the loose arrows in SINGLE_SYS.png. *Off-view flows*, under *Settings* in the canvas dock, turns them off. |

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
| GRP-05 | The view can collapse each bundle, or each chain, into a single tab per system. | Done (tested) | Canvas dock menu *Group topics*. Collapsing by chain merges only the chain's endpoints. An endpoint in several chains appears in each of its chain tabs, and arrows link the tabs of the chains both ends share. Flows that leave the chain stay connected to the plain topic tabs. |
| GRP-06 | The user can focus the view on a whole group. | Done (tested) | Left panel checkbox on the group, or "Focus view" in the group pane. Focusing a bundle shows every endpoint of its topics. Focusing a chain shows only the chain's endpoints, with dashed stubs for the topics' other flows. |
| GRP-08 | A **View** button on each chain in the left panel switches the canvas to a chain view, and switches back when clicked again (CHAIN.png). | Done | The filter bar shows "Chain view: <name>" with a "Back to Topics" link. Deleting the chain closes the view. |
| GRP-09 | In the chain view, the broker is drawn as a horizontal tube, and each topic of the chain is a bar inside it. Only the chain's endpoints are shown. | Done (tested) | Bars span from the leftmost to the rightmost system they connect, reaching the tube's end for West/East systems. Overlapping bars are packed into separate lanes. Hidden systems, topics and interactions are left out. |
| GRP-10 | In the chain view, systems sit around the tube on their border: North above, South below, West left, East right. Arrows go from producers into the bar and from the bar to consumers. | Done (tested) | Upstream systems and ETLs stack outside their parent, with a relay arrow labelled with the topic. West/East systems are ordered by the bars they connect to, so their arrows do not cross. Clicking a system or bar opens its details, and hovering a bar highlights its arrows. |
| GRP-11 | The chain view can be exported as SVG and draw.io. | Done | The broker tube is draw.io's horizontal cylinder ("Direct data") shape. The draw.io output was checked to be well formed but not yet opened in draw.io. |
| GRP-12 | The colouring of a bundle or chain can be hidden or shown, like topics and systems, from the left panel or the legend. | Done (tested) | ●/◌ on the group's row in the left panel, a click on the group in the canvas legend, or "Hide colouring" in the group pane. A hidden bundle loses its outline. A hidden chain's tabs and arrows go back to the default colour, also in the chain view and the exports. Topics, endpoints and flows stay, and grouping (collapse) still works. Hidden groups are struck through in the legend. |
| GRP-16 | The canvas legend can be hidden and shown again. It lists only chains: bundles are shown by their outline and toggled from the left panel. | Done | × in the legend's header hides it and leaves a small "Legend" button in its place. Remembered between sessions. Checked in Chrome. |
| GRP-13 | A chain has a numbered **sequence**: each step holds one or more of the chain's links, and a link can appear in several steps. | Done (tested) | A **link** is one hop of a topic between two endpoints of the chain: producer → consumer through the broker or a parent system, or a relay between a system and its upstream system. The chain pane's Sequence section adds, removes and reorders steps, and adds or removes links in each step. **Auto-fill** proposes an order following the flow: a link comes one step after the links that bring data to the system it starts from. The sample chains come with that sequence. Links that no longer exist are ignored. |
| GRP-14 | An **animate** mode plays a chain's sequence on the diagram, showing the chain activating progressively. | Done (tested) | Started from ▶ on the chain row in the left panel, or "▶ Animate" in the chain pane. It plays on the main diagram and in the chain (tube) view. The current step's links are drawn thick with a moving dash, earlier steps stay lit, later steps are faded, and other arrows almost disappear. Each link shows its step number. A player bar offers first, previous, play/pause, next and stop, and shows the current step's links. Playback loops every 1.6 s. Not available in the SoS view, where links are merged per system. Checked in Chrome. |
| GRP-15 | The draw.io export keeps the animation. | Done (tested) | While animating, the draw.io export contains an overview page with every link numbered and the steps listed, plus one page per step. On each step page, the current links use draw.io's flow animation (moving dashes), earlier ones stay lit and later ones are faded, with a caption listing the step's links. Flip through the pages to replay the chain. The SVG export captures the current step, including the moving dash. Well-formed XML, not yet opened in draw.io. |
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
| LAY-09 | Systems can be dragged on the diagram to reorder them along a border, move them to another border or attach them to another parent. | Done (tested) | Same move and same rules as the left panel, which updates by itself. The two ends of a system mean before or after it, along its border, and the middle means upstream of it. So does the empty place beyond the outer edge of a system with no leaf yet, where its first leaf will appear. In a gap or over the broker, the system goes at that position on the nearest border. A ghost and a blue marker show where it will land. Escape cancels, and dropping it back on itself does nothing. Available on the main diagram. Checked in Chrome. |

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
| EXL-08 | One button in the Topics header sorts the list A–Z or Z–A and shows the current order. | Done (tested) | The button shows only an arrow: ↑ (A–Z), ↓ (Z–A) or ↕ (custom order, for example after a drag). Clicking sorts A–Z, or Z–A when the list is already A–Z. Sorting uses natural, case-insensitive order, so TOPIC 2 comes before TOPIC 10. The sorted result becomes the order the user can then drag. Checked in Chrome. |
| EXL-10 | The left panel can be resized by dragging the handle between it and the canvas. | Done | Width between 180 and 640 px, and always leaving room for the canvas. Double-click the handle to reset to 260 px. Left and right arrow keys also resize it when the handle has focus. The width is remembered between sessions and is not reset by New, Sample or Open. Checked in Chrome. |
| EXL-11 | The left panel can be collapsed and shown again. | Done | With the ‹ / › button on the handle, Enter on the focused handle, or by dragging the handle past the left edge. Dragging from the collapsed rail reopens it. The search text and open sections are kept while collapsed, and the collapsed state is remembered between sessions. Checked in Chrome. |
| EXL-12 | Bundles and chains can be sorted A–Z or Z–A in the left panel, like topics. | Done (tested) | The same arrow-only sort button (↑, ↓, ↕) in the Bundles and Chains headers. Sorting one kind of group does not move the other. Checked in Chrome. |
| EXL-13 | Each border heading (West, North, East, South) has a + button that adds a system on that border. | Done | The new system is selected for editing, and a folded border opens to show it. Checked in Chrome. |
| EXL-14 | The right-click menu of any system has + System and + ETL, which add one upstream of that system. | Done | On the broker row, they add a system or ETL attached to the broker. A folded parent opens to show the new row. Checked in Chrome. |
| EXL-15 | System rows can be folded under their parents, and whole borders can be folded, down to showing only the West, North, East and South headings. Each border can fold or unfold all its rows at once. | Done | A chevron on each parent row and border heading. A folded row or border shows how many systems it hides. On each border, ⊟ folds every parent (only the systems on the broker remain) and ⊞ unfolds everything, including the border itself. Searching ignores folds so every match shows. Folding is remembered between sessions and does not affect the diagram. Checked in Chrome. |
| EXL-16 | Bundles and chains can be rearranged by drag and drop in their own sections, like topics. | Done (tested) | Drop on the top or bottom half of a row. A bundle can only go among bundles and a chain among chains. The order is saved in the model, and the sort button then shows ↕ unless the new order happens to be A–Z or Z–A. The order also sets the order of the legend. Checked in Chrome. |

### 4.8 Details pane

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DET-01 | Clicking a topic opens a vertical pane on the right of the canvas where its details can be viewed and edited. | Done | The pane also lists the topic's producers and consumers and can add or remove them. |
| DET-02 | Clicking a system opens the right pane, where its details can be viewed and edited. | Done | |
| DET-03 | The system pane has subsections for its produced topics and its consumed topics. Each topic's details can be viewed and edited there. | Done | Each topic is a collapsible card with the full set of topic fields. |
| DET-04 | Clicking the broker or a group opens its details. | Done | |
| DET-05 | A single click opens details without changing the view. | Done | **Design decision**: click opens details, double-click focuses the view. |
| DET-06 | The right panel can be resized and collapsed, like the left panel (EXL-10, EXL-11). | Done | Width between 240 and 720 px, default 340 px. Each panel's limit leaves at least 300 px for the canvas next to the other panel. While the panel is collapsed, clicking an element selects it without reopening the panel, so the layout the user chose stays as it is. Checked in Chrome. |

### 4.9 System of System view

| ID | Requirement | Status | Notes |
|---|---|---|---|
| SOS-01 | Each system can be set as **Inner**, **Outer** or **Not shown** in the SoS view. The broker is Inner by default. | Done (tested) | Set it in the system pane, in the right-click menu, or with the role button that each system row shows while the SoS view is on (click to cycle). The broker can be Inner or Not shown. **Defaults:** only the broker is Inner. Systems (parents and leaves) are Outer, and ETLs are Not shown. These apply to new systems, to the sample, and to older files without SoS roles. Callouts show notes only by default. |
| SOS-02 | A toolbar switch shows the SoS view (SOS.png): a central "System of System" box holding the inner systems. | Done | **Topics / System of System** switch. The box title can be edited in the SoS settings bar. |
| SOS-03 | Outer systems are arranged around the SoS box like the petals of a flower. | Done (tested) | They are spread evenly all around the box, and the ring is rotated so each one stays as close as possible to its border (North at the top, and so on). The ring grows until no petal overlaps another. |
| SOS-04 | A parent can be left out while its leaf is shown, or the leaves left out while the parent is shown. A parent can also be inside with some of its leaves while its other leaves are outside. | Done (tested) | Each system has its own role. A parent is drawn as a frame around the shown descendants that share its role. Descendants with another role are drawn on their own, inside or around the box, and the flows between them and the parent are drawn like any other. |
| SOS-05 | Arrows show the topics exchanged, labelled with the topic list. | Done (tested) | Between inner systems: one arrow per direction. Between an outer system and the SoS: one arrow into and/or one out of the box. Flows pass through systems that are not shown, so West Sys 2.1 → West Sys 2 (not shown) → West Sys 11 is drawn as West Sys 2.1 → West Sys 11. Long lists are shortened ("TOPIC 1, TOPIC 2 +3"), with the full list as a tooltip. |
| SOS-06 | Each outer system has a note callout showing its notes, description, selected properties and/or topics. | Done (tested) | The SoS settings bar chooses what callouts show. Properties can be limited to a list of keys. Each system has a Notes field for this. Systems with nothing to show have no callout. A frame's callout also covers its nested systems. |
| SOS-07 | The SoS view can be exported as SVG and draw.io. | Done | In draw.io the SoS box and parent frames are swimlanes, and callouts are notes linked to their system. Well-formed XML, not yet opened in draw.io. |
| SOS-08 | Arrows between inner systems avoid crossing other boxes. | Partial | With the broker shown, inside lines form a star around it and do not cross other boxes. Without it, direct lines are straight and can cross a box lying between two systems. |
| SOS-09 | The topic lines inside the SoS box can be switched on and off. | Done (tested) | **Inside lines** checkbox in the SoS settings bar, saved with the model. Lines between outer systems and the box are always shown. |
| SOS-10 | When the broker is shown, all inside topic lines go through it. | Done (tested) | The broker is placed in the middle of the box, with the other inner systems in a ring around it, oriented by border like the outer flower. Each inner system has one line to the broker for what it publishes to other shown systems, inside or outside the box, and one line from it for what it reads. When the broker is not shown, inside lines go directly between systems, laid out in a grid. |


### 4.10 Comments

| ID | Requirement | Status | Notes |
|---|---|---|---|
| COM-01 | Each entity (the broker, systems and ETLs, topics, bundles and chains) and each line (one topic from one system to another) can be commented in its right-panel pane, beside its notes and description. | Done (tested) | A Comments section at the end of each pane, and a new **Line** pane for lines. |
| COM-02 | A user gives a name before commenting, from a user icon at the top right. | Done | The icon shows the user's initials once a name is set. The name is kept in that browser only, not in the model. Without one, comment forms are replaced by a "Set your name" link, and the canvas comment box asks for the name first. Checked in Chrome. |
| COM-03 | A user can create a comment, reply to a thread or to one comment, accept or reject any comment of a thread, and close (resolve), reopen or remove a thread, or remove a single comment. | Done (tested) | Accepting or rejecting again the same way clears the decision. Removing the first comment keeps the replies. A thread left without comments is removed. Threads go when their entity is deleted. |
| COM-04 | The author and date of every comment are kept, and so are those of every action. | Done (tested) | Each comment has its author and date, each decision who and when, and each closure who and when. Each thread also keeps a history of every action with its author and date, shown under "History". |
| COM-05 | Right-clicking an item on the canvas opens an inline box to comment on it. | Done | Systems, ETLs, the broker, topic tabs and lines in the Topics view; systems and topic bars in the chain view; systems in the SoS view. Lines have a wide invisible margin so they are easy to hit. Checked in Chrome. |
| COM-06 | An item with unresolved comments shows a small numbered circle in its corner, or on its line, giving the number of open threads. | Done | On systems, the broker, topic tabs (every tab of the topic), collapsed group tabs and lines, in the Topics, chain and SoS views. A thread counts until it is closed. Checked in Chrome. |
| COM-07 | Clicking a circle opens the right panel on the item and brings its comment into view. | Done | The panel reopens if it was collapsed, scrolls to the thread and highlights it. Checked in Chrome. |
| COM-08 | Comment threads are stored compressed in the exported JSON, and are not part of SVG or draw.io exports. | Done (tested) | `"comments": {"encoding": "gzip+base64", "data": "…"}`, using the fflate library. Files with a plain list of threads also load. The circles and comments exist only on screen. |
| COM-09 | Changing the diagram needs a user name. Without one, the left panel cannot add, move, reorder, rename, duplicate or delete anything, the right panel shows every field read-only, and systems cannot be dragged on the canvas. | Done (tested) | Enforced in the store, so no screen can bypass it. Still open to everyone: browsing, search, filters, folding, the ● / ◌ show/hide, views and animation, Open / New / Sample, and the System of System display options. A note at the top of each panel links to the name form. The name is not a login: anyone can type one. |
### 4.11 Export and persistence

| ID | Requirement | Status | Notes |
|---|---|---|---|
| EXP-01 | Any view can be exported as SVG. | Done | Exports exactly what is on screen, including the current filter. Checked by rendering sample views to PNG. |
| EXP-02 | Any view can be exported in a format draw.io can open. | Done | `.drawio` (mxGraph XML). The XML was checked to be well formed. **Not yet opened in draw.io.** The hand-drawn sketch style is left to draw.io itself (Format panel → Sketch); the export option was removed in 0.25. |
| EXP-03 | The model is saved automatically. | Done | Browser localStorage. |
| EXP-04 | The model can be saved to and loaded from a file. | Done | JSON. Missing fields are filled with defaults on load. |
| EXP-05 | An existing `.drawio` file can be imported. | **Open** | Not requested. Listed only to track the idea. |
| EXP-06 | The current file can be saved over, or saved to a new file. | Done | **Save** writes over the file last opened or saved (asks where the first time); **Save as…** asks where, and that file becomes the current one. Chrome and Edge (File System Access API). Other browsers show a single **Save JSON** download. New and Sample forget the current file. |

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
| NFR-07 | Dependency updates are automated on GitHub. | Done | `.github/dependabot.yml` covers npm packages and GitHub Actions on a weekly schedule. Minor and patch updates are grouped, and each major update gets its own pull request. Every update pull request is tested by CI. The file was checked against the official Dependabot schema, but has not yet run on GitHub. GitLab is not covered. |

## 6. User interface

```
┌──────────────────────────────── Toolbar ────────────────────────────────┐
│ New · Sample · Open · Save · Save as │ Topics · SoS │ Export SVG · draw.io │ User │
├──────────────┬─────────────────────────────────────────┬────────────────┤
│ Explorer     │ Filter bar (chips / Show all)           │ Details pane   │
│  search      │                                         │  centre /      │
│  systems by  │            Canvas                       │  system /      │
│  border      │   (scroll = zoom, drag = pan)           │  topic /       │
│  topics      │                                         │  group         │
│  bundles     │ Legend   Topic names · Group topics ·   │
│              │          Settings · Fit + −             │                │
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
15. **SoS flows and callouts:**
    - A flow between two outer systems goes through the broker. When the broker is in the box, the flow is drawn as a line into the box from the producer and a line out of it to the consumer. Flows within one outer group (a parent and its framed leaves) are not drawn. When the broker is not shown, flows between outer systems don't cross the SoS and are not drawn.
    - When the broker is shown, inside lines go through it (SOS-10). Lines to outer systems still stop at the SoS box border, since they enter and leave the SoS through the broker anyway.
    - Only outer systems have callouts, as in SOS.png.
    - The chain view, when on, takes precedence over the SoS view.
16. **Animation in draw.io uses one page per step.** draw.io has no timeline to animate a single page, so the export uses its flow animation (moving dashes) on the current step's links, with one page per step. Moving through the pages replays the sequence.

## 8. Open questions

- Is a separate "both directions" role needed in the editor, or are two interactions enough?
- Should topics carry more structured fields, such as schema, retention, partitions or SLA, instead of free-form properties?
- Is a shared, server-side model needed so that several people can edit the same diagram?
- Should a chain record the order of its steps, for example to number the arrows along the flow?

## 9. Change log

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1 | Initial build covering §4.1–4.6, §4.8 and §4.11. Reference material moved to `docs/spec/`. |
| 2026-11-13 | 0.25 | Editing needs a user name (COM-09). Save / Save as over the current file (EXP-06). View options moved to a dock at the bottom of the canvas, which can be folded. The draw.io sketch-style option is removed (EXP-02). |
| 2026-11-11 | 0.24 | Comments on every entity and line (COM-01 to COM-08). The legend lists only chains. |
| 2026-11-11 | 0.23 | The main view is called **Topics** in the toolbar switch (Topics / System of System) and its "Back to" links. |
| 2026-11-11 | 0.22 | Bundles and chains can be rearranged by drag and drop (EXL-16). |
| 2026-11-11 | 0.21 | Left panel: sorting of bundles and chains, + per border, + System / + ETL in the right-click menu, folding of system rows and borders. Hideable legend (EXL-12 to EXL-15, GRP-16). |
| 2026-11-09 | 0.20 | Systems can be dragged on the diagram (LAY-09). |
| 2026-11-09 | 0.19 | Topic names longer than their box: rolling text, small font, or wider boxes (REN-08). |
| 2026-11-09 | 0.18 | The right panel can be resized and collapsed (DET-06). |
| 2026-11-09 | 0.17 | The left panel can be resized and collapsed (EXL-10, EXL-11). |
| 2026-11-07 | 0.16 | Open source under the MIT licence. README badges, screenshots and live-app link. |
| 2026-11-07 | 0.15 | Chain sequences, animate mode, and animated draw.io export (GRP-13 to GRP-15). |
| 2026-11-07 | 0.14 | Automated dependency updates with GitHub Dependabot (NFR-07). |
| 2026-11-07 | 0.13 | Bundle and chain colouring can be hidden from the left panel, the legend or the group pane (GRP-12). The content stays. |
| 2026-11-07 | 0.12 | SoS defaults: only the broker inside, systems outside, ETLs not shown, callouts showing notes (SOS-01). Flows between outer systems are drawn through the box when the broker is in it. Every sample system has a note. |
| 2026-11-07 | 0.11 | SoS: inside lines can be switched off (SOS-09). With the broker shown, inside lines go through it, and inner systems form a ring around it (SOS-10). |
| 2026-11-07 | 0.10 | System of System view (SOS-01 to SOS-08): Inner/Outer/Not shown role per system, a flower arrangement of outer systems around the SoS box, flows through systems that are not shown, configurable note callouts, and SVG and draw.io export. |
| 2026-11-07 | 0.9 | Chain view: broker-tube layout for one chain, toggled from the left panel, with SVG and draw.io export (GRP-08 to GRP-11). Terminology: "functional chain" becomes "chain", and "exe/executable" becomes "ETL" (decision 13). |
| 2026-11-07 | 0.8 | GitHub Pages: Actions workflow (`.github/workflows/pages.yml`) (NFR-06). |
| 2026-11-07 | 0.7 | GitLab Pages: CI pipeline (`.gitlab-ci.yml`) and relative asset paths (NFR-05). |
| 2026-11-07 | 0.6 | An endpoint can be part of several chains (GRP-02a). Multi-chain pickers, striped tabs, multi-colour arrows, and collapse-by-chain showing a shared endpoint in each chain tab. Duplicating a chain now copies its endpoints. The sample model gains a "Settlement" chain. |
| 2026-11-07 | 0.5 | Topics section: the A–Z/Manual switch is replaced by drag and drop plus one A–Z/Z–A sort button (EXL-07, EXL-08). Removed EXL-09: details pane lists follow the topic order without needing a separate rule. |
| 2026-11-07 | 0.4 | Topics section: A–Z or Manual order, with drag-and-drop reordering (EXL-07 to EXL-09). |
| 2026-11-07 | 0.3 | Left panel: drag and drop systems to reorder them, move them to another border or make them upstream (EXL-01 to EXL-03, LAY-07 done). Right-click menu with Rename, Duplicate and Delete (EXL-04). Double-click to rename (EXL-05). |
| 2026-11-07 | 0.2 | Chains now group individual endpoints instead of whole topics (GRP-02 to GRP-07). Arrows are computed per endpoint, so collapsed chain tabs connect to plain topic tabs. |
