import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingToggle from "../settings/SettingToggle.vue";

describe("SettingToggle", () => {
  it("is a switch that flips its model on click", async () => {
    const w = mount(SettingToggle, { props: { modelValue: false } });
    const btn = w.find("button");
    expect(btn.attributes("role")).toBe("switch");
    expect(btn.attributes("aria-checked")).toBe("false");
    expect(btn.classes()).not.toContain("on");
    await btn.trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([[true]]);
    await w.setProps({ modelValue: true });
    expect(btn.attributes("aria-checked")).toBe("true");
    expect(btn.classes()).toContain("on");
  });
});
