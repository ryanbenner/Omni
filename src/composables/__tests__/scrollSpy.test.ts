import { describe, it, expect } from "vitest";
import { mostVisible } from "../scrollSpy";

describe("mostVisible", () => {
  it("picks the item with the most visible height", () => {
    expect(mostVisible([{ id: "a", top: -300, bottom: 50 }, { id: "b", top: 50, bottom: 600 }], 0, 500)).toBe("b");
  });
  it("a tie goes to the earlier item", () => {
    expect(mostVisible([{ id: "a", top: 0, bottom: 250 }, { id: "b", top: 250, bottom: 500 }], 0, 500)).toBe("a");
  });
  it("items fully out of view count as nothing", () => {
    expect(mostVisible([{ id: "a", top: -900, bottom: -400 }, { id: "b", top: 480, bottom: 900 }], 0, 500)).toBe("b");
  });
});
