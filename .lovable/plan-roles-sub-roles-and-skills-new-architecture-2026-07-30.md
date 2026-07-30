# Roles, Sub-roles and Skills — new architecture

Rebuild the taxonomy on three levels: **Macro-role** (binary filter), **Sub-role with level** (weighted in matching), **Skills** (hard/soft).

## New taxonomy

7 macro-roles, each with its own sub-roles and its own associated skill set:

1. Engineering — 15 sub-roles (Design, Composite Design, Performance, Race Engineer, Test Engineer, Simulation, Vehicle Dynamics, Electronics, Control Systems, Engine/Powertrain, Electric Vehicles, R&D, Production, Project, IT)
2. Mechanics — Chief Mechanic, Race Mechanic, Assembly/Sub Assembly, Composite Staff, Technicians, Inspector/QC, Truck Driver
3. Logistics — Logistics, Stores/Parts Coordinator, Truck Driver
4. Management & PR — Team Manager, Manager, Production Manager, Project Planner, Driver Management, Driver Coach, Marketing, Events, Accounting/Finance, Finance, Procurement/Buyer
5. Hospitality — Hospitality Manager, Chef/Head Cook, Sous Chef/Kitchen Staff, Waiter/Server, Barista/Bartender, Hospitality Logistics & Setup
6. Media & Content — Photographer, Videomaker, Content Creator/Social, Drone/FPV, Video Editor, Graphic/Livery Designer, Press Officer
7. Health & Performance — Physiotherapist/Osteopath, Athletic Trainer, Sports Nutritionist

Skills are attached to the macro-role as specified (new entries added: driving licences, telemetry vendors, management, hospitality, media, health & performance skills). Skills shared by more than one macro-role stay shared.

## How it behaves

**Freelancer profile**
- One macro-role.
- One or more sub-roles, each with a level: Junior / Intermediate / Senior.
- Unlimited skills. The picker shows the macro-role's skills by default, with a "Show all skills" toggle.

**Team request**
- One macro-role (always a hard requirement).
- Exactly one sub-role, with a minimum level (Junior / Intermediate / Senior) and a hard/soft switch.
- Skills stay multi-select with the existing soft/hard states, filtered by macro-role with the same "Show all" toggle.

**Matching**
- Macro-role: pure yes/no filter — a mismatch removes the candidate, and it no longer carries any percentage weight.
- Sub-role: inherits the weight the role used to have. Score depends on the level gap:
  - level equal or higher than requested → 100%
  - one level below → 50%
  - two levels below → 25%
  - If the sub-role is hard, a candidate without that sub-role is excluded; if soft, they score 0 on that criterion.

## Admin Control Panel

- Matching weights tab: the "Role" weight field is removed and replaced by a **Sub-role** weight field (it takes over the current role percentage, so the total still sums to 100).
- New sub-section "Sub-role level scoring" with three editable percentages: exact/above = 100, one level below = 50, two levels below = 25. These feed the matching engine directly.
- Wiki/documentation text updated to describe the new three-level structure.

## Existing data

Old roles are mapped automatically to the equivalent macro-role + sub-role, with level Intermediate as default. Nothing is lost and no user action is required; users can refine their level whenever they edit the profile. Existing requests get the matching macro-role + sub-role, minimum level Junior, kept soft unless the old role was flagged hard.

## Technical notes

- DB: new `role_group` enum (7 macro-roles) and `sub_role` enum; `sub_role_level` enum (junior/intermediate/senior).
  - `freelancer_profiles`: add `role_group`, `sub_roles jsonb` (`[{sub_role, level}]`).
  - `requests`: add `role_group`, `sub_role`, `sub_role_min_level`, `sub_role_hard`.
  - `matching_weights`: rename/replace `role_weight` with `sub_role_weight`; add `level_exact_pct`, `level_one_below_pct`, `level_two_below_pct` (100/50/25).
  - Data backfill migration mapping every legacy `freelancer_role` value.
- `recompute_matches` rewritten: macro-role as hard filter, sub-role weighted with level scoring, skills/languages/etc. unchanged.
- `src/lib/paddock.ts`: new `ROLE_GROUPS` structure (macro-role → sub-roles → skills), plus label helpers and a `skillsForRoleGroup()` used by the "show all" toggle.
- UI touched: `dashboard.profile.tsx`, `dashboard.requests.new.tsx`, match/detail views, public freelancer & job pages, `admin.matching.tsx`.
- i18n keys added for the new sub-roles, skills and levels across en/it/es/fr/de.
