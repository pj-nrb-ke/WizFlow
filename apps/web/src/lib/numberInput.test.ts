import { describe, expect, it } from "vitest";
import {
  parsePositiveNumber,
  sanitizePositiveNumberInput,
  validatePositiveNumberField,
} from "./numberInput";

describe("sanitizePositiveNumberInput", () => {
  it("strips minus signs and letters", () => {
    expect(sanitizePositiveNumberInput("123-123")).toBe("123123");
    expect(sanitizePositiveNumberInput("-50")).toBe("50");
    expect(sanitizePositiveNumberInput("12.5abc")).toBe("12.5");
  });
});

describe("parsePositiveNumber", () => {
  it("accepts zero and positive values only", () => {
    expect(parsePositiveNumber("0")).toBe(0);
    expect(parsePositiveNumber("42.5")).toBe(42.5);
    expect(parsePositiveNumber("-1")).toBeNull();
    expect(parsePositiveNumber("abc")).toBeNull();
  });
});

describe("validatePositiveNumberField", () => {
  it("rejects invalid numeric input", () => {
    expect(validatePositiveNumberField("Amount", "123-123")).toMatch(/positive/i);
    expect(validatePositiveNumberField("Amount", "100")).toBeNull();
    expect(validatePositiveNumberField("Amount", "")).toBeNull();
    expect(validatePositiveNumberField("Amount", ".")).toMatch(/positive/i);
  });
});

describe("sanitizePositiveNumberInput edge cases", () => {
  it("collapses multiple dots to one decimal point", () => {
    expect(sanitizePositiveNumberInput("1.2.3")).toBe("1.23");
  });
});
