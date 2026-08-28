# OrgChartGenerator

A source-of-truth file describing a company's structure, and the diagrams generated from it.

## Language

**Team**:
A named group within the organization. Teams nest: a Team may contain other Teams.
_Avoid_: Group, department, unit, squad

**Position**:
A single seat within a Team, carrying a Role, which an Employee may or may not occupy. A Position belongs to exactly one Team.
_Avoid_: Seat, headcount, box

**Role**:
What a Position is a seat for, e.g. `EngineeringManager`: a Position stripped of its Team path and its Occupant. One Role is shared by many Positions across many Teams, which is what makes it the thing a diagram filters on.
_Avoid_: Title, job title, function, rank

**Path**:
A Position's location: its Team's path followed by its Role, e.g. `ACME/retail/OrderManagement/SeniorBackendEngineer`. A label for display and human reference, not an identity — Positions sharing a Role within one Team share a Path and are indistinguishable.
_Avoid_: Key, address, fully-qualified name, id

**Employee**:
A human who occupies zero, one, or many Positions. Identified by email address. An Employee's Teams are those of the Positions they occupy. The term covers anyone filling a Position, including contractors.
_Avoid_: Person, member, staff, individual

**View**:
A saved candidate visual representation of one organization: its Arrangement and that Arrangement's options, styling, filter, detail switches and the geometry of every Team shape. Stored as `<org-prefix>.<view-name>.view.yaml` beside the organization's files. An organization has many Views; comparing them is what the workbench is for.
_Avoid_: Layout, diagram, chart, theme

**Arrangement**:
How a View draws the organization. Either *nested* — a Team drawn as a shape containing its child Teams — or *tree*, Teams as separate shapes joined by lines. Both draw the **same** containment tree and differ only in how they draw it, so *nested* is not "not a tree". One Arrangement governs a whole View, and each Arrangement carries its own options. Applied by a command that overwrites all geometry; it is not a live constraint.
_Avoid_: Encoding, enclosure, node-link, layout, style, mode, representation

**Shape**:
The figure a Team is drawn as: a rectangle or an ellipse. One Shape governs a whole View — it is not chosen per Team, because the Arrangement has to know it in order to place child Teams inside their parent.
_Avoid_: Circle, figure, form

**Occupant**:
The Employee filling a Position. A Position has at most one Occupant; a Position without one is vacant.
_Avoid_: Holder, incumbent, assignee
