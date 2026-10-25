import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { deleteWasteEntry } from "@/lib/waste-log";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/mobile/waste/:id?outletId= (OWNER/MANAGER). Entry not in the outlet gives 404. */
export const DELETE = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const { viewer, outlet } = await requireMobileOutlet(req, url.searchParams.get("outletId"), "OWNER", "MANAGER");
  await deleteWasteEntry(viewer, outlet.id, id);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
