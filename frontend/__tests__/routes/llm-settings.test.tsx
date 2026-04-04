import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsService from "#/api/settings-service/settings-service.api";
import {
  MOCK_DEFAULT_USER_SETTINGS,
  resetTestHandlersMockSettings,
} from "#/mocks/handlers";
import LlmSettingsScreen from "#/routes/llm-settings";
import { useSelectedOrganizationStore } from "#/stores/selected-organization-store";
import { OrganizationMember } from "#/types/org";
import { Settings } from "#/types/settings";

const mockUseSearchParams = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useSearchParams: () => mockUseSearchParams(),
    useRevalidator: () => ({ revalidate: vi.fn() }),
  };
});

const mockUseConfig = vi.fn();
vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => mockUseConfig(),
}));

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
    agent_settings_schema:
      overrides.agent_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema,
  };
}

function buildOrganizationMember(
  overrides: Partial<OrganizationMember> = {},
): OrganizationMember {
  return {
    org_id: "1",
    user_id: "99",
    email: "owner@example.com",
    role: "owner",
    status: "active",
    llm_api_key: "",
    max_iterations: 20,
    llm_model: "",
    llm_base_url: "",
    ...overrides,
  };
}

function buildSettingsWithAdvancedToggle(
  overrides: Partial<Settings> = {},
): Settings {
  const schema = structuredClone(
    overrides.agent_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema!,
  );
  const llmSection = schema.sections.find((section) => section.key === "llm");

  if (
    llmSection &&
    !llmSection.fields.some((field) => field.key === "llm.timeout")
  ) {
    llmSection.fields.push({
      key: "llm.timeout",
      label: "Timeout",
      section: "llm",
      section_label: "LLM",
      value_type: "integer",
      default: null,
      choices: [],
      depends_on: [],
      prominence: "major",
      secret: false,
      required: false,
    });
  }

  return buildSettings({ ...overrides, agent_settings_schema: schema });
}

async function selectProvider(providerLabel: "OpenHands" | "OpenAI") {
  const providerInput = screen.getByTestId("llm-provider-input");
  await userEvent.click(providerInput);
  await userEvent.click(await screen.findByText(providerLabel));
  await waitFor(() => {
    expect(providerInput).toHaveValue(providerLabel);
  });
  return providerInput;
}

