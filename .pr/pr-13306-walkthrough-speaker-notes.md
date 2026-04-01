# PR #13306 Walkthrough Speaker Notes

## Goal

Explain the PR as an end-to-end settings architecture refactor:

> This PR makes the SDK settings schema the source of truth, exposes it through the backend, simplifies runtime agent creation, and lets the frontend render settings generically, including moving the LLM page onto the shared settings shell with only small overrides.

---

## Exact files to show, in order

1. `openhands/storage/data_models/settings.py`
2. `openhands/server/routes/settings.py`
3. `openhands/app_server/app_conversation/live_status_app_conversation_service.py`
4. `frontend/src/types/settings.ts`
5. `frontend/src/utils/sdk-settings-schema.ts`
6. `frontend/src/components/features/settings/sdk-settings/schema-field.tsx`
7. `frontend/src/components/features/settings/sdk-settings/sdk-section-page.tsx`
8. `frontend/src/routes/llm-settings.tsx`
9. `frontend/src/constants/settings-nav.tsx`
10. `frontend/src/routes.ts`
11. `frontend/src/routes/verification-settings.tsx`
12. `frontend/src/routes/condenser-settings.tsx`
13. `frontend/src/routes/mcp-settings.tsx`
14. `frontend/src/hooks/query/use-settings.ts`
15. `frontend/src/hooks/mutation/use-save-settings.ts`
16. `enterprise/migrations/versions/102_add_agent_settings_to_enterprise_settings.py`
17. `enterprise/storage/agent_settings_utils.py`

---

## Opening (30 seconds)

Say:

"I'm going to explain this PR in five parts: the new settings model, how the backend API exposes it, how runtime agent creation got simplified, how the frontend became schema-driven, and how enterprise storage was migrated to support it."

---

## 1) The new canonical settings model

### File
`openhands/storage/data_models/settings.py`

### Show
- legacy-to-SDK mapping near the top
- the `Settings` model definition
- `agent_settings_values()`, `normalize_agent_settings()`, `_migrate_legacy_fields()`, `to_agent_settings()`

### Say

"This is the heart of the PR.

The biggest conceptual change is that SDK-owned settings are now treated as structured agent settings instead of scattered flat fields.

At the top, there is a legacy-to-SDK mapping. For example:
- `llm_model` becomes `llm.model`
- `confirmation_mode` becomes `verification.confirmation_mode`
- `condenser_max_size` becomes `condenser.max_size`

So the system is moving toward a canonical dotted-key representation.

In the `Settings` model itself, the key persisted field is `raw_agent_settings`, exposed as `agent_settings`. That becomes the source of truth for agent-related configuration.

This model now handles four things:
1. migrating legacy fields into agent settings,
2. normalizing persisted values,
3. rebuilding typed SDK `AgentSettings`,
4. and emitting a canonical flat representation for storage.

So instead of backend logic piecing settings together in ad hoc ways, the settings model itself now owns the translation between stored values and actual SDK settings."

### Sound bite
> This file turns settings from a loose collection of app fields into a canonical SDK-backed settings model.

---

## 2) The backend settings API now exposes schema + values

### File
`openhands/server/routes/settings.py`

### Show
- `_get_agent_settings_schema()`
- `_extract_agent_settings()`
- `_apply_settings_payload()`
- GET response construction with `agent_settings_schema` + `agent_settings`
- POST logic that accepts dotted SDK keys

### Say

"Once the backend has a canonical settings model, the next step is exposing it cleanly through the settings API.

This route now does two important things.

First, on GET, it returns:
- the SDK settings schema,
- and the current agent settings values.

That means the frontend can ask the backend what settings exist, what type they are, which ones are secrets, and what the current values are.

Second, on POST, it accepts dotted SDK keys alongside legacy field names and applies them into the canonical settings model.

This is also where secret handling is made safe:
- secrets are redacted on read,
- but preserved correctly on update.

So the settings API becomes the bridge between the SDK schema and the UI."

### Sound bite
> The settings API is now schema-aware, not just value-aware.

---

## 3) Runtime agent creation becomes settings-transparent

### File
`openhands/app_server/app_conversation/live_status_app_conversation_service.py`

### Show
- `_get_agent_settings()`
- `_merge_custom_mcp_config()`
- `_configure_llm_and_mcp()`
- `_create_agent()` calling `AgentSettings.create_agent()`

### Say

"This is where the architectural payoff shows up.

Before this PR, agent creation involved more hidden logic: backend defaults, patches, special-case critic behavior, and runtime overrides.

Now `_get_agent_settings()` is very small. It takes the user's settings and optionally applies a model override.

