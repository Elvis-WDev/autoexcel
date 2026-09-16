# Frontend Review Checklist

Use this checklist before completing any user-visible screen.

## Task And Hierarchy

- [ ] The primary user, task, and action are clear.
- [ ] The chosen surface matches the workflow: table, modal, detail, dashboard, or full page.
- [ ] Sections that own records, actions, or permissions are sidebar submodules, not tabs.
- [ ] Everything the module offers works end to end: list, create, edit, detail, and removal.
- [ ] Page title, module title, description, and summaries are not duplicated.
- [ ] Filters and actions are attached to the content they affect.
- [ ] No card, panel, KPI, helper text, or decorative element exists without a user benefit.
- [ ] The screen remains understandable without implementation knowledge.

## Data And Language

- [ ] Labels use business language.
- [ ] Raw IDs, enum tokens, provider names, storage paths, auth internals, and secret references are hidden.
- [ ] Relationships use searchable selectors or selection tables, not free-text IDs.
- [ ] Backend-generated values are not requested from the user.
- [ ] Numbers, money, dates, times, percentages, and empty values are consistently formatted.
- [ ] Copy addresses the user directly, with no third-person narration, internal process detail, or specification references.

## Tables

- [ ] Shared table and pagination components are used.
- [ ] Search, filters, sorting, columns, and row actions follow the application contract.
- [ ] Pagination is deterministic and matches every other module.
- [ ] Control order, alignment, and spacing match the other modules.
- [ ] States use the shared badge with an icon or dot, never color alone.
- [ ] Loading, empty collection, no matches, partial data, and error states are covered.
- [ ] Row actions are valid for permission and record state.
- [ ] Icon actions have opaque light/dark tooltips and accessible names.
- [ ] Mobile overflow and long values remain usable.

## Forms And Dialogs

- [ ] The form uses React Hook Form and Zod.
- [ ] Labels, required state, helper text, and errors are associated correctly.
- [ ] Conditional fields hide, clear, and validate correctly.
- [ ] Sensitive values remain masked and are never returned in plaintext.
- [ ] Duplicate submission is prevented.
- [ ] Failed submission preserves user input and focuses useful recovery context.
- [ ] Modal focus, Escape, close, overlay, scroll, and mobile behavior work.
- [ ] A complex or high-risk workflow uses a full page when a modal would be cramped.
- [ ] Create and edit use a modal, or the specification records why the full page was needed.
- [ ] Irreversible deletion requires typed confirmation; reversible actions take one step.
- [ ] File upload, replacement, rename, and removal work with per-file state.

## Feedback And State

- [ ] Every command has pending, success, and error feedback.
- [ ] Every mutation goes through the shared feedback helper instead of ad hoc handling.
- [ ] No asynchronous path ends without a handled outcome.
- [ ] Routine success/error uses the shared semantic toast.
- [ ] Persistent notices are reserved for persistent conditions.
- [ ] Toasts are not clipped and remain readable in both themes and mobile.
- [ ] Unknown errors are sanitized; diagnostics stay in logs.
- [ ] Durable background work survives closing a modal or navigating when required.
- [ ] Stale requests cannot overwrite newer scope or filter state.

## Navigation And Responsive

- [ ] Navigation has no more than two visible levels.
- [ ] Reordered navigation persists per user and offers a keyboard alternative.
- [ ] Only the selected destination has the solid active state.
- [ ] Chevrons appear only on expandable parents.
- [ ] Desktop sidebar and mobile drawer expose the same authorized destinations.
- [ ] Header controls are stable, borderless where appropriate, and at least 44px targets.
- [ ] No overlap occurs at 320px, 768px, 1024px, 1440px, or 200% zoom.
- [ ] Long text wraps or truncates predictably.

## Performance

- [ ] Lists are paginated or virtualized; nothing unbounded feeds the screen.
- [ ] Images declare dimensions and lazy-load below the fold.
- [ ] Heavy, rarely used features are code-split.
- [ ] No new N+1 request pattern or avoidable request waterfall.

## Theme And Accessibility

- [ ] Light and dark themes cover page, modal, popover, tooltip, toast, input, table, and charts.
- [ ] Keyboard-only navigation and visible focus work.
- [ ] Heading order and landmarks are logical.
- [ ] Status is not communicated only through color.
- [ ] Contrast meets 4.5:1 for body text and 3:1 for large text and meaningful icons.
- [ ] Touch targets are at least 44px.
- [ ] Reduced motion is respected for nonessential animation.

## Verification Evidence

- [ ] Relevant unit/component tests pass.
- [ ] Critical flow is covered by an integration or end-to-end test.
- [ ] Desktop and mobile screenshots were inspected when layout changed.
- [ ] Browser console has no new errors or hydration warnings.
- [ ] Lint, typecheck, test, and build commands pass.
- [ ] Create, edit, detail, and removal were exercised against the real backend, not mocks.
- [ ] Each requested criterion is reported as met or as a declared exception with its reason.
