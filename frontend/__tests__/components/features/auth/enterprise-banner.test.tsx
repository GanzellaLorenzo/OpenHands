import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { EnterpriseBanner } from "#/components/features/auth/enterprise-banner";

const mockCapture = vi.fn();

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mockCapture,
  }),
}));

describe("EnterpriseBanner", () => {
  const mockWindowOpen = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("open", mockWindowOpen);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("should render enterprise banner with title and description", () => {
    render(<EnterpriseBanner />);

    expect(screen.getByTestId("enterprise-banner")).toBeInTheDocument();
    expect(screen.getByText("ENTERPRISE$TITLE")).toBeInTheDocument();
    expect(screen.getByText("ENTERPRISE$DESCRIPTION")).toBeInTheDocument();
  });

  it("should render all enterprise features", () => {
    render(<EnterpriseBanner />);

    expect(
      screen.getByText("ENTERPRISE$FEATURE_ON_PREMISES"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ENTERPRISE$FEATURE_DATA_CONTROL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ENTERPRISE$FEATURE_COMPLIANCE"),
    ).toBeInTheDocument();
    expect(screen.getByText("ENTERPRISE$FEATURE_SUPPORT")).toBeInTheDocument();
  });

  it("should render learn more button", () => {
    render(<EnterpriseBanner />);

    const learnMoreButton = screen.getByRole("button", {
      name: "ENTERPRISE$LEARN_MORE",
    });
    expect(learnMoreButton).toBeInTheDocument();
  });

  it("should track posthog event and open enterprise URL when learn more button is clicked", async () => {
    const user = userEvent.setup();
    render(<EnterpriseBanner />);

    const learnMoreButton = screen.getByRole("button", {
      name: "ENTERPRISE$LEARN_MORE",
    });
    await user.click(learnMoreButton);

    expect(mockCapture).toHaveBeenCalledWith("saas_selfhosted_inquiry");
    expect(mockWindowOpen).toHaveBeenCalledWith(
      "https://openhands.dev/enterprise",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("should have responsive width class", () => {
    render(<EnterpriseBanner />);

    const banner = screen.getByTestId("enterprise-banner");
    expect(banner).toHaveClass("w-full");
  });

  it("should render server icon", () => {
    render(<EnterpriseBanner />);

    // The banner should contain the SVG icon which has w-8 and h-8 classes
    const banner = screen.getByTestId("enterprise-banner");
    const icon = banner.querySelector("svg");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("w-8", "h-8");
  });
});
