import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingNumber from "../settings/SettingNumber.vue";

function mountNumber(value = 50) {
  const w = mount(SettingNumber, {
    props: {
      range: "video.clipCapMb" as const,
      unit: "MB",
      modelValue: value,
      "onUpdate:modelValue": (v: number) => w.setProps({ modelValue: v }),
    },
  });
  return w;
}
const last = (w: ReturnType<typeof mountNumber>) => {
  const emitted = w.emitted("update:modelValue");
  return emitted ? emitted[emitted.length - 1]?.[0] : undefined;
};

describe("SettingNumber", () => {
  it("shows the value, the unit and the range bounds", () => {
    const w = mountNumber();
    const input = w.find("input");
    expect((input.element as HTMLInputElement).value).toBe("50");
    expect(input.attributes("min")).toBe("1");
    expect(input.attributes("max")).toBe("500");
    expect(w.find(".unit").text()).toBe("MB");
  });

  it("rounds a decimal to an integer on blur", async () => {
    const w = mountNumber();
    await w.find("input").setValue("2.5");
    expect(w.emitted("update:modelValue")).toBeUndefined();
    await w.find("input").trigger("blur");
    expect(last(w)).toBe(3);
    expect((w.find("input").element as HTMLInputElement).value).toBe("3");
  });

  it("clamps into the range", async () => {
    const w = mountNumber();
    await w.find("input").setValue("900");
    await w.find("input").trigger("change");
    expect(last(w)).toBe(500);
    await w.find("input").setValue("0");
    await w.find("input").trigger("change");
    expect(last(w)).toBe(1);
  });

  it("an emptied field writes nothing and reverts", async () => {
    const w = mountNumber();
    await w.find("input").setValue("");
    await w.find("input").trigger("blur");
    expect(w.emitted("update:modelValue")).toBeUndefined();
    expect((w.find("input").element as HTMLInputElement).value).toBe("50");
  });

  it("follows an outside model change", async () => {
    const w = mountNumber();
    await w.setProps({ modelValue: 12 });
    expect((w.find("input").element as HTMLInputElement).value).toBe("12");
  });
});