function renderLlmSettingsScreen({
  appMode = "oss",
  organizationId = "1",
  meData,
}: {
  appMode?: "oss" | "saas";
  organizationId?: string;
  meData?: OrganizationMember;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  useSelectedOrganizationStore.setState({ organizationId });
  mockUseConfig.mockReturnValue({
    data: { app_mode: appMode },
    isLoading: false,
  });

  if (appMode === "saas") {
    queryClient.setQueryData(
      ["organizations", organizationId, "me"],
      meData ?? buildOrganizationMember({ org_id: organizationId }),
    );
  }

  return render(<LlmSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetTestHandlersMockSettings();
  mockUseSearchParams.mockReturnValue([{ get: () => null }, vi.fn()]);
  mockUseConfig.mockReturnValue({
    data: { app_mode: "oss" },
    isLoading: false,
  });
  useSelectedOrganizationStore.setState({ organizationId: "1" });
});

describe("LlmSettingsScreen", () => {
  it("renders the schema-driven basic LLM form in OSS mode", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderLlmSettingsScreen({ appMode: "oss" });

    await screen.findByTestId("llm-settings-screen");
    expect(screen.getByTestId("llm-settings-form-basic")).toBeInTheDocument();
    expect(screen.getByTestId("llm-provider-input")).toBeInTheDocument();
    expect(screen.getByTestId("llm-model-input")).toBeInTheDocument();
    expect(screen.getByTestId("llm-api-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("save-button")).toBeInTheDocument();
  });

  it("opens advanced view when legacy advanced LLM settings are already set", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        llm_base_url: "https://api.openai.com/v1",
        agent_settings: {
          "llm.model": "openai/gpt-4o",
          "llm.base_url": "https://api.openai.com/v1",
        },
      }),
    );

    renderLlmSettingsScreen({ appMode: "oss" });

    await screen.findByTestId("llm-settings-form-advanced");
    expect(screen.getByTestId("llm-custom-model-input")).toBeInTheDocument();
    expect(screen.getByTestId("base-url-input")).toBeInTheDocument();
  });

  it("uses schema defaults for custom-rendered advanced fields", async () => {
    const schema = structuredClone(
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema!,
    );
    const llmSection = schema.sections.find((section) => section.key === "llm");
    const baseUrlField = llmSection?.fields.find(
      (field) => field.key === "llm.base_url",
    );

    if (!baseUrlField) {
      throw new Error("Expected llm.base_url field in test schema");
    }

    baseUrlField.default = "https://schema.default/v1";
    schema.sections.push({
      key: "general",
      label: "General",
      fields: [
        {
          key: "agent",
          label: "Agent",
          section: "general",
          section_label: "General",
          value_type: "string",
          default: "CodeActAgent",
          choices: [],
          depends_on: [],
          prominence: "major",
          secret: false,
          required: true,
        },
      ],
    });

    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_base_url: "",
        agent_settings: {
          "llm.model": "openai/gpt-4o",
        },
        agent_settings_schema: schema,
      }),
    );

    renderLlmSettingsScreen({ appMode: "oss" });

    await screen.findByTestId("llm-settings-form-basic");
    await userEvent.click(screen.getByTestId("sdk-section-advanced-toggle"));

    expect(screen.getByTestId("base-url-input")).toHaveValue(
      "https://schema.default/v1",
    );
  });

  it("hides the API key input for OpenHands provider in SaaS mode", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderLlmSettingsScreen({ appMode: "saas" });

    await screen.findByTestId("llm-settings-screen");
    expect(screen.queryByTestId("llm-api-key-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("openhands-api-key-help")).toBeInTheDocument();
  });

  it("shows the API key input for non-OpenHands providers in SaaS mode", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        agent_settings: { "llm.model": "openai/gpt-4o" },
      }),
    );

    renderLlmSettingsScreen({ appMode: "saas" });

    await screen.findByTestId("llm-settings-screen");
    expect(screen.getByTestId("llm-api-key-input")).toBeInTheDocument();
  });

  it("makes team members read-only in SaaS mode", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderLlmSettingsScreen({
      appMode: "saas",
      meData: buildOrganizationMember({ role: "member" }),
    });

    await screen.findByTestId("llm-settings-screen");
    expect(screen.queryByTestId("save-button")).not.toBeInTheDocument();
  });

  it("submits basic form values through SDK setting keys", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        agent_settings: { "llm.model": "openai/gpt-4o" },
      }),
    );
    const saveSettingsSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderLlmSettingsScreen({ appMode: "oss" });

    const apiKeyInput = await screen.findByTestId("llm-api-key-input");
    await userEvent.type(apiKeyInput, "test-api-key");
    await userEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          "llm.api_key": "test-api-key",
        }),
      );
    });
  });

  it("submits advanced form values through SDK setting keys", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_model: "openai/gpt-4o",
        agent_settings: {
          "llm.model": "openai/gpt-4o",
          "llm.base_url": "https://api.openai.com/v1",
        },
      }),
    );
    const saveSettingsSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderLlmSettingsScreen({ appMode: "oss" });

    const baseUrlInput = await screen.findByTestId("base-url-input");
    await userEvent.type(baseUrlInput, "/extra");

    await waitFor(() => {
      expect(baseUrlInput).toHaveValue("https://api.openai.com/v1/extra");
      expect(screen.getByTestId("save-button")).not.toBeDisabled();
    });

    await userEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          "llm.base_url": "https://api.openai.com/v1/extra",
        }),
      );
    });
  });

  describe("API key visibility in Basic Settings", () => {
    it("should hide API key input when SaaS mode is enabled and OpenHands provider is selected", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings(),
      );

      renderLlmSettingsScreen({ appMode: "saas" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      const providerInput = within(basicForm).getByTestId("llm-provider-input");

      await waitFor(() => {
        expect(providerInput).toHaveValue("OpenHands");
      });

      expect(
        within(basicForm).queryByTestId("llm-api-key-input"),
      ).not.toBeInTheDocument();
      expect(
        within(basicForm).queryByTestId("llm-api-key-help-anchor"),
      ).not.toBeInTheDocument();
    });

    it("should show API key input when SaaS mode is enabled and non-OpenHands provider is selected", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          agent_settings: { "llm.model": "openai/gpt-4o" },
        }),
      );

      renderLlmSettingsScreen({ appMode: "saas" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      const providerInput = within(basicForm).getByTestId("llm-provider-input");

      await waitFor(() => {
        expect(providerInput).toHaveValue("OpenAI");
      });

      expect(
        within(basicForm).getByTestId("llm-api-key-input"),
      ).toBeInTheDocument();
      expect(
        within(basicForm).getByTestId("llm-api-key-help-anchor"),
      ).toBeInTheDocument();
    });

    it("should show API key input when OSS mode is enabled and OpenHands provider is selected", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings(),
      );

      renderLlmSettingsScreen({ appMode: "oss" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      const providerInput = within(basicForm).getByTestId("llm-provider-input");

      await waitFor(() => {
        expect(providerInput).toHaveValue("OpenHands");
      });

      expect(
        within(basicForm).getByTestId("llm-api-key-input"),
      ).toBeInTheDocument();
      expect(
        within(basicForm).getByTestId("llm-api-key-help-anchor"),
      ).toBeInTheDocument();
    });

    it("should show API key input when OSS mode is enabled and non-OpenHands provider is selected", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          agent_settings: { "llm.model": "openai/gpt-4o" },
        }),
      );

      renderLlmSettingsScreen({ appMode: "oss" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      const providerInput = within(basicForm).getByTestId("llm-provider-input");

      await waitFor(() => {
        expect(providerInput).toHaveValue("OpenAI");
      });

      expect(
        within(basicForm).getByTestId("llm-api-key-input"),
      ).toBeInTheDocument();
      expect(
        within(basicForm).getByTestId("llm-api-key-help-anchor"),
      ).toBeInTheDocument();
    });

    it("should hide API key input when switching from non-OpenHands to OpenHands provider in SaaS mode", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings({
          llm_model: "openai/gpt-4o",
          agent_settings: { "llm.model": "openai/gpt-4o" },
        }),
      );

      renderLlmSettingsScreen({ appMode: "saas" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      await waitFor(() => {
        expect(
          within(basicForm).getByTestId("llm-api-key-input"),
        ).toBeInTheDocument();
      });

      await selectProvider("OpenHands");

      expect(
        within(basicForm).queryByTestId("llm-api-key-input"),
      ).not.toBeInTheDocument();
      expect(
        within(basicForm).queryByTestId("llm-api-key-help-anchor"),
      ).not.toBeInTheDocument();
    });

    it("should show API key input when switching from OpenHands to non-OpenHands provider in SaaS mode", async () => {
      vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
        buildSettings(),
      );

      renderLlmSettingsScreen({ appMode: "saas" });
      await screen.findByTestId("llm-settings-screen");

      const basicForm = screen.getByTestId("llm-settings-form-basic");
      expect(
        within(basicForm).queryByTestId("llm-api-key-input"),
      ).not.toBeInTheDocument();

      await selectProvider("OpenAI");

      expect(
        within(basicForm).getByTestId("llm-api-key-input"),
      ).toBeInTheDocument();
      expect(
        within(basicForm).getByTestId("llm-api-key-help-anchor"),
      ).toBeInTheDocument();
    });
  });

  describe("Role-based permissions", () => {
    describe("User role (read-only)", () => {
      it("should disable all input fields in basic view", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "2",
          meData: buildOrganizationMember({ org_id: "2", role: "member" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const basicForm = screen.getByTestId("llm-settings-form-basic");
        const providerInput =
          within(basicForm).getByTestId("llm-provider-input");
        const modelInput = within(basicForm).getByTestId("llm-model-input");
        const apiKeyInput = within(basicForm).getByTestId("llm-api-key-input");

        await waitFor(() => {
          expect(providerInput).toBeDisabled();
          expect(modelInput).toBeDisabled();
          expect(apiKeyInput).toBeDisabled();
        });
      });

      it("should not render submit button", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings(),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "2",
          meData: buildOrganizationMember({ org_id: "2", role: "member" }),
        });

        await screen.findByTestId("llm-settings-screen");
        expect(screen.queryByTestId("save-button")).not.toBeInTheDocument();
      });

      it("should disable the advanced/basic toggle for read-only users", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettingsWithAdvancedToggle(),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "2",
          meData: buildOrganizationMember({ org_id: "2", role: "member" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const basicToggle = screen.getByTestId("sdk-section-basic-toggle");
        const advancedToggle = screen.getByTestId(
          "sdk-section-advanced-toggle",
        );

        expect(basicToggle).toBeDisabled();
        expect(advancedToggle).toBeDisabled();
        expect(
          screen.getByTestId("llm-settings-form-basic"),
        ).toBeInTheDocument();
      });
    });

    describe("Owner role (full access)", () => {
      it("should enable all input fields in basic view", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "1",
          meData: buildOrganizationMember({ org_id: "1", role: "owner" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const basicForm = screen.getByTestId("llm-settings-form-basic");
        const providerInput =
          within(basicForm).getByTestId("llm-provider-input");
        const modelInput = within(basicForm).getByTestId("llm-model-input");
        const apiKeyInput = within(basicForm).getByTestId("llm-api-key-input");

        await waitFor(() => {
          expect(providerInput).not.toBeDisabled();
          expect(modelInput).not.toBeDisabled();
          expect(apiKeyInput).not.toBeDisabled();
        });
      });

      it("should enable submit button when form is dirty", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "1",
          meData: buildOrganizationMember({ org_id: "1", role: "owner" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const submitButton = screen.getByTestId("save-button");
        expect(submitButton).toBeDisabled();

        await userEvent.type(
          screen.getByTestId("llm-api-key-input"),
          "test-api-key",
        );

        await waitFor(() => {
          expect(submitButton).not.toBeDisabled();
        });
      });

      it("should allow submitting form changes", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );
        const saveSettingsSpy = vi
          .spyOn(SettingsService, "saveSettings")
          .mockResolvedValue(true);

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "1",
          meData: buildOrganizationMember({ org_id: "1", role: "owner" }),
        });

        await screen.findByTestId("llm-settings-screen");
        await userEvent.type(
          screen.getByTestId("llm-api-key-input"),
          "test-api-key",
        );
        await userEvent.click(screen.getByTestId("save-button"));

        await waitFor(() => {
          expect(saveSettingsSpy).toHaveBeenCalled();
        });
      });
    });

    describe("Admin role (full access)", () => {
      it("should enable all input fields in basic view", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "3",
          meData: buildOrganizationMember({ org_id: "3", role: "admin" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const basicForm = screen.getByTestId("llm-settings-form-basic");
        const providerInput =
          within(basicForm).getByTestId("llm-provider-input");
        const modelInput = within(basicForm).getByTestId("llm-model-input");
        const apiKeyInput = within(basicForm).getByTestId("llm-api-key-input");

        await waitFor(() => {
          expect(providerInput).not.toBeDisabled();
          expect(modelInput).not.toBeDisabled();
          expect(apiKeyInput).not.toBeDisabled();
        });
      });

      it("should enable submit button when form is dirty", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "3",
          meData: buildOrganizationMember({ org_id: "3", role: "admin" }),
        });

        await screen.findByTestId("llm-settings-screen");
        const submitButton = screen.getByTestId("save-button");
        expect(submitButton).toBeDisabled();

        await userEvent.type(
          screen.getByTestId("llm-api-key-input"),
          "test-api-key",
        );

        await waitFor(() => {
          expect(submitButton).not.toBeDisabled();
        });
      });

      it("should allow submitting form changes", async () => {
        vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
          buildSettings({
            llm_model: "openai/gpt-4o",
            agent_settings: { "llm.model": "openai/gpt-4o" },
          }),
        );
        const saveSettingsSpy = vi
          .spyOn(SettingsService, "saveSettings")
          .mockResolvedValue(true);

        renderLlmSettingsScreen({
          appMode: "saas",
          organizationId: "3",
          meData: buildOrganizationMember({ org_id: "3", role: "admin" }),
        });

        await screen.findByTestId("llm-settings-screen");
        await userEvent.type(
          screen.getByTestId("llm-api-key-input"),
          "test-api-key",
        );
        await userEvent.click(screen.getByTestId("save-button"));

        await waitFor(() => {
          expect(saveSettingsSpy).toHaveBeenCalled();
        });
      });
    });
  });
});
