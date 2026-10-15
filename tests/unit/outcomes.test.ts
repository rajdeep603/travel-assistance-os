import { describe, expect, it } from "vitest";
import { formatShortDuration, languageNames, median } from "@/lib/services/outcomes";

describe("outcome helpers", () => {
  it("takes the median, ignoring non-numbers", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([2, NaN, 4])).toBe(3);
  });

  it("formats durations the way a presenter would say them", () => {
    expect(formatShortDuration(0.4)).toBe("1 s");
    expect(formatShortDuration(42)).toBe("42 s");
    expect(formatShortDuration(660)).toBe("11 min");
    expect(formatShortDuration(9000)).toBe("2.5 h");
    expect(formatShortDuration(3 * 86_400)).toBe("3 days");
  });

  it("names languages from codes, interpreter pairs and names, English first", () => {
    expect(languageNames(["tr", "en", null, "English ⇄ Hindi", "de", "tr", "es-ES"])).toEqual([
      "English",
      "German",
      "Hindi",
      "Spanish",
      "Turkish",
    ]);
  });
});
