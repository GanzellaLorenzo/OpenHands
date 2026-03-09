import { describe, expect, it } from "vitest";

import {
  buildInitialSettingsFormValues,
  buildSdkSettingsPayload,
  getVisibleSettingsSections,
  hasAdvancedSettingsOverrides,
} from "./sdk-settings-schema";
import { Settings } from "#/types/settings";

const BASE_SETTINGS: Settings = {
  agent: "CodeActAgent",
  condenser_max_size: 240,
  confirmation_mode: false,
  email: "",
  email_verified: true,
  enable_default_condenser: true,
  enable_proactive_conversation_starters: false,
  enable_solvability_analysis: false,
  enable_sound_notifications: false,
  git_user_email: "openhands@all-hands.dev",
  git_user_name: "openhands",
  language: "en",
  llm_api_key: null,
  llm_api_key_set: false,
  llm_base_url: "",
  llm_model: "openai/gpt-4o",
  max_budget_per_task: null,
  provider_tokens_set: {},
  remote_runtime_resource_factor: 1,
  search_api_key: "",
  search_api_key_set: false,
  sdk_settings_schema: {
    model_name: "AgentSettings",
    sections: [
      {
        key: "llm",
        label: "LLM",
        fields: [
          {
            key: "llm.model",
            label: "Model",
            widget: "text",
            section: "llm",
            section_label: "LLM",
            order: 10,
            default: "claude-sonnet-4-20250514",
            choices: [],
            depends_on: [],
            advanced: false,
            secret: false,
            required: true,
          },
          {
            key: "llm.api_key",
            label: "API key",
            widget: "password",
            section: "llm",
            section_label: "LLM",
            order: 20,
            default: null,
            choices: [],
            depends_on: [],
            advanced: false,
            secret: true,
            required: false,
          },
        ],
      },
      {
        key: "critic",
        label: "Critic",
        fields: [
          {
            key: "critic.enabled",
            label: "Enable critic",
            widget: "boolean",
            section: "critic",
            section_label: "Critic",
            order: 10,
            default: false,
            choices: [],
            depends_on: [],
            advanced: false,
            secret: false,
            required: true,
          },
          {
            key: "critic.mode",
            label: "Critic mode",
            widget: "select",
            section: "critic",
            section_label: "Critic",
            order: 20,
            default: "finish_and_message",
            choices: [
              { label: "finish_and_message", value: "finish_and_message" },
              { label: "all_actions", value: "all_actions" },
            ],
            depends_on: ["critic.enabled"],
            advanced: true,
            secret: false,
            required: true,
          },
        ],
      },
    ],
  },
  sdk_settings_values: {
    "critic.mode": "finish_and_message",
    "critic.enabled": false,
    "llm.model": "openai/gpt-4o",
  },
  security_analyzer: null,
  user_consents_to_analytics: false,
  v1_enabled: false,
};

describe("sdk settings schema helpers", () => {
  it("builds initial form values from the current settings", () => {
    expect(buildInitialSettingsFormValues(BASE_SETTINGS)).toEqual({
      "critic.mode": "finish_and_message",
      "critic.enabled": false,
      "llm.api_key": "",
      "llm.model": "openai/gpt-4o",
    });
  });

  it("detects advanced overrides from non-default values", () => {
    expect(hasAdvancedSettingsOverrides(BASE_SETTINGS)).toBe(false);

    expect(
      hasAdvancedSettingsOverrides({
        ...BASE_SETTINGS,
        sdk_settings_values: {
          ...BASE_SETTINGS.sdk_settings_values,
          "critic.mode": "all_actions",
        },
      }),
    ).toBe(true);
  });

  it("filters advanced and dependent fields based on current values", () => {
    const values = buildInitialSettingsFormValues(BASE_SETTINGS);

    expect(
      getVisibleSettingsSections(
        BASE_SETTINGS.sdk_settings_schema!,
        values,
        false,
      ),
    ).toEqual([
      {
        key: "llm",
        label: "LLM",
        fields: BASE_SETTINGS.sdk_settings_schema!.sections[0].fields,
      },
      {
        key: "critic",
        label: "Critic",
        fields: [BASE_SETTINGS.sdk_settings_schema!.sections[1].fields[0]],
      },
    ]);

    expect(
      getVisibleSettingsSections(
        BASE_SETTINGS.sdk_settings_schema!,
        { ...values, "critic.enabled": true },
        true,
      )[1].fields,
    ).toHaveLength(2);
  });

  it("builds a typed payload from dirty schema values", () => {
    const payload = buildSdkSettingsPayload(
      BASE_SETTINGS.sdk_settings_schema!,
      {
        ...buildInitialSettingsFormValues(BASE_SETTINGS),
        "critic.enabled": true,
        "llm.api_key": "new-key",
      },
      {
        "critic.enabled": true,
        "llm.api_key": true,
        "llm.model": false,
      },
    );

    expect(payload).toEqual({
      "critic.enabled": true,
      "llm.api_key": "new-key",
    });
  });
});
