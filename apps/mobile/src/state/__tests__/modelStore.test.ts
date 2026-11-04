import { beforeEach, describe, expect, it } from "@jest/globals";
import type { ModelOption } from "@projectx/ui";

import { useModelStore } from "../modelStore";

const store = () => useModelStore.getState();

function model(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: "provider-1:deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    provider: "OpenCode Go",
    effort: "Medium",
    reasoning: true,
    vision: false,
    ...overrides,
  };
}

beforeEach(() => {
  store().setModels([]);
});

describe("model store", () => {
  it("replaces the selected model when the refreshed catalog heals it", () => {
    store().setModels([model()]);
    store().select(model(), "High");

    store().setModels([model({ vision: true })]);

    expect(store().current?.vision).toBe(true);
    expect(store().current?.effort).toBe("High");
  });

  it("keeps the selected id and drops a selection that disappeared", () => {
    store().setModels([model(), model({ id: "provider-1:other", label: "Other" })]);
    store().select(model({ id: "provider-1:other" }), "Standard");

    store().setModels([model({ vision: true })]);
    expect(store().current?.id).toBe(model().id);

    store().setModels([]);
    expect(store().current).toBeNull();
  });
});
