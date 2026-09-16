# Navigation, Header, Themes, And Responsive Behavior

## Navigation Hierarchy

Use at most two visible levels:

1. Module or workflow group.
2. Direct destination.

Avoid third-level navigation, boxed submenus inside boxed modules, and multiple menu
entries that represent only filtered states of the same destination. Put those states in
the destination's filters or internal view selector.

When a module has only one destination, link the module directly instead of forcing an
unnecessary expand/collapse step.

## Submodules Instead Of Tabs

A module that covers several areas exposes them as submodules under its sidebar group,
never as tabs that split one page into several.

A section is a submodule when it has any of:

- its own collection of records;
- its own create, edit, or delete actions;
- its own permission;
- a URL worth linking, reloading, or sharing directly.

Tabs and segmented controls remain valid only for switching lenses over data already on
screen: a filtered view of the same collection, a table/chart toggle, or grouped read-only
detail of one open record. They must never stand in for a destination.

This keeps every destination visible in the sidebar, keeps deep links and reloads working,
and stops one page from silently growing into several unrelated screens.

## Sidebar

- Use plain labels with consistent Lucide icons, not a stack of decorative boxes.
- Chevrons belong only to expandable parents.
- Apply the solid active treatment only to the selected destination.
- Keep a selected child visually distinct without making its parent look selected.
- Use a small consistent radius for active/hover states.
- Group destinations by user workflow and permissions, not backend package structure.
- Keep configuration and help in predictable lower positions.
- Hide destinations the user cannot access, but enforce permissions again on routes and APIs.

Desktop may keep frequently used groups expanded when the number of destinations remains
scannable. Mobile should collapse groups to preserve space.

## Reorderable Navigation

Let users drag navigation groups and destinations into their own order when the product
serves operators who return to the same few screens every day.

- Persist the order per user; a reload or a new session must not reset it.
- Provide a keyboard-accessible alternative to dragging.
- Show a clear drag affordance, an obvious drop target, and the resulting position.
- Reordering changes presentation only. It never changes permissions, routes, or which destinations exist.
- Keep the drag gesture from competing with normal selection, especially on touch.
- Offer a way back to the default order.

## Header

The authenticated header should remain compact and stable:

- mobile menu control when the sidebar is hidden;
- current context or breadcrumb and page title;
- theme control;
- avatar menu for profile and sign-out actions.

Use borderless icon controls when their grouping is already clear. Keep icon size medium,
touch targets at least 44px, and avoid displaying a long account name when the avatar
menu can provide it.

Do not duplicate the same module title immediately below the header.

## Mobile Navigation

- Hide the desktop sidebar at the chosen breakpoint.
- Open the same permission-aware navigation in a drawer.
- Provide a visible medium-size close button.
- Close on destination selection, Escape, overlay click, or explicit close.
- Prevent background scroll while open.
- Restore focus to the menu button on close.
- Keep navigation labels readable without horizontal scrolling.

## Responsive Layout

- Define stable responsive constraints for tables, boards, toolbars, counters, and fixed-format controls.
- Let toolbars wrap by control group rather than compressing inputs below usable width.
- Use one column for forms when side-by-side fields become cramped.
- Keep modal height within the viewport and scroll its body.
- Ensure long words, emails, references, and translated labels wrap or truncate with a discoverable full value.
- Do not scale type continuously with viewport width.
- Do not allow controls, text, or overlays to cover adjacent content.
- Test at 320px, 768px, 1024px, and 1440px, plus 200% zoom and browser text enlargement.

## Dark And Light Themes

- Use semantic CSS variables, never module-local hardcoded theme colors.
- When one product ships both an operational panel and a public site, keep their token sets in separate namespaces so restyling one cannot alter the other.
- Verify background, foreground, border, input, popover, tooltip, toast, destructive, and focus colors in both themes.
- Keep data visualizations legible and distinguishable without relying only on hue.
- Persist the user's explicit preference and respect system preference before one is chosen.
- Avoid flashes of the wrong theme during initial render.

## Density And Sizing

- Use medium, consistent icons throughout headers, forms, tables, dialogs, and navigation.
- Keep icon buttons and counters dimensionally stable so hover or loading states do not shift layout.
- Keep compact headings inside dense surfaces; reserve hero scale for actual hero experiences.
- Prefer a restrained multi-neutral palette with semantic accents over a one-hue interface.

## Accessibility

The baseline is WCAG 2.1 level AA.

- Use landmarks and one logical heading hierarchy, without skipping levels.
- Preserve visible focus and keyboard order.
- Give icon-only buttons accessible names.
- Associate labels, descriptions, and errors with form controls.
- Ensure dialogs manage focus and announce their title.
- Do not communicate status only through color.
- Meet contrast in every theme and interaction state: 4.5:1 for body text, 3:1 for large text and meaningful non-text elements.
