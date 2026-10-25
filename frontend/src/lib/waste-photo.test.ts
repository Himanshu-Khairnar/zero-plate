import { describe, expect, it } from "vitest";

import { MAX_PHOTO_BYTES, PHOTO_MISSING_ERROR, PHOTO_SIZE_ERROR, PHOTO_TYPE_ERROR, photoProblem, recognitionFailureStatus } from "./waste-photo";

const file = (bytes: number, type: string) => new File([new Uint8Array(bytes)], "x", { type });

describe("photoProblem", () => {
  it("accepts JPEG, PNG, WEBP and HEIC up to 5 MB", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) expect(photoProblem(file(10, t))).toBeNull();
    expect(photoProblem(file(MAX_PHOTO_BYTES, "image/jpeg"))).toBeNull();
  });
  it("rejects missing, empty or non-file values", () => {
    expect(photoProblem(null)).toBe(PHOTO_MISSING_ERROR);
    expect(photoProblem("photo")).toBe(PHOTO_MISSING_ERROR);
    expect(photoProblem(file(0, "image/jpeg"))).toBe(PHOTO_MISSING_ERROR);
  });
  it("rejects other types and oversized photos", () => {
    expect(photoProblem(file(10, "image/gif"))).toBe(PHOTO_TYPE_ERROR);
    expect(photoProblem(file(MAX_PHOTO_BYTES + 1, "image/png"))).toBe(PHOTO_SIZE_ERROR);
  });
});

describe("recognitionFailureStatus", () => {
  it("is 503 when the service is unreachable or failing", () => {
    expect(recognitionFailureStatus(null)).toBe(503);
    expect(recognitionFailureStatus(500)).toBe(503);
    expect(recognitionFailureStatus(502)).toBe(503);
  });
  it("is 422 when the service rejects the image", () => {
    expect(recognitionFailureStatus(400)).toBe(422);
    expect(recognitionFailureStatus(422)).toBe(422);
  });
});
