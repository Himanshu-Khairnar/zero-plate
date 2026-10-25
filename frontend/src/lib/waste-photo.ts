// Pure rules for waste photos (no Prisma, no server-only) so they can be unit tested.
// Shared by the waste server actions and the mobile API.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export const PHOTO_TYPE_ERROR = "Photo must be a JPEG, PNG, WEBP or HEIC image.";
export const PHOTO_SIZE_ERROR = "Photo must be 5 MB or smaller.";
export const PHOTO_MISSING_ERROR = "Attach a photo first.";

/** Why a photo for recognition is unacceptable, or null if it is fine. */
export function photoProblem(photo: unknown): string | null {
  if (!(photo instanceof File) || photo.size === 0) return PHOTO_MISSING_ERROR;
  if (!PHOTO_TYPES[photo.type]) return PHOTO_TYPE_ERROR;
  if (photo.size > MAX_PHOTO_BYTES) return PHOTO_SIZE_ERROR;
  return null;
}

/**
 * HTTP status for a failed call to the ML service's recognition endpoint:
 * the service being down or failing (5xx) is 503, a rejected image (4xx) is 422.
 */
export function recognitionFailureStatus(mlStatus: number | null): 422 | 503 {
  return mlStatus != null && mlStatus >= 400 && mlStatus < 500 ? 422 : 503;
}
