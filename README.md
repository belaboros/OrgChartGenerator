# OrgChartGenerator

Define an organizational structure in plain YAML, keep it under version control, and
generate diagrams from it.

## Status

The **v1 file format is specified**, and the **workbench is built**: an interactive tool for
finding the right visual representation of an organization.

```sh
cd app && npm install && npm run dev
```

Needs Chrome or Edge — it opens a folder and writes views back into it. See
[`app/README.md`](app/README.md).

| | |
|---|---|
| [`app/`](app/) | The workbench — encodings, arrangements, style cascades, PNG export |
| [`acme-tiny-*.yaml`](acme-tiny-teams.yaml) | Hand-written worked example, exercising every case the format supports |
| `acme-small-*`, `acme-medium-*`, `acme-large-*` | Generated organizations of 10, 30 and 100 Teams |
| `*.view.yaml` | Worked views — open one to see a real diagram on the first run |
| [`schemas/`](schemas/) | JSON Schemas — editors validate the files as you type |
| [`scripts/validate.sh`](scripts/validate.sh) | Validates a file, or both files of an organization, against them |
| [`CONTEXT.md`](CONTEXT.md) | The glossary: Team, Position, Role, View, Encoding, Arrangement, Employee, Occupant |

## The format

An organization is described by two files:

- `<company>-teams.yaml` — the structure: nested Teams containing Positions
- `<company>-employees.yaml` — the people, keyed by email

```yaml
# acme-tiny-teams.yaml
org: ACME
version: 1
teams:
  retail:
    teams:
      OrderManagement:
        positions:
          - role: EngineeringManager
            occupant: priya@acme.com
          - role: SeniorBackendEngineer      # vacant — no occupant
```

```yaml
# acme-tiny-employees.yaml
org: ACME
version: 1
employees:
  priya@acme.com:
    name: Priya Raman
    location: Berlin        # any further attributes are allowed
```

A **Position** is a seat; an **Employee** may or may not occupy it. Keeping the two apart is
what lets the format express an open role — a Position with no `occupant` — and a person
working across teams, as one Employee occupying two Positions.

## The workbench

```sh
cd app && npm install && npm run dev
```

Open the folder holding your org files, pick an organization, and try representations against
each other: two encodings, five arrangements, two shapes, independent detail switches, a Role
filter, and styling that cascades by nesting depth.

Keep the ones worth keeping as `<org>.<view>.view.yaml` beside the org files — one file per
candidate view, so `git diff` compares two representations. Export any of them as a PNG.

Full details, and why it needs Chrome, in [`app/README.md`](app/README.md).

## Validating

```sh
./scripts/validate.sh acme-small                 # both files of an organization
./scripts/validate.sh acme-tiny-teams.yaml       # a single file
./scripts/validate.sh --setup                    # one-time: create .venv with the dependencies
```

Editors that understand the `# yaml-language-server:` modeline at the top of each file
validate as you type, without running anything.

## Objectives

* `<company>-teams.yaml` and `<company>-employees.yaml` as the single source of truth, both for applications and for human users (employees)
* ability to experiment with multiple (manually or automatically created) visual diagram layouts — *this is what the workbench is*
* make the company structure version controlled
* ability to compare before & after reorganization states
* be a company "compass" for new employees to find themselves, their team(s) and other teams/employees — *the Role filter; see `acme-large.architects.view.yaml`*

## Not in v1

Each of these was decided deliberately, not overlooked:

- **Reporting lines.** No manager relation is modelled. Teams nest; people do not report to
  one another. Restoring this requires settling Position identity first.
- **Position identity.** Two Positions sharing a Role within one Team share a Path and are
  indistinguishable except by their occupant.
- **Semantic reorganization diff.** Objective four is served by `git diff` of the YAML.
  A structural diff is foreclosed while Positions have no identity.
- **Undo.** Manual placement can be lost to an accidental **Arrange**. The confirmation
  dialog and the marker on hand-placed shapes stand in for it.
- **SVG export.** PNG only. The diagram is already SVG, so this is the cheapest thing on the
  list after v1 — it was deferred when the drawing surface was still undecided.
- **Safari and Firefox.** Neither implements the file pickers the workbench needs.

Every decision, and the reasoning behind it, is recorded on the wayfinder maps:
[the v1 format](https://github.com/belaboros/OrgChartGenerator/issues/1) and
[the workbench](https://github.com/belaboros/OrgChartGenerator/issues/12).
