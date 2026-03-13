import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";

import { BrandButton } from "#/components/features/settings/brand-button";
import { OptionalTag } from "#/components/features/settings/optional-tag";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { LlmSettingsInputsSkeleton } from "#/components/features/settings/llm-settings/llm-settings-inputs-skeleton";
import { I18nKey } from "#/i18n/declaration";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  buildInitialSettingsFormValues,
  buildSdkSettingsPayload,
  getVisibleSettingsSections,
  hasAdvancedSettingsOverrides,
  hasMinorSettings,
  SettingsDirtyState,
  SettingsFormValues,
} from "#/utils/sdk-settings-schema";
import { SettingsFieldSchema } from "#/types/settings";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";

function FieldHelp({ field }: { field: SettingsFieldSchema }) {
  if (!field.description) {
    return null;
  }

  return (
    <Typography.Paragraph className="text-tertiary-alt text-xs leading-5">
      {field.description}
    </Typography.Paragraph>
  );
}

function isSelectField(field: SettingsFieldSchema): boolean {
  return field.choices.length > 0;
}

function isBooleanField(field: SettingsFieldSchema): boolean {
  return field.value_type === "boolean" && !isSelectField(field);
}

function isJsonField(field: SettingsFieldSchema): boolean {
  return field.value_type === "array" || field.value_type === "object";
}

function getInputType(
  field: SettingsFieldSchema,
): React.HTMLInputTypeAttribute {
  if (field.secret) {
    return "password";
  }
  if (field.value_type === "integer" || field.value_type === "number") {
    return "number";
  }
  return "text";
}

function SchemaField({
  field,
  value,
  onChange,
}: {
  field: SettingsFieldSchema;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  if (isBooleanField(field)) {
    return (
      <div className="flex flex-col gap-1.5">
        <SettingsSwitch
          testId={`sdk-settings-${field.key}`}
          isToggled={Boolean(value)}
          onToggle={onChange}
        >
          {field.label}
        </SettingsSwitch>
        <FieldHelp field={field} />
      </div>
    );
  }

  if (isSelectField(field)) {
    return (
      <div className="flex flex-col gap-1.5">
        <SettingsDropdownInput
          testId={`sdk-settings-${field.key}`}
          name={field.key}
          label={field.label}
          items={field.choices.map((choice) => ({
            key: String(choice.value),
            label: choice.label,
          }))}
          selectedKey={value === "" ? undefined : String(value)}
          isClearable={!field.required}
          required={field.required}
          showOptionalTag={!field.required}
          onSelectionChange={(selectedKey) =>
            onChange(String(selectedKey ?? ""))
          }
        />
        <FieldHelp field={field} />
      </div>
    );
  }

  if (isJsonField(field)) {
    return (
      <label className="flex flex-col gap-2.5 w-full">
        <div className="flex items-center gap-2">
          <span className="text-sm">{field.label}</span>
          {!field.required ? <OptionalTag /> : null}
        </div>
        <textarea
          data-testid={`sdk-settings-${field.key}`}
          name={field.key}
          value={String(value ?? "")}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "bg-tertiary border border-[#717888] min-h-32 w-full rounded-sm p-2 font-mono text-sm",
            "placeholder:italic placeholder:text-tertiary-alt",
          )}
        />
        <FieldHelp field={field} />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SettingsInput
        testId={`sdk-settings-${field.key}`}
        name={field.key}
        label={field.label}
        type={getInputType(field)}
        value={String(value ?? "")}
        required={field.required}
        showOptionalTag={!field.required}
        onChange={onChange}
        className="w-full"
      />
      <FieldHelp field={field} />
    </div>
  );
}

function LlmSettingsScreen() {
  const { t } = useTranslation();
  const { mutate: saveSettings, isPending } = useSaveSettings();
  const { data: settings, isLoading, isFetching } = useSettings();

  const [view, setView] = React.useState<"basic" | "advanced">("basic");
  const [values, setValues] = React.useState<SettingsFormValues>({});
  const [dirty, setDirty] = React.useState<SettingsDirtyState>({});

  const schema = settings?.sdk_settings_schema ?? null;
  const showAdvancedToggle = hasMinorSettings(schema);

  React.useEffect(() => {
    if (!settings?.sdk_settings_schema) {
      return;
    }

    setValues(buildInitialSettingsFormValues(settings));
    setDirty({});
    setView(hasAdvancedSettingsOverrides(settings) ? "advanced" : "basic");
  }, [settings]);

  const visibleSections = React.useMemo(() => {
    if (!schema) {
      return [];
    }

    return getVisibleSettingsSections(schema, values, view === "advanced");
  }, [schema, values, view]);

  const handleFieldChange = React.useCallback(
    (fieldKey: string, nextValue: string | boolean) => {
      setValues((previousValues) => ({
        ...previousValues,
        [fieldKey]: nextValue,
      }));
      setDirty((previousDirty) => ({
        ...previousDirty,
        [fieldKey]: true,
      }));
    },
    [],
  );

  const handleError = (error: AxiosError) => {
    const errorMessage = retrieveAxiosErrorMessage(error);
    displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
  };

  const handleSave = () => {
    if (!schema) {
      return;
    }

    let payload: ReturnType<typeof buildSdkSettingsPayload>;
    try {
      payload = buildSdkSettingsPayload(schema, values, dirty);
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
      );
      return;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    saveSettings(payload, {
      onError: handleError,
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.SETTINGS$SAVED_WARNING));
        setDirty({});
      },
    });
  };

  if (isLoading || isFetching) {
    return <LlmSettingsInputsSkeleton />;
  }

  if (!schema) {
    return (
      <Typography.Paragraph className="text-tertiary-alt">
        {t(I18nKey.SETTINGS$SDK_SCHEMA_UNAVAILABLE)}
      </Typography.Paragraph>
    );
  }

  if (Object.keys(values).length === 0) {
    return <LlmSettingsInputsSkeleton />;
  }

  return (
    <div data-testid="llm-settings-screen" className="h-full relative">
      <div className="flex items-center gap-2 mb-6">
        <BrandButton
          testId="llm-settings-basic-toggle"
          variant={view === "basic" ? "primary" : "secondary"}
          type="button"
          onClick={() => setView("basic")}
        >
          {t(I18nKey.SETTINGS$BASIC)}
        </BrandButton>
        {showAdvancedToggle ? (
          <BrandButton
            testId="llm-settings-advanced-toggle"
            variant={view === "advanced" ? "primary" : "secondary"}
            type="button"
            onClick={() => setView("advanced")}
          >
            {t(I18nKey.SETTINGS$ADVANCED)}
          </BrandButton>
        ) : null}
      </div>

      <div className="flex flex-col gap-8 pb-20">
        {visibleSections.map((section) => (
          <section key={section.key} className="flex flex-col gap-4">
            <Typography.H3>{section.label}</Typography.H3>
            <div className="grid gap-4 xl:grid-cols-2">
              {section.fields.map((field) => (
                <SchemaField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(nextValue) =>
                    handleFieldChange(field.key, nextValue)
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 bg-base py-4">
        <BrandButton
          testId="save-button"
          type="button"
          variant="primary"
          isDisabled={isPending || Object.keys(dirty).length === 0}
          onClick={handleSave}
        >
          {isPending ? "Loading..." : t(I18nKey.SETTINGS$SAVE_CHANGES)}
        </BrandButton>
      </div>
    </div>
  );
}

export default LlmSettingsScreen;
