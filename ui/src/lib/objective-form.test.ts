import { describe, expect, it } from "vitest";
import {
  deadlineFromPreset,
  formatTokensShort,
  objectiveTaskTitle,
  parseCriteria,
  parseDollarsToCents,
  parseTokenLimit,
  usagePercent,
} from "./objective-form";

describe("objective form helpers", () => {
  it("treats empty limits as no limit and rejects invalid ones", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("10")).toBe(1_000);
    expect(parseDollarsToCents("US$ 12,50")).toBe(1_250);
    expect(parseDollarsToCents("0")).toBeUndefined();
    expect(parseDollarsToCents("diez")).toBeUndefined();
    expect(parseTokenLimit("")).toBeNull();
    expect(parseTokenLimit("500k")).toBe(500_000);
    expect(parseTokenLimit("1,5M")).toBe(1_500_000);
    expect(parseTokenLimit("-3")).toBeUndefined();
  });

  it("turns a time preset into a deadline", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(deadlineFromPreset("none", now)).toBeNull();
    expect(deadlineFromPreset("24h", now)).toBe("2026-10-17T12:00:00.000Z");
  });

  it("reads one criterion per line, ignoring bullets and blanks", () => {
    expect(parseCriteria("- 34 informes subidos\n\n• Revisados por Ana\n  ")).toEqual(["34 informes subidos", "Revisados por Ana"]);
  });

  it("formats usage for the card", () => {
    expect(formatTokensShort(1_250_000)).toBe("1.3M");
    expect(formatTokensShort(42_000)).toBe("42k");
    expect(usagePercent(150, 100)).toBe(100);
    expect(usagePercent(25, 100)).toBe(25);
    expect(usagePercent(25, null)).toBeNull();
  });

  it("uses the first line as the task title", () => {
    expect(objectiveTaskTitle("\n  Informe mensual de clientes \nDetalle")).toBe("Informe mensual de clientes");
    expect(objectiveTaskTitle("x".repeat(200))).toHaveLength(118);
  });
});
