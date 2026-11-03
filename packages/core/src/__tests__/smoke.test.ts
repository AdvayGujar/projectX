import { describe, expect, it } from "vitest";

import { AppError } from "../index";

describe("core", () => {
  it("exposes a typed application error", () => {
    const error = new AppError("db_invalid", "boom", { userMessage: "Try again." });
    expect(error.code).toBe("db_invalid");
    expect(error.userMessage).toBe("Try again.");
    expect(error.retryable).toBe(false);
  });
});
