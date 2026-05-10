import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompletionStepper } from "../CompletionStepper";

describe("CompletionStepper", () => {
  afterEach(cleanup);

  it("highlights the finalizing step as active", () => {
    const { container } = render(<CompletionStepper executionStatus="finalizing" />);
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(4);
    expect(container.textContent).toContain("Finalizing");
    expect(container.textContent).toContain("PR open");
    expect(container.textContent).toContain("CI");
    expect(container.textContent).toContain("Merged");
  });

  it("marks prior steps done when at pr-open", () => {
    const { container } = render(<CompletionStepper executionStatus="pr-open" />);
    const stepBadges = container.querySelectorAll("span.inline-flex");
    expect(stepBadges[0]?.textContent).toBe("✓");
    expect(stepBadges[1]?.textContent).toBe("2");
  });

  it("marks all prior steps done when at merged", () => {
    const { container } = render(<CompletionStepper executionStatus="merged" />);
    const stepBadges = container.querySelectorAll("span.inline-flex");
    expect(stepBadges[0]?.textContent).toBe("✓");
    expect(stepBadges[1]?.textContent).toBe("✓");
    expect(stepBadges[2]?.textContent).toBe("✓");
    expect(stepBadges[3]?.textContent).toBe("4");
  });

  it("advances from ci-pending with 3 checkmarks prior", () => {
    const { container } = render(<CompletionStepper executionStatus="ci-pending" />);
    const stepBadges = container.querySelectorAll("span.inline-flex");
    expect(stepBadges[0]?.textContent).toBe("✓");
    expect(stepBadges[1]?.textContent).toBe("✓");
    expect(stepBadges[2]?.textContent).toBe("3");
  });
});
