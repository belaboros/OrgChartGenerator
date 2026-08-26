# OrgChartGenerator

A source-of-truth file describing a company's structure, and the diagrams generated from it.

## Language

**Team**:
A named group within the organization. Teams nest: a Team may contain other Teams.
_Avoid_: Group, department, unit, squad

**Position**:
A single seat within a Team, with a title, which an Employee may or may not occupy. A Position belongs to exactly one Team.
_Avoid_: Role, seat, headcount, box

**Path**:
A Position's location: its Team's path followed by its title, e.g. `ACME/retail/OrderManagement/SeniorBackendEngineer`. A label for display and human reference, not an identity — same-titled Positions within one Team share a Path and are indistinguishable.
_Avoid_: Key, address, fully-qualified name, id

**Employee**:
A human who occupies zero, one, or many Positions. Identified by email address. An Employee's Teams are those of the Positions they occupy. The term covers anyone filling a Position, including contractors.
_Avoid_: Person, member, staff, individual

**Occupant**:
The Employee filling a Position. A Position has at most one Occupant; a Position without one is vacant.
_Avoid_: Holder, incumbent, assignee
