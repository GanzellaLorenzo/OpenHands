import { http, delay, HttpResponse } from "msw";
import { WebClientConfig } from "#/api/option-service/option.types";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { Provider, Settings } from "#/types/settings";

const MOCK_SDK_SETTINGS_SCHEMA: NonNullable<Settings["sdk_settings_schema"]> = {
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
          default: DEFAULT_SETTINGS.llm_model,
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
};

export const MOCK_DEFAULT_USER_SETTINGS: Settings = {
  llm_model: DEFAULT_SETTINGS.llm_model,
  llm_base_url: DEFAULT_SETTINGS.llm_base_url,
  llm_api_key: null,
  llm_api_key_set: DEFAULT_SETTINGS.llm_api_key_set,
  search_api_key_set: DEFAULT_SETTINGS.search_api_key_set,
  agent: DEFAULT_SETTINGS.agent,
  language: DEFAULT_SETTINGS.language,
  confirmation_mode: DEFAULT_SETTINGS.confirmation_mode,
  security_analyzer: DEFAULT_SETTINGS.security_analyzer,
  remote_runtime_resource_factor:
    DEFAULT_SETTINGS.remote_runtime_resource_factor,
  provider_tokens_set: {},
  enable_default_condenser: DEFAULT_SETTINGS.enable_default_condenser,
  condenser_max_size: DEFAULT_SETTINGS.condenser_max_size,
  enable_sound_notifications: DEFAULT_SETTINGS.enable_sound_notifications,
  enable_proactive_conversation_starters:
    DEFAULT_SETTINGS.enable_proactive_conversation_starters,
  enable_solvability_analysis: DEFAULT_SETTINGS.enable_solvability_analysis,
  user_consents_to_analytics: DEFAULT_SETTINGS.user_consents_to_analytics,
  max_budget_per_task: DEFAULT_SETTINGS.max_budget_per_task,
  sdk_settings_schema: MOCK_SDK_SETTINGS_SCHEMA,
  sdk_settings_values: {
    "critic.mode": "finish_and_message",
    "critic.enabled": false,
    "llm.api_key": null,
    "llm.model": DEFAULT_SETTINGS.llm_model,
  },
};

const MOCK_USER_PREFERENCES: {
  settings: Settings | null;
} = {
  settings: null,
};

// Reset mock
export const resetTestHandlersMockSettings = () => {
  MOCK_USER_PREFERENCES.settings = MOCK_DEFAULT_USER_SETTINGS;
};

// --- Handlers for options/config/settings ---

export const SETTINGS_HANDLERS = [
  http.get("/api/options/models", async () =>
    HttpResponse.json([
      "gpt-3.5-turbo",
      "gpt-4o",
      "gpt-4o-mini",
      "anthropic/claude-3.5",
      "anthropic/claude-sonnet-4-20250514",
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-haiku-4-5-20251001",
      "anthropic/claude-opus-4-5-20251101",
      "openhands/claude-sonnet-4-20250514",
      "openhands/claude-sonnet-4-5-20250929",
      "openhands/claude-haiku-4-5-20251001",
      "openhands/claude-opus-4-5-20251101",
      "sambanova/Meta-Llama-3.1-8B-Instruct",
    ]),
  ),

  http.get("/api/options/agents", async () =>
    HttpResponse.json(["CodeActAgent", "CoActAgent"]),
  ),

  http.get("/api/options/security-analyzers", async () =>
    HttpResponse.json(["llm", "none"]),
  ),

  http.get("/api/v1/web-client/config", () => {
    const mockSaas = import.meta.env.VITE_MOCK_SAAS === "true";

    const config: WebClientConfig = {
      app_mode: mockSaas ? "saas" : "oss",
      posthog_client_key: "fake-posthog-client-key",
      feature_flags: {
        enable_billing: false,
        hide_llm_settings: mockSaas,
        enable_jira: false,
        enable_jira_dc: false,
        enable_linear: false,
        hide_users_page: false,
        hide_billing_page: false,
        hide_integrations_page: false,
      },
      providers_configured: [],
      maintenance_start_time: null,
      // Uncomment the following to test the maintenance banner
      // maintenance_start_time: "2024-01-15T10:00:00-05:00", // EST timestamp
      auth_url: null,
      recaptcha_site_key: null,
      faulty_models: [],
      error_message: null,
      updated_at: new Date().toISOString(),
      github_app_slug: mockSaas ? "openhands" : null,
    };

    return HttpResponse.json(config);
  }),

  http.get("/api/settings", async () => {
    await delay();
    const { settings } = MOCK_USER_PREFERENCES;

    if (!settings) return HttpResponse.json(null, { status: 404 });

    return HttpResponse.json(settings);
  }),

  http.post("/api/settings", async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown> | null;

    if (body) {
      const current = MOCK_USER_PREFERENCES.settings || {
        ...MOCK_DEFAULT_USER_SETTINGS,
      };
      const sdkFieldKeys = new Set(
        current.sdk_settings_schema?.sections.flatMap((section) =>
          section.fields.map((field) => field.key),
        ) ?? [],
      );
      const sdkSettingsValues = {
        ...(current.sdk_settings_values ?? {}),
      };

      for (const [key, value] of Object.entries(body)) {
        if (sdkFieldKeys.has(key)) {
          sdkSettingsValues[key] =
            typeof value === "boolean" ||
            typeof value === "number" ||
            typeof value === "string" ||
            value === null
              ? value
              : null;
        }
      }

      MOCK_USER_PREFERENCES.settings = {
        ...current,
        ...(body as Partial<Settings>),
        sdk_settings_values: sdkSettingsValues,
      };

      return HttpResponse.json(null, { status: 200 });
    }

    return HttpResponse.json(null, { status: 400 });
  }),

  http.post("/api/add-git-providers", async ({ request }) => {
    const body = await request.json();

    if (typeof body === "object" && body?.provider_tokens) {
      const rawTokens = body.provider_tokens as Record<
        string,
        { token?: string }
      >;

      const providerTokensSet: Partial<Record<Provider, string | null>> =
        Object.fromEntries(
          Object.entries(rawTokens)
            .filter(([, val]) => val?.token)
            .map(([provider]) => [provider as Provider, ""]),
        );

      MOCK_USER_PREFERENCES.settings = {
        ...(MOCK_USER_PREFERENCES.settings || MOCK_DEFAULT_USER_SETTINGS),
        provider_tokens_set: providerTokensSet,
      };

      return HttpResponse.json(true, { status: 200 });
    }

    return HttpResponse.json(null, { status: 400 });
  }),
];
