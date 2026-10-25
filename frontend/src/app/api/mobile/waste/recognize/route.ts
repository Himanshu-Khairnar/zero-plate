import { ApiError } from "@/lib/api";
import { mobileRoute, preflight, requireMobileRole, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";
import { recognizeWaste } from "@/lib/waste-log";

/**
 * POST /api/mobile/waste/recognize, multipart fields `outletId` and `photo`
 * (JPEG/PNG/WEBP/HEIC, at most 5 MB). OWNER/MANAGER/KITCHEN_STAFF. Returns `VisionResult`.
 * Bad or missing photo gives 400; recognition service down gives 503; image rejected
 * by the service gives 422.
 */
export const POST = mobileRoute(async (req: Request) => {
  const { viewer } = await requireMobileSession(req);
  requireMobileRole(viewer, "OWNER", "MANAGER", "KITCHEN_STAFF");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("Send the photo as multipart/form-data with fields outletId and photo.");
  }
  const outletId = form.get("outletId");
  const outlet = await resolveMobileOutlet(viewer, typeof outletId === "string" ? outletId : null);
  return Response.json(await recognizeWaste(outlet.id, form.get("photo")));
});

export const OPTIONS = preflight;
