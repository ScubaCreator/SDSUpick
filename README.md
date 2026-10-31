# SDSU Auto Schedule Planner MVP


## What changed in v0.2

The original MVP shipped only seven demo courses. v0.2 removes that limitation.

- On startup, the server automatically builds a searchable SDSU catalog from public SDSU-derived listings.
- The catalog is expected to contain thousands of distinct courses across 100+ subjects and is cached for 12 hours.
- Search now queries that full catalog instead of `data/schedule.json`.
- When you choose a course, its live enrollment options for the active term are fetched only when needed and normalized into the planner's section format.
- Degree-audit detection now matches against the full searchable catalog.
- If a selected catalog course has no enrollment options for the active term, it remains searchable but will correctly produce no schedule for that term.

The small `data/schedule.json` file is now only a startup/term fallback and a demo fallback. It is no longer the searchable course catalog.

## Data notes

SDSU's official public class schedule is the authority for enrollment. The automated catalog/section adapter currently consumes public SDSU-derived listings from ClassCatalog because they expose the same public schedule information in stable server-rendered pages that are practical to normalize. The adapter and cache are isolated in `server.mjs`, so the source can be swapped to SDSU's PeopleSoft report without changing the planner UI or scheduling engine.

## v0.3 schedule-time correctness patch

- Spring 2027 is now explicitly mapped to PeopleSoft term `2273` (matching the live my.SDSU registration URL format).
- Section data from ClassCatalog is now labeled as unverified rather than silently treated as authoritative.
- `data/official-overrides.json` provides a term + class-number correction layer for values verified directly in my.SDSU.
- A E 331, Spring 2027, class #1026 is corrected to Mon/Wed 7:00 PM-8:15 PM based on the official my.SDSU registration page supplied during testing.
- Calendar cards now show the class number and whether the section has an official correction.

The long-term fix is to replace ClassCatalog section times with SDSU's official public Schedule of Classes Excel feed. The provider boundary in `server.mjs` is intentionally kept isolated so that change will not require rewriting the planner.

## v0.4 custom commitments

- Removed the degree-audit upload/OCR workflow from the planner UI.
- Added recurring custom commitments with a name, one or more weekdays, start time, and end time.
- Schedule generation rejects any class section that overlaps a custom commitment.
- Commitments appear directly on the generated weekly calendar and exported schedule image.
- Copy-link sharing preserves custom commitments.
- The calendar automatically expands when a class or commitment falls outside the normal 8 AM-8 PM display window.

Example: add `Sailing`, select Monday and Wednesday, set 12:00 PM to 3:00 PM, and the generator will exclude every schedule containing a class that overlaps that block.
