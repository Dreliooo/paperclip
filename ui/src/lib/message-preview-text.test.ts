import { describe, expect, it } from "vitest";
import { messagePreviewText } from "./message-preview-text";

describe("messagePreviewText", () => {
  it("shows mention labels instead of agent links", () => {
    expect(messagePreviewText("Handoff to the [@Lead Agent](agent://86fbfeeb-0eed-4d4e-b31b-a2c4d5e6f7a8) team"))
      .toBe("Handoff to the @Lead Agent team");
  });

  it("keeps link and image labels and joins lines", () => {
    expect(messagePreviewText("See [the plan](https://example.com/plan)\nand ![chart](/a.png)")).toBe("See the plan and chart");
  });

  it("leaves plain text alone", () => {
    expect(messagePreviewText("  please continue  ")).toBe("please continue");
  });
});
