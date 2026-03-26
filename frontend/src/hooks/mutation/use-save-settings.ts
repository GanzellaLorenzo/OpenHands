import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { useSelectedOrganizationId } from "#/context/use-selected-organization";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MCPConfig, Settings } from "#/types/settings";
import { useSettings } from "../query/use-settings";

type SettingsUpdate = Partial<Settings> & Record<string, unknown>;

const LEGACY_FLAT_TO_SDK: Record<string, string> = {
  agent: "agent",
  llm_model: "llm.model",
  llm_api_key: "llm.api_key",
  llm_base_url: "llm.base_url",
  mcp_config: "mcp_config",
  confirmation_mode: "verification.confirmation_mode",
  security_analyzer: "verification.security_analyzer",
  enable_default_condenser: "condenser.enabled",
  condenser_max_size: "condenser.max_size",
  max_iterations: "max_iterations",
};

const saveSettingsMutationFn = async (settings: SettingsUpdate) => {
  const settingsToSave: SettingsUpdate = { ...settings };
  delete settingsToSave.agent_settings_schema;
  delete settingsToSave.agent_settings;

  for (const [legacyKey, sdkKey] of Object.entries(LEGACY_FLAT_TO_SDK)) {
    const hasLegacyValue = legacyKey in settingsToSave;
    const hasSdkValue = sdkKey in settingsToSave;

    if (hasLegacyValue && !hasSdkValue) {
      settingsToSave[sdkKey] = settingsToSave[legacyKey];
      delete settingsToSave[legacyKey];
    }
  }

  if (typeof settingsToSave["llm.api_key"] === "string") {
    const apiKey = settingsToSave["llm.api_key"].trim();
    settingsToSave["llm.api_key"] = apiKey === "" ? "" : apiKey;
  }

  if (typeof settingsToSave.search_api_key === "string") {
    settingsToSave.search_api_key = settingsToSave.search_api_key.trim();
  }
  if (typeof settingsToSave.git_user_name === "string") {
    settingsToSave.git_user_name = settingsToSave.git_user_name.trim();
  }
  if (typeof settingsToSave.git_user_email === "string") {
    settingsToSave.git_user_email = settingsToSave.git_user_email.trim();
  }

  await SettingsService.saveSettings(settingsToSave);
};

export const useSaveSettings = () => {
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const { data: currentSettings } = useSettings();
  const { organizationId } = useSelectedOrganizationId();

  return useMutation({
    mutationFn: async (settings: SettingsUpdate) => {
      const nextMcpConfig = settings.mcp_config as MCPConfig | undefined;
      const currentMcpConfig = currentSettings?.mcp_config as
        | MCPConfig
        | undefined;

      if (nextMcpConfig && currentMcpConfig !== nextMcpConfig) {
        posthog.capture("mcp_config_updated", {
          has_mcp_config: true,
          sse_servers_count: nextMcpConfig.sse_servers?.length || 0,
          stdio_servers_count: nextMcpConfig.stdio_servers?.length || 0,
        });
      }

      await saveSettingsMutationFn(settings);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["settings", organizationId],
      });
    },
    meta: {
      disableToast: true,
    },
  });
};
