---
"@ifc-lite/viewer": patch
---

Fix the storey object-count badge's hover card: the secondary breakdown lines (e.g. "3 Walls") were hardcoded `text-zinc-400 dark:text-zinc-500`, which washes out on the tooltip's `bg-primary` surface (Tokyo Night blue, `#7aa2f7` in both themes) — a recurrence of #1218 in a component that never got that fix. They now derive from `text-primary-foreground/80`, the same convention `BsddCard`, `PropertySetCard` and `QuantitySetCard` already use for this surface, measured at 5.05:1 WCAG contrast in dark mode (AA) and 2.13:1 in light mode (up from 1.04:1/1.92:1 before).
