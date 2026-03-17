import { SdkSectionPage } from "#/components/features/settings/sdk-settings/sdk-section-page";
import { createPermissionGuard } from "#/utils/org/permission-guard";

function CriticSettingsScreen() {
  return (
    <SdkSectionPage sectionKeys={["critic"]} testId="critic-settings-screen" />
  );
}

export const clientLoader = createPermissionGuard("view_llm_settings");

export default CriticSettingsScreen;
