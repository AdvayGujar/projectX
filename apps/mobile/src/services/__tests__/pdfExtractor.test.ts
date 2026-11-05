import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  extractTextFromPage,
  getPageCount,
  isAvailable,
} from "expo-pdf-text-extract";

import { createExpoPdfPort } from "../pdfExtractor";

jest.mock("expo-pdf-text-extract", () => ({
  isAvailable: jest.fn(),
  getPageCount: jest.fn(),
  extractTextFromPage: jest.fn(),
}));

const mockedIsAvailable = jest.mocked(isAvailable);
const mockedGetPageCount = jest.mocked(getPageCount);
const mockedExtractPage = jest.mocked(extractTextFromPage);
const REPORT = "file:///sandbox/report.pdf";

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsAvailable.mockReturnValue(true);
});

describe("expo PDF port", () => {
  it("reads the page count and extracts a page", async () => {
    mockedGetPageCount.mockResolvedValue(7);
    mockedExtractPage.mockResolvedValue("Page body");
    const port = createExpoPdfPort();

    await expect(port.getPageCount(REPORT)).resolves.toBe(7);
    await expect(port.extractPage(REPORT, 3)).resolves.toBe("Page body");

    expect(mockedGetPageCount).toHaveBeenCalledWith(REPORT);
    expect(mockedExtractPage).toHaveBeenCalledWith(REPORT, 3);
  });

  it("fails with a readable message when the native module is unavailable", async () => {
    mockedIsAvailable.mockReturnValue(false);
    const port = createExpoPdfPort();

    await expect(port.getPageCount(REPORT)).rejects.toMatchObject({
      code: "unknown",
      userMessage: "PDF reading is not available in this build.",
    });
    expect(mockedGetPageCount).not.toHaveBeenCalled();
  });

  it("checks the signal before and after a native call", async () => {
    const before = new AbortController();
    before.abort();
    const port = createExpoPdfPort();

    await expect(
      port.getPageCount(REPORT, { signal: before.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(mockedGetPageCount).not.toHaveBeenCalled();

    const during = new AbortController();
    mockedExtractPage.mockImplementation(async () => {
      during.abort();
      return "Page body";
    });

    await expect(
      port.extractPage(REPORT, 1, { signal: during.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(mockedExtractPage).toHaveBeenCalledWith(REPORT, 1);
  });

  it("times out a native call", async () => {
    jest.useFakeTimers();
    try {
      mockedGetPageCount.mockImplementation(
        () => new Promise<number>(() => undefined),
      );
      const port = createExpoPdfPort();
      const pending = port.getPageCount(REPORT);

      jest.advanceTimersByTime(30_000);

      await expect(pending).rejects.toMatchObject({
        userMessage: "Reading this PDF took too long.",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("maps password errors to a readable message", async () => {
    mockedGetPageCount.mockImplementation(() =>
      Promise.reject({ code: "PASSWORD_REQUIRED" }),
    );
    mockedExtractPage.mockImplementation(() =>
      Promise.reject({ code: "INCORRECT_PASSWORD" }),
    );
    const port = createExpoPdfPort();

    await expect(port.getPageCount(REPORT)).rejects.toMatchObject({
      userMessage: "This PDF is password-protected.",
    });
    await expect(port.extractPage(REPORT, 1)).rejects.toMatchObject({
      userMessage: "This PDF is password-protected.",
    });
  });

  it("maps file, corruption, and unknown failures", async () => {
    const port = createExpoPdfPort();

    mockedGetPageCount.mockImplementation(() =>
      Promise.reject({ code: "FILE_NOT_FOUND" }),
    );
    await expect(port.getPageCount(REPORT)).rejects.toMatchObject({
      code: "file_not_found",
    });

    mockedExtractPage.mockImplementation(() =>
      Promise.reject({ code: "CORRUPT_PDF" }),
    );
    await expect(port.extractPage(REPORT, 1)).rejects.toMatchObject({
      userMessage: "This PDF could not be read.",
    });

    mockedExtractPage.mockImplementation(() =>
      Promise.reject(new Error("native failure")),
    );
    await expect(port.extractPage(REPORT, 1)).rejects.toMatchObject({
      userMessage: "Could not read this PDF.",
    });
  });
});
