# Data Table Pattern

## Purpose

Use one shared table contract for operational collections. Users should not have to
relearn search, filters, columns, pagination, or actions in each module.

## Standard Anatomy

1. Compact title/description only when not already supplied by the page.
2. Search input.
3. Two or three high-value filters; move the rest into an advanced filter dialog.
4. `Columnas` visibility control when the table has optional columns.
5. Refresh, export, import, or create actions when applicable.
6. Sortable header, rows, and one actions column.
7. Footer with result range, page size, numeric page state, and first/previous/next/last controls.

Keep controls in the same order and pagination component across the application.

Alignment must also hold from one module to the next: the same control heights, the same
cell padding, numbers aligned the same way, and the actions column at the same edge. A
user moving between modules should not notice the table change.

## Shared Component Contract

The application table should support:

- typed column definitions;
- global search with debounce when server-backed;
- explicit select/date/status filters;
- sorting;
- column visibility;
- client or server pagination through the same UI;
- loading skeletons that preserve column geometry;
- an informative empty state;
- permission-aware and state-aware row actions;
- selection only when a real bulk workflow exists;
- responsive overflow without shrinking text into illegibility.

Do not copy table markup per module. Add configuration or a reusable extension point.

## Filters And URL State

- Filters live with the table they affect.
- Use business labels and recognizable values.
- Keep important shareable filters, sort, and page in the URL when deep links matter.
- Reset the page when a filter changes.
- Debounce free-text search; do not debounce bounded selects.
- Provide `Limpiar filtros` only when at least one filter is active.
- Show active advanced filters as removable labels when they are otherwise hidden.
- Validate structured filters such as dates, references, or ranges before querying.

Avoid a separate oversized filter card above the table.

## Columns

- Put the primary identity first.
- Combine closely related secondary information in one cell when it improves scanning.
- Align numbers consistently and format them for the user's locale.
- Keep status concise and semantic.
- Keep the actions column last, stable, and narrow.
- Hide raw IDs, database timestamps, storage paths, and technical metadata by default.
- Do not allow column visibility to hide the only meaningful record identity or action access.

Column names, empty values, and units must be understandable without source-code knowledge.

## Visual Encoding

Let the user recognize a value without reading every cell.

- Use one shared status badge for every state column in the application.
- Encode meaning with an icon, a dot, or text in addition to color. Color alone is not a state.
- Keep the same value in the same treatment everywhere; a state must not change color between modules.
- Add a badge, icon, or inline control only when it speeds a decision. Plain text is correct for the rest.
- Keep badge and control dimensions stable so rows do not change height.
- Use an inline control in a cell only for a reversible change with immediate feedback.
- Do not color whole rows for routine states; reserve that for a condition that needs attention now.

## Row Actions

- Use familiar Lucide icons with accessible names and opaque light/dark tooltips.
- Edit, inspect, download, retry, activate, deactivate, archive, or delete only when valid for the row state and current permission.
- Disable with an explanation when the action is visible but temporarily unavailable.
- Confirm destructive or irreversible actions.
- Open detail from the row instead of keeping a permanent side panel beside the table.
- Avoid generic overflow menus when two or three visible icons are faster and unambiguous.

## Pagination

Every table uses the same footer language and geometry:

- `Mostrando A-B de N`;
- `Filas` page-size selector;
- first, previous, current page indicator or page numbers, next, and last;
- disabled boundary controls;
- stable dimensions so controls do not shift.

Server pagination returns total records and deterministic ordering. Selected records for
a real multi-page workflow must persist across page changes until the workflow is
completed or explicitly cleared.

## Empty, Loading, And Error States

- Loading: render row skeletons inside the existing table frame.
- Empty collection: explain what can be created and offer the valid primary action.
- No filter results: state that filters returned no matches and offer to clear them.
- Error: keep the table frame, show a concise message and retry action.
- Partial data: render available columns and disclose which secondary data failed.

Do not replace the entire page with a spinner for routine table refreshes.

## Responsive Behavior

- Let dense tables scroll horizontally within their surface.
- Keep primary identity and actions reachable.
- Allow toolbar controls to wrap into logical rows.
- Do not turn every table into unrelated cards unless the mobile task truly benefits.
- Use sticky headers only when they do not cover page controls or modal headers.
- Test long unbroken values and 200% zoom.

## Table Review

Reject the implementation when:

- pagination differs from neighboring modules;
- controls, alignment, or spacing drift from neighboring modules;
- filters sit in a detached decorative section;
- row actions lack tooltips or feedback;
- the table exposes internal identifiers;
- a state is communicated only by color;
- changing pages loses intentional selection;
- loading causes layout jumps;
- mobile content overlaps or becomes unreachable;
- summary cards repeat what the table already communicates.
