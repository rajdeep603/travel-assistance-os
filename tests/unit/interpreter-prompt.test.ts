import { describe, expect, it } from "vitest";
import { INTERPRETER_LANGUAGES, interpreterPrompt } from "@/lib/voice/interpreter-prompt";

describe("interpreter prompt", () => {
  it("offers Hindi with its Grok Voice language code", () => {
    expect(INTERPRETER_LANGUAGES.hi).toBe("Hindi");
  });

  it("asks for hospital Hindi, with the English medical words people use", () => {
    const prompt = interpreterPrompt("English", "Hindi");
    expect(prompt).toContain("from English into Hindi");
    expect(prompt).toMatch(/everyday Hindi.*\(ICU, BP, scan/);
    expect(prompt).not.toMatch(/mix English words/);
  });

  it("expects English mixed into Hindi speech", () => {
    const prompt = interpreterPrompt("Hindi", "English");
    expect(prompt).toContain("from Hindi into English");
    expect(prompt).toMatch(/mix English words into their Hindi/);
    expect(prompt).not.toMatch(/everyday Hindi/);
  });

  it("leaves other languages' prompts unchanged", () => {
    expect(interpreterPrompt("English", "Turkish")).not.toMatch(/Hindi/);
  });
});
