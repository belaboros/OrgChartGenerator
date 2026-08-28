# OrgChart Workbench

An interactive tool for **finding the right visual representation** of an organization.

It is not a renderer that produces one diagram. It exists so you can try the alternatives
side by side — nested against tree, each with its own options, two shapes, four levels of
detail — and keep the one that works.

```sh
npm install
npm run dev
```

Then open the printed `localhost` address, choose the folder holding your
`<org>-teams.yaml` and `<org>-employees.yaml` files, and open an organization.

## It needs Chrome or Edge

This is a deliberate choice, not an oversight.

The workbench opens a folder and **writes back into it** — that is what lets a view be saved
beside the org files it describes, and diffed against another view with `git diff`. Only the
[File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API)
can do that from a browser, and today only Chromium browsers implement it. Safari and Firefox
have none of the pickers.

The alternative was a download-and-move step on every save, which would have made comparing
two representations — the entire point of the tool — miserable.

## Install it as an app

There is no desktop build, and it does not need one. In Chrome:

**⋮ → Cast, save and share → Install page as app**

That gives a double-clickable icon and its own window, running the same engine, on the same
origin, with folder access intact. A packaged Electron shell would have added a build
toolchain to deliver the icon and nothing else.

## What it does

| | |
|---|---|
| **Arrangement** | `nested` — a Team drawn as a shape containing its child Teams — or `tree` |
| **tree options** | `direction`: `left-to-right`, `top-to-bottom`, `radial` — plus *pack subtrees to fit the window* |
| **nested options** | `wrap`: `fit` (matches your window), `left-to-right-then-top-to-bottom`, `top-to-bottom-then-left-to-right` — plus *minimize area* (not implemented yet; the workbench says so when you set it) |
| **Shape** | rectangle or ellipse — one for the whole View, not per layer |
| **Detail** | show Positions, show Occupant names, show per-Team counts — independent switches |
| **Filter** | choose which Roles appear. This is what makes a 100-Team organization readable |
| **Style** | two cascades by nesting depth, Role, Occupant and vacancy |
| **Manual** | move and resize any Team by hand; **Arrange** discards it, and says so first |
| **Save** | `<org>.<view>.view.yaml` beside the org files — one file per candidate view |
| **Export** | whole-diagram PNG at 1×, 2× or 4×, tiled, with no size ceiling worth worrying about |

## Arrange is a command, not a mode

Choosing an arrangement places every shape once; you then own the layout. Move and resize
whatever you like.

The **Arrange** panel only ever holds a draft: switching tabs, changing a direction or a wrap,
ticking a box, changing the shape — none of it touches the diagram. Browsing what the other
arrangement offers is free. Pressing **Arrange** applies the draft, recomputes everything and
**discards hand-placed geometry**; the panel says how many shapes that is beforehand, and the
button asks before doing it. It is the one destructive control in the panel.

Changing detail switches, the Role filter or styling does *not* discard anything: those
change what a shape contains, not where it goes.

There is no undo. That is a v1 omission, not an oversight — the confirmation dialog and the
amber marker on hand-placed shapes are what stand in for it.

## Worked views

Committed beside each example organization, so a first run shows a real diagram:

| | |
|---|---|
| `acme-tiny.overview.view.yaml` | every case the format supports, 8 shapes |
| `acme-small.overview.view.yaml` | 10 Teams, 48 Positions |
| `acme-medium.overview.view.yaml` | 30 Teams, 152 Positions |
| `acme-large.overview.view.yaml` | 100 Teams with per-Team counts, Positions hidden |
| `acme-large.architects.view.yaml` | the same 100 Teams filtered to architect and owner Roles |

## Layout

```
src/files/     the file-access seam: one interface, a File System Access adapter, and a
               dev adapter that makes everything above it testable without a picker
src/model/     raw YAML -> Team / Position / Role / Employee, validated against schemas/
src/view/      arrangement, the two style cascades, the SVG canvas, the PNG encoder
src/ui/        the Inspector rail
```

No rendering or layout library. The canvas is `<svg>`, `<rect>`, `<ellipse>`, `<text>` and
one transform; the arrangements are about 300 lines of our own code.

## Why the PNG encoder is hand-rolled

Past **65535 px in one dimension** a canvas cannot be created at all, and `toDataURL` returns
the empty string `data:,` — no exception, no warning. A 100-Team organization laid out
left-to-right at 4× is 69151 px wide, which is over that line.

So the image is rendered in tiles and the PNG assembled directly from their scanlines. PNG
itself allows dimensions up to 2³¹−1; the canvas was always the constraint.
