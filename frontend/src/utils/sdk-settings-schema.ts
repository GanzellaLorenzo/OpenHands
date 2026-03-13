import {
  Settings,
  SettingsFieldSchema,
  SettingsSchema,
  SettingsSectionSchema,
  SettingsValue,
} from "#/types/settings";

export type SettingsFormValues = Record<string, string | boolean>;
export type SettingsDirtyState = Record<string, boolean>;
export type SdkSettingsPayload = Record<string, SettingsValue>;

function getSchemaFields(schema: SettingsSchema): SettingsFieldSchema[] {
  return schema.sections.flatMap((section) => section.fields);
}

function getCurrentSettingValue(
  settings: Settings,
  key: string,
): SettingsValue {
  return settings.sdk_settings_values?.[key] ?? null;
}

function isChoiceField(field: SettingsFieldSchema): boolean {
  return field.choices.length > 0;
}

function isMinorField(field: SettingsFieldSchema): boolean {
  return field.prominence === "minor";
}

function normalizeFieldValue(
  field: SettingsFieldSchema,
  rawValue: unknown,
): string | boolean {
  const resolvedValue = rawValue ?? field.default;

  if (isChoiceField(field)) {
    return resolvedValue === null || resolvedValue === undefined
      ? ""
      : String(resolvedValue);
  }

  if (field.value_type === "boolean") {
    return Boolean(resolvedValue ?? false);
  }

  if (resolvedValue === null || resolvedValue === undefined) {
    return "";
  }

  if (field.value_type === "array" || field.value_type === "object") {
    return JSON.stringify(resolvedValue, null, 2);
  }

  return String(resolvedValue);
}

function normalizeComparableValue(
  field: SettingsFieldSchema,
  rawValue: unknown,
): boolean | number | string | null {
  if (rawValue === undefined) {
    return null;
  }

  if (field.value_type === "boolean") {
    if (typeof rawValue === "string") {
      if (rawValue === "true") {
        return true;
      }
      if (rawValue === "false") {
        return false;
      }
    }
    if (rawValue === null) {
      return null;
    }
    return Boolean(rawValue);
  }

  if (field.value_type === "integer" || field.value_type === "number") {
    if (rawValue === "" || rawValue === null) {
      return null;
    }

    const parsedValue =
      typeof rawValue === "number" ? rawValue : Number(String(rawValue));
    return Number.isNaN(parsedValue) ? null : parsedValue;
  }

  if (field.value_type === "array" || field.value_type === "object") {
    if (rawValue === null) {
      return null;
    }

    if (typeof rawValue === "string") {
      const trimmedValue = rawValue.trim();
      if (!trimmedValue) {
        return null;
      }
      try {
        return JSON.stringify(JSON.parse(trimmedValue));
      } catch {
        return trimmedValue;
      }
    }

    return JSON.stringify(rawValue);
  }

  if (rawValue === null) {
    return null;
  }

  return String(rawValue);
}

export function buildInitialSettingsFormValues(
  settings: Settings,
): SettingsFormValues {
  const schema = settings.sdk_settings_schema;
  if (!schema) {
    return {};
  }

  return Object.fromEntries(
    getSchemaFields(schema).map((field) => [
      field.key,
      normalizeFieldValue(field, getCurrentSettingValue(settings, field.key)),
    ]),
  );
}

export function hasAdvancedSettingsOverrides(settings: Settings): boolean {
  const schema = settings.sdk_settings_schema;
  if (!schema) {
    return false;
  }

  return getSchemaFields(schema).some((field) => {
    if (!isMinorField(field)) {
      return false;
    }

    const currentValue = getCurrentSettingValue(settings, field.key);

    return (
      normalizeComparableValue(field, currentValue ?? field.default ?? null) !==
      normalizeComparableValue(field, field.default ?? null)
    );
  });
}

export function isSettingsFieldVisible(
  field: SettingsFieldSchema,
  values: SettingsFormValues,
): boolean {
  return field.depends_on.every((dependency) => values[dependency] === true);
}

function parseBooleanFieldValue(rawValue: string | boolean): boolean | null {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }
  if (normalizedValue === "true") {
    return true;
  }
  if (normalizedValue === "false") {
    return false;
  }

  throw new Error(`Expected a boolean value, received: ${rawValue}`);
}

function coerceFieldValue(
  field: SettingsFieldSchema,
  rawValue: string | boolean,
): SettingsValue {
  if (field.value_type === "boolean") {
    return parseBooleanFieldValue(rawValue);
  }

  if (field.value_type === "integer" || field.value_type === "number") {
    const stringValue = String(rawValue).trim();
    if (!stringValue) {
      return null;
    }

    const parsedValue = Number(stringValue);
    if (Number.isNaN(parsedValue)) {
      throw new Error(`Expected a numeric value, received: ${stringValue}`);
    }
    if (field.value_type === "integer" && !Number.isInteger(parsedValue)) {
      throw new Error(`Expected an integer value, received: ${stringValue}`);
    }

    return parsedValue;
  }

  if (field.value_type === "array" || field.value_type === "object") {
    const stringValue = String(rawValue).trim();
    if (!stringValue) {
      return null;
    }

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(stringValue);
    } catch {
      throw new Error(`Invalid JSON for ${field.label}`);
    }

    if (field.value_type === "array") {
      if (!Array.isArray(parsedValue)) {
        throw new Error(`${field.label} must be a JSON array`);
      }
      return parsedValue as SettingsValue[];
    }

    if (
      parsedValue === null ||
      Array.isArray(parsedValue) ||
      typeof parsedValue !== "object"
    ) {
      throw new Error(`${field.label} must be a JSON object`);
    }

    return parsedValue as { [key: string]: SettingsValue };
  }

  const stringValue = String(rawValue);
  if (stringValue === "" && !field.secret) {
    return null;
  }

  return stringValue;
}

export function buildSdkSettingsPayload(
  schema: SettingsSchema,
  values: SettingsFormValues,
  dirty: SettingsDirtyState,
): SdkSettingsPayload {
  const payload: SdkSettingsPayload = {};

  for (const field of getSchemaFields(schema)) {
    if (dirty[field.key]) {
      payload[field.key] = coerceFieldValue(field, values[field.key]);
    }
  }

  return payload;
}

function isFieldVisibleInView(
  field: SettingsFieldSchema,
  showAdvanced: boolean,
): boolean {
  return showAdvanced || !isMinorField(field);
}

export function getVisibleSettingsSections(
  schema: SettingsSchema,
  values: SettingsFormValues,
  showAdvanced: boolean,
): SettingsSectionSchema[] {
  return schema.sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(
        (field) =>
          isFieldVisibleInView(field, showAdvanced) &&
          isSettingsFieldVisible(field, values),
      ),
    }))
    .filter((section) => section.fields.length > 0);
}

export function hasMinorSettings(schema: SettingsSchema | null): boolean {
  if (!schema) {
    return false;
  }

  return getSchemaFields(schema).some((field) => field.prominence === "minor");
}
