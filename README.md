# OrgChartGenerator

Define an organizational structure in a simple YAML file and visualize it in multiple types of diagrams.

# Objectives
* <zyz>-OrgChart.yaml as the single source of truth both for applications and human users (employees)
* ability to experiment with multiple (manually or automatically created) visual diagram layouts
* make the company structure version controlled
* ability to compare before & after reorganization states
* be a company "compass" for new employees to find themselves, their team(s) and understand other teams
 
# Rules of company structure 
* a company or organization contains one or more teams
* any group of employees is represented as a team: company, headquarter, department, business unit, guilt, ...
* the company itself is the single top-level team
* a team contains zero or more employees
* a team may contain nested/child teams<br>e.g.: the "platform department" may have teams: "API", "messaging", "Observability", ...
* a team has a mandatory name name and an optional description
* the names of the nested child teams in any parent team are unique<br> i.e.: the "platform department" cannot contain 2 "messaging" teams with the same name  
* The fully qualified human readable ID of a team is <company>/<team-1>/<team-2>/.../<team-N> format<br>where all the parent teams represented up till the company
* team names cannot contain "/" and new line characters
* an employee has a name, an email address and list of teams he/she is member of
* format of the email address: <first_name>.<last_name>[number_to_make_unique]@<company_name>.<company_toplevel_domain>

# Structure of the *-orgChart.yaml file
* It contains the TEAMS and EMPLOYEES top-level elements

TBD
