# OrgChartGenerator

Define an organizational structure in plain YAML, keep it under version control, and
generate diagrams from it.

## Status

The **v1 file format is specified**. There is no implementation yet.

| | |
|---|---|
| [`acme-tiny-*.yaml`](acme-tiny-teams.yaml) | Hand-written worked example, exercising every case the format supports |
| `acme-small-*`, `acme-medium-*`, `acme-large-*` | Generated organizations of 10, 30 and 100 Teams |
| [`schemas/`](schemas/) | JSON Schemas — editors validate the files as you type |
| [`scripts/validate.sh`](scripts/validate.sh) | Validates a file, or both files of an organization, against them |
| [`CONTEXT.md`](CONTEXT.md) | The glossary: Team, Position, Path, Employee, Occupant |

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
* ability to experiment with multiple (manually or automatically created) visual diagram layouts
* make the company structure version controlled
* ability to compare before & after reorganization states
* be a company "compass" for new employees to find themselves, their team(s) and other teams/employees

## Not in v1

Each of these was decided deliberately, not overlooked:

- **Reporting lines.** No manager relation is modelled. Teams nest; people do not report to
  one another. Restoring this requires settling Position identity first.
- **Position identity.** Two Positions sharing a Role within one Team share a Path and are
  indistinguishable except by their occupant.
- **Semantic reorganization diff.** Objective four is served by `git diff` of the YAML.
  A structural diff is foreclosed while Positions have no identity.
- **Diagram rendering.** Planned as a separate effort; no renderer, layout engine or
  implementation language has been chosen.

Every decision, and the reasoning behind it, is recorded on
[the wayfinder map](https://github.com/belaboros/OrgChartGenerator/issues/1).