Then `_create_agent()` builds the runtime-specific pieces like tools, MCP config, agent context, and prompt suffixes, and hands the result to `AgentSettings.create_agent()`.

That is the big simplification: the backend is no longer inventing agent behavior during construction. It resolves settings, adds runtime-only context, and lets the SDK instantiate the agent.

That makes behavior much easier to reason about and debug."

### Sound bite
> Agent creation is now: resolve settings, add runtime context, create the agent.

---

## 4) Frontend gets an explicit schema contract

### File
`frontend/src/types/settings.ts`

### Show
- `SettingsFieldSchema`
- `SettingsSectionSchema`
- `SettingsSchema`
- `SettingProminence`
- `agent_settings_schema`
- `agent_settings`

### Say

"On the frontend, the first change is the data contract.

This file adds explicit types for settings schema, sections, fields, value types, prominence levels, and the `agent_settings` payload itself.

So the UI is no longer just consuming a handful of known fields. It now understands a typed schema coming from the backend."

### Sound bite
> The frontend now has a formal type system for schema-driven settings.

---

## 5) The frontend utility layer turns schema into UX behavior

### File
`frontend/src/utils/sdk-settings-schema.ts`

### Show
- `SettingsView`
- `VIEW_PROMINENCES`
- `inferInitialView()`
- `isSettingsFieldVisible()`
- `buildSdkSettingsPayload()`

### Say

"This utility file is where raw schema becomes actual UX behavior.

Three important things happen here.

First, settings are grouped by prominence:
- critical,
- major,
- minor.

That powers the new view tiers:
- Basic for `critical` fields,
- Advanced for `major` fields,
- All for `minor` fields too.

A useful reviewer-facing nuance here is that Advanced is no longer shown just because a page has any non-critical fields. Minor-only pages like Condenser now show Basic and All, which avoids the empty or misleading Advanced tab that came up in review.

Second, it can infer the initial view from the user's current settings, so if a user has overridden more advanced settings, the UI opens at the right depth.

Third, it handles generic conversion logic for reading values, deciding visibility via `depends_on`, coercing booleans and numbers and JSON, and building the save payload.

So this is really the brain of the schema-driven frontend."

### Sound bite
> This file converts raw schema into actual settings UX behavior.

---

## 6) Generic field rendering replaces bespoke field UIs

### File
`frontend/src/components/features/settings/sdk-settings/schema-field.tsx`

### Show
- boolean rendering path
- dropdown rendering path
- JSON/object rendering path
- standard text/number/secret input rendering path

### Say

"This component is the generic field renderer.

Instead of hand-writing a UI for every setting, it can render:
- switches for booleans,
- dropdowns for choice fields,
- textareas for JSON/object fields,
- and standard inputs for strings, numbers, and secrets.

It also handles required vs optional behavior, can attach help content by field key, and now renders URL-like schema fields with URL inputs instead of generic text boxes.

This is a big maintainability win because adding a new SDK setting often just means adding it to the schema instead of building a custom frontend component."

### Sound bite
> New settings become cheaper because the UI is driven by metadata, not custom code.

---

## 7) Generic section pages replace custom settings screens

### File
`frontend/src/components/features/settings/sdk-settings/sdk-section-page.tsx`

### Show
- `ViewToggle`
- filtered schema by section
- visible sections computation
- `handleSave()`
- sticky save button

### Say

"This is the generic page shell that brings the schema-driven settings approach together.

It loads the schema and values, filters to the section it owns, chooses whether to show Basic, Advanced, or All, renders the visible fields, tracks dirty state, and saves only changed settings.

The most important late-stage refinement is that this shell now has a few narrow override hooks, so the LLM page can reuse the same component while still customizing its initial view, payload shaping, and save-success behavior. That keeps the LLM page aligned with the shared architecture instead of forking its own form again.

So this is where the frontend moves from hardcoded settings screens to a reusable schema-driven page architecture."

### Sound bite
> This component is the reusable page shell for schema-driven settings sections.

---

## 7b) LLM is now using the same shared shell with minimal divergence

### File
`frontend/src/routes/llm-settings.tsx`

### Show
- `SdkSectionPage` usage
- custom `getInitialView`
- custom `buildPayload`
- `extraDirty`
- `onSaveSuccess`

### Say

"This file is worth showing because it answers the obvious reviewer question: if the frontend is now schema-driven, what happened to the most custom settings page we had?

The answer is that LLM now also uses `SdkSectionPage`, but with a few targeted overrides.

