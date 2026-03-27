import { openHands } from "./open-hands-axios";
import {
  Automation,
  AutomationListResponse,
  AutomationRun,
  AutomationRunListResponse,
  CreateAutomationRequest,
  UpdateAutomationRequest,
} from "./automation-service.types";

const BASE = "/api/automation/v1";

export class AutomationService {
  // --- Automations CRUD ---

  static async listAutomations(
    limit = 50,
    offset = 0,
  ): Promise<AutomationListResponse> {
    const { data } = await openHands.get<AutomationListResponse>(BASE, {
      params: { limit, offset },
    });
    return data;
  }

  static async getAutomation(automationId: string): Promise<Automation> {
    const { data } = await openHands.get<Automation>(`${BASE}/${automationId}`);
    return data;
  }

  static async createAutomation(
    body: CreateAutomationRequest,
  ): Promise<Automation> {
    const { data } = await openHands.post<Automation>(BASE, body);
    return data;
  }

  static async updateAutomation(
    automationId: string,
    body: UpdateAutomationRequest,
  ): Promise<Automation> {
    const { data } = await openHands.patch<Automation>(
      `${BASE}/${automationId}`,
      body,
    );
    return data;
  }

  static async deleteAutomation(automationId: string): Promise<void> {
    await openHands.delete(`${BASE}/${automationId}`);
  }

  // --- Runs ---

  static async dispatchAutomation(
    automationId: string,
  ): Promise<AutomationRun> {
    const { data } = await openHands.post<AutomationRun>(
      `${BASE}/${automationId}/dispatch`,
    );
    return data;
  }

  static async listAutomationRuns(
    automationId: string,
    limit = 50,
    offset = 0,
  ): Promise<AutomationRunListResponse> {
    const { data } = await openHands.get<AutomationRunListResponse>(
      `${BASE}/${automationId}/runs`,
      { params: { limit, offset } },
    );
    return data;
  }
}
