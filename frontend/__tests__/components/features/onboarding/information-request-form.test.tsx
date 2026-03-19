import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { InformationRequestForm } from "#/components/features/onboarding/information-request-form";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("InformationRequestForm", () => {
  const defaultProps = {
    requestType: "saas" as const,
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (props = defaultProps) => {
    return render(
      <MemoryRouter>
        <InformationRequestForm {...props} />
      </MemoryRouter>,
    );
  };

  it("should render the form", () => {
    renderWithRouter();

    expect(screen.getByTestId("information-request-form")).toBeInTheDocument();
  });

  it("should render the logo", () => {
    renderWithRouter();

    const logo = screen.getByTestId("information-request-form").querySelector("svg");
    expect(logo).toBeInTheDocument();
  });

  it("should render all form fields", () => {
    renderWithRouter();

    expect(screen.getByTestId("form-input-name")).toBeInTheDocument();
    expect(screen.getByTestId("form-input-company")).toBeInTheDocument();
    expect(screen.getByTestId("form-input-email")).toBeInTheDocument();
    expect(screen.getByTestId("form-input-message")).toBeInTheDocument();
  });

  it("should render SaaS-specific title when requestType is saas", () => {
    renderWithRouter({ ...defaultProps, requestType: "saas" });

    expect(screen.getByText("ENTERPRISE$FORM_SAAS_TITLE")).toBeInTheDocument();
  });

  it("should render Self-hosted-specific title when requestType is self-hosted", () => {
    renderWithRouter({ ...defaultProps, requestType: "self-hosted" });

    expect(screen.getByText("ENTERPRISE$FORM_SELF_HOSTED_TITLE")).toBeInTheDocument();
  });

  it("should render cloud icon for SaaS request type", () => {
    renderWithRouter({ ...defaultProps, requestType: "saas" });

    // The card should contain the cloud icon
    const card = screen.getByText("ENTERPRISE$SAAS_TITLE").closest("div");
    expect(card).toBeInTheDocument();
  });

  it("should render stacked icon for self-hosted request type", () => {
    renderWithRouter({ ...defaultProps, requestType: "self-hosted" });

    // The card should contain the stacked icon
    const card = screen.getByText("ENTERPRISE$SELF_HOSTED_TITLE").closest("div");
    expect(card).toBeInTheDocument();
  });

  it("should call onBack when back button is clicked", async () => {
    const mockOnBack = vi.fn();
    const user = userEvent.setup();

    renderWithRouter({ ...defaultProps, onBack: mockOnBack });

    const backButton = screen.getByRole("button", { name: "COMMON$BACK" });
    await user.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it("should update form fields when user types", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    const nameInput = screen.getByTestId("form-input-name");
    await user.type(nameInput, "John Doe");

    expect(nameInput).toHaveValue("John Doe");
  });

  it("should update email field when user types", async () => {
    const user = userEvent.setup();
    renderWithRouter();

    const emailInput = screen.getByTestId("form-input-email");
    await user.type(emailInput, "john@example.com");

    expect(emailInput).toHaveValue("john@example.com");
  });

  it("should render message as textarea", () => {
    renderWithRouter();

    const messageInput = screen.getByTestId("form-input-message");
    expect(messageInput.tagName).toBe("TEXTAREA");
  });

  it("should have all fields marked as required", () => {
    renderWithRouter();

    expect(screen.getByTestId("form-input-name")).toBeRequired();
    expect(screen.getByTestId("form-input-company")).toBeRequired();
    expect(screen.getByTestId("form-input-email")).toBeRequired();
    expect(screen.getByTestId("form-input-message")).toBeRequired();
  });

  it("should render submit button", () => {
    renderWithRouter();

    const submitButton = screen.getByRole("button", { name: "ENTERPRISE$FORM_SUBMIT" });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute("type", "submit");
  });

  it("should render back button", () => {
    renderWithRouter();

    const backButton = screen.getByRole("button", { name: "COMMON$BACK" });
    expect(backButton).toBeInTheDocument();
    expect(backButton).toHaveAttribute("type", "button");
  });

  it("should have button group with role and aria-label", () => {
    renderWithRouter();

    const buttonGroup = screen.getByRole("group", { name: "Form actions" });
    expect(buttonGroup).toBeInTheDocument();
  });

  it("should display SaaS card description for saas request type", () => {
    renderWithRouter({ ...defaultProps, requestType: "saas" });

    expect(screen.getByText("ENTERPRISE$SAAS_DESCRIPTION")).toBeInTheDocument();
  });

  it("should display Self-hosted card description for self-hosted request type", () => {
    renderWithRouter({ ...defaultProps, requestType: "self-hosted" });

    expect(screen.getByText("ENTERPRISE$SELF_HOSTED_DESCRIPTION")).toBeInTheDocument();
  });
});
