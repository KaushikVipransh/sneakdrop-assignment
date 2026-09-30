// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  afterEach(cleanup);

  it("renders the three pill variants with their token classes", () => {
    render(
      <>
        <Button>Buy</Button>
        <Button variant="secondary">Release</Button>
        <Button variant="ghost">Leave line</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Buy" }).className).toContain("bg-ink");
    expect(screen.getByRole("button", { name: "Buy" }).className).toContain("text-white");
    expect(screen.getByRole("button", { name: "Release" }).className).toContain("border");
    expect(screen.getByRole("button", { name: "Leave line" }).className).toContain(
      "bg-transparent",
    );
  });

  it("is 48px tall on the status page and 36px in admin", () => {
    render(
      <>
        <Button>Big</Button>
        <Button size="sm">Small</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Big" }).className).toContain("h-12");
    expect(screen.getByRole("button", { name: "Small" }).className).toContain("h-9");
  });

  it("loading disables the button and keeps its label for width", () => {
    render(<Button loading>Pay now</Button>);
    const button = screen.getByRole("button", { name: "Pay now" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
