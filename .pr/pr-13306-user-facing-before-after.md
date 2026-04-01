# PR #13306 User-Facing Changes: Before vs After

This document focuses only on user-visible behavior changes in PR #13306. Most of the PR is architectural, but these are the changes that are visible in product behavior or settings UX.

---

## Summary

The main user-facing impact of this PR is that the settings experience becomes more structured, more scalable, and more obviously driven by what the SDK supports.

The largest visible changes are:
- clearer settings navigation,
- dedicated settings pages for Condenser and Verification,
- schema-driven rendering of settings fields,
- view tiers for simple vs advanced settings,
- and more consistent handling of saved settings values.

---

## 1) Settings are organized into clearer sections

### Before
- More settings lived together in broader or more implicit screens.
- Condenser and verification-related settings were not exposed as clearly separated top-level destinations.

### After
- Settings navigation includes dedicated top-level entries for:
  - **Condenser**
  - **Verification**
- These appear in both OSS and SaaS navigation.

### User impact
- It is easier to find advanced behavior settings without hunting through the LLM page.
- The information architecture better matches what users are configuring.

### Files
- `frontend/src/constants/settings-nav.tsx`
- `frontend/src/routes.ts`
- `frontend/src/routes/verification-settings.tsx`
- `frontend/src/routes/condenser-settings.tsx`

---

## 2) Settings pages can now render from schema instead of hardcoded UI only

### Before
- Many settings screens depended on hand-built frontend form logic.
- Adding or exposing a new setting usually meant writing or changing custom UI.

### After
- The frontend can render settings fields generically from backend-provided schema metadata.
- Field behavior now comes from schema properties like:
  - type,
  - choices,
  - required/optional,
  - secret,
  - depends_on,
  - prominence.

### User impact
- The UI is more consistent across settings.
- Newly exposed settings can appear with less frontend-specific work.
- The settings surface is more likely to stay aligned with SDK capabilities.

### Files
- `frontend/src/types/settings.ts`
- `frontend/src/utils/sdk-settings-schema.ts`
- `frontend/src/components/features/settings/sdk-settings/schema-field.tsx`
- `frontend/src/components/features/settings/sdk-settings/sdk-section-page.tsx`

---

## 3) Users now get Basic / Advanced / All settings views

### Before
- Settings complexity was less explicitly tiered.
- It was harder to distinguish the core settings a typical user should touch from the more advanced ones.

### After
- Settings can be grouped by prominence into:
  - **Basic**
  - **Advanced**
  - **All**
- The UI can choose an initial view based on whether the user has already overridden more advanced settings.

### User impact
- New or less technical users can focus on essential settings.
- Power users can still reach advanced and minor settings.
- The UI can open at the right complexity level based on the user’s current config.

### Files
- `frontend/src/utils/sdk-settings-schema.ts`
- `frontend/src/components/features/settings/sdk-settings/sdk-section-page.tsx`

---

## 4) Field visibility can now depend on other settings

### Before
- Conditional settings UI logic tended to be encoded manually in screen-specific frontend code.

### After
- The schema supports `depends_on`, and the frontend respects it.
- A field can now appear only when prerequisite settings are enabled.

### User impact
- The UI can hide irrelevant controls until they matter.
- Advanced pages are less noisy and more context-sensitive.

### Files
- `frontend/src/utils/sdk-settings-schema.ts`
- `frontend/src/components/features/settings/sdk-settings/schema-field.tsx`

---

## 5) Different field types are rendered more appropriately

### Before
- Settings fields were more tightly coupled to bespoke UI implementations.

### After
- Field rendering is type-aware:
  - booleans render as toggles,
  - choice fields render as dropdowns,
  - JSON/object values render in textareas,
  - secret values render as password inputs,
  - numeric values render as number inputs.

### User impact
- Inputs are more intuitive.
- Advanced structured settings are editable without special one-off UI.
- Secret settings are presented more safely.

### Files
- `frontend/src/components/features/settings/sdk-settings/schema-field.tsx`

---

## 6) Secret-backed SDK settings are handled more consistently

### Before
- Secret handling in settings was spread across older logic paths and legacy field assumptions.

### After
- Secret SDK fields are returned redacted from the backend and rendered as secret/password inputs in the UI.
- Existing secret values can remain hidden while still being preserved on save if unchanged.

### User impact
- Users are less likely to accidentally overwrite secrets.
- Secret-bearing settings behave more like modern settings forms.

### Files
- `openhands/server/routes/settings.py`
- `frontend/src/components/features/settings/sdk-settings/schema-field.tsx`

---

## 7) Confirmation mode indicators now read from canonical settings

### Before
- Some UI indicators relied on legacy top-level settings fields.

### After
- Confirmation-mode UI reads from the canonical SDK-backed setting path: `verification.confirmation_mode`.

### User impact
- The confirmation mode indicator is more likely to stay accurate as the app migrates to schema-native settings.

### Files
- `frontend/src/components/features/chat/confirmation-mode-enabled.tsx`

---

## 8) Settings saves become more consistent across old and new representations

### Before
- The app relied more on legacy field names and older save assumptions.

### After
- The frontend save path translates legacy field names into canonical SDK dotted keys.
- The frontend read path can resolve values from either source during migration.

### User impact
- Existing settings are less likely to break during the transition.
- Saved values should round-trip more predictably.

### Files
- `frontend/src/hooks/query/use-settings.ts`
- `frontend/src/hooks/mutation/use-save-settings.ts`

---

## 9) Not every change in the PR is user-facing

A large amount of the PR is not directly visible to end users. Those changes are still important, but they mainly support the UX changes above.

Examples of non-user-facing work:
- simplifying backend agent creation,
- migrating enterprise storage to canonical `agent_settings`,
- removing old settings-specific backend mutations,
- updating tests to reflect the new architecture.

---

## Bottom line

If you need one sentence for the walkthrough, use this:

> Before, the settings UX depended heavily on hardcoded frontend forms and scattered backend behavior; after this PR, settings are organized and rendered from a shared schema, with clearer navigation, clearer complexity tiers, and more consistent value handling.
