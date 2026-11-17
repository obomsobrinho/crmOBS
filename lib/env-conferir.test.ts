import { describe, expect, it } from "vitest";
import { OBRIGATORIAS_DO_SERVIDOR, OBRIGATORIAS_PUBLICAS, faltasNoAmbiente } from "@/lib/env-conferir";

const completo = Object.fromEntries(
  [...OBRIGATORIAS_DO_SERVIDOR, ...OBRIGATORIAS_PUBLICAS].map((n) => [n, "x"]),
);

describe("faltasNoAmbiente", () => {
  it("nothing missing when every required variable is filled (optional ones absent)", () => {
    expect(faltasNoAmbiente(completo)).toEqual([]);
  });

  it("names a missing and an empty variable, sorted, never the value", () => {
    const amb = { ...completo, OPENAI_API_KEY: undefined, CRON_SECRET: "" };
    expect(faltasNoAmbiente(amb)).toEqual(["CRON_SECRET", "OPENAI_API_KEY"]);
  });

  it("checks the public variables too", () => {
    expect(faltasNoAmbiente({ ...completo, NEXT_PUBLIC_SUPABASE_URL: undefined })).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
  });

  it("the Asaas variables are optional until the owner confirms them", () => {
    expect(faltasNoAmbiente({ ...completo, ASAAS_API_KEY: undefined, ASAAS_ENV: undefined })).toEqual([]);
  });
});
