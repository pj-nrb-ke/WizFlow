import { describe, expect, it } from "vitest";
import type { FormField } from "./api";
import {
  buildInitialForm,
  defaultValueForField,
  formToPayload,
  getFormFields,
  validateFormClient,
} from "./formValidation";

const amountField: FormField = {
  key: "amount",
  type: "number",
  label: "Amount",
  required: true,
};

const purposeField: FormField = {
  key: "purpose",
  type: "text",
  label: "Purpose",
  required: true,
};

describe("getFormFields", () => {
  it("keeps input fields and drops label/button", () => {
    const fields = getFormFields({
      fields: [
        amountField,
        { key: "hdr", type: "label", label: "Header" },
        { key: "go", type: "button", label: "Go" },
      ],
    });
    expect(fields.map((f) => f.key)).toEqual(["amount"]);
  });
});

describe("defaultValueForField", () => {
  it("defaults end_date one week ahead", () => {
    const d = defaultValueForField({ key: "end_date", type: "date", label: "End" });
    const parsed = new Date(d + "T12:00:00");
    const week = new Date();
    week.setDate(week.getDate() + 7);
    expect(parsed.toDateString()).toBe(week.toDateString());
  });
});

describe("validateFormClient", () => {
  it("requires non-empty values for required fields", () => {
    expect(validateFormClient([purposeField], { purpose: "  " })).toMatch(/Purpose/);
  });

  it("rejects invalid optional number input", () => {
    const optional: FormField = { ...amountField, required: false };
    expect(validateFormClient([optional], { amount: "12x" })).toMatch(/positive/i);
  });

  it("allows empty optional number fields", () => {
    const optional: FormField = { ...amountField, required: false };
    expect(validateFormClient([optional], {})).toBeNull();
  });
});

describe("formToPayload", () => {
  it("coerces number fields and omits empty strings", () => {
    expect(
      formToPayload([amountField, purposeField], {
        amount: "42.5",
        purpose: "Supplies",
        extra: "",
      })
    ).toEqual({ amount: 42.5, purpose: "Supplies" });
  });

  it("skips number fields that do not parse", () => {
    expect(formToPayload([amountField], { amount: "nope" })).toEqual({});
  });
});

describe("buildInitialForm", () => {
  it("seeds known defaults", () => {
    const form = buildInitialForm([
      { key: "leave_type", type: "text", label: "Leave type" },
      { key: "start_date", type: "date", label: "Start" },
    ]);
    expect(form.leave_type).toBe("Annual");
    expect(form.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
