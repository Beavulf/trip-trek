# Mobile UX pass B — design (approved)

> **Исторический документ** (снимок на дату в имени файла): план/спека реализованы, чекбоксы не поддерживаются — не принимай за план. Актуальное поведение — код и [glossary.md](../../glossary.md).

**Scope:** Shell-first + Map + Budget. No tab redesign / no bottom-nav rebuild.

## Done in code (v0.2.3)

1. viewport-fit=cover + safe-area plumbing  
2. Mobile header declutter (⋯ menu) + visible day/city  
3. Tabs ≥44px + chip-snap  
4. `--app-header-offset` / `.sticky-under-shell`  
5. Inputs 16px (QuickAdd, search, board)  
6. Map filters collapse on phone + dvh map height  
7. Budget delete/confirm + amount fields; PlaceRow check ≥44px  

See `docs/archive/PATCHNOTES.md`.