That means we keep the shared rendering, shared dirty tracking, shared view toggle logic, and shared save path, while still supporting LLM-specific behavior like provider model selection, legacy compatibility, and custom success handling.

So the end state is not 'every page is identical.' The end state is 'every page uses the same shell unless it has a very specific reason not to.'"

### Sound bite
> The LLM page is no longer a separate architecture; it is the same shared architecture with a few intentional hooks.

---


## 8) Settings navigation is restructured around the new sections

### File
`frontend/src/constants/settings-nav.tsx`

### Show
- new Condenser nav item
- new Verification nav item
- both OSS and SaaS nav lists

### Say

"The schema-driven model also changes the settings information architecture.

Instead of overloading one page, settings are now organized more clearly into distinct navigation entries like:
- LLM,
- Condenser,
- Verification,
- MCP,
- Application,
- Secrets.

That makes the settings system more modular and better aligned with the new schema sections."

---

## 9) New routes reflect the new information architecture

### File
`frontend/src/routes.ts`

### Show
- `/settings/condenser`
- `/settings/verification`

### Say

"You can see that reflected in routing too.

The settings area now has dedicated routes for condenser and verification settings, instead of making those options live implicitly inside another screen."

---

## 10) New section route files are intentionally tiny

### Files
- `frontend/src/routes/verification-settings.tsx`
- `frontend/src/routes/condenser-settings.tsx`

### Show
Both full files.

### Say

"These files are intentionally tiny, and that is actually the point.

Each route just says: render the schema-driven section for this category.

That tells us the abstraction is working, because new settings pages become almost trivial once the generic schema layer exists."

### Reviewer follow-up to mention briefly
- `mcp-settings.tsx` also picked up small polish from review: it now hides the duplicate outer title and uses the shared typography primitives for a cleaner page header.
- If someone asks why the page spacing or headings look different from an earlier screenshot, this is the reason.

### Sound bite
> New settings pages are now mostly configuration, not implementation.

---

## 11) Read-side compatibility: old fields and new schema coexist

### File
`frontend/src/hooks/query/use-settings.ts`

### Show
- fallback logic that reads from either legacy fields or `agent_settings`
- default assignment for LLM, confirmation mode, condenser, MCP, schema

### Say

"This hook handles the read-side compatibility story.

It loads the settings payload and normalizes values from either legacy top-level fields or the new SDK agent settings.

That matters because this PR is a migration, not a flag-day rewrite. The frontend can still work while the backend transitions to the new schema model."

---

## 12) Write-side compatibility: saves are translated into dotted SDK keys

### File
`frontend/src/hooks/mutation/use-save-settings.ts`

### Show
- `LEGACY_FLAT_TO_SDK`
- payload cleanup and trimming
- `SettingsService.saveSettings()`

### Say

"This hook handles the write-side compatibility story.

There is a legacy-to-SDK map here too, so when the frontend saves known legacy fields, they get converted into the canonical dotted-key payload.

That preserves compatibility while pushing the system toward schema-native storage and writes."

### Sound bite
> The hooks let the app migrate gradually instead of all at once.

---

## 13) Enterprise storage is migrated to the same model

### File
`enterprise/migrations/versions/102_add_agent_settings_to_enterprise_settings.py`

### Show
- creation of `agent_settings` columns
- JSON backfill for `user_settings`, `org_member`, and `org`
- dropping old duplicated columns

### Say

"A large part of the PR is enterprise compatibility.

Because agent settings are now canonical JSON settings, enterprise storage had to migrate too.

This migration adds `agent_settings` columns, backfills them from existing flat columns, writes schema version information, and then removes the old duplicated columns.

So enterprise storage is being aligned with the same settings architecture as OSS."

### Sound bite
> Enterprise moves from many legacy columns to one canonical `agent_settings` representation.

---

## 14) Enterprise helper utilities make the new model operational

### File
`enterprise/storage/agent_settings_utils.py`

### Show
- `ensure_schema_version()`
- `merge_agent_settings()`
- org/org-member helpers

### Say

"This helper file handles schema versioning and merge logic for enterprise settings.

It is small, but it is what makes the new settings model operational in org-level and org-member-level enterprise code paths."

---

## Closing (45 seconds)

Say:

"The easiest way to think about this PR is:

- first, it defines a canonical model for SDK-owned settings,
- then it exposes that model and schema through the backend API,
- then it simplifies runtime agent creation to consume those settings directly,
- then it makes the frontend render settings generically from schema,
- and finally it migrates enterprise storage to the same model.

The visible UX change is the clearer settings organization and generic rendering, but the deeper value is that settings are now a shared contract across the SDK, backend, runtime, and frontend."
