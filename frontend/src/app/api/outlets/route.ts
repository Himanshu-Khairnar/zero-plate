import { handle, requireSession } from "@/lib/api";
import { listOutlets } from "@/lib/outlets";

export const GET = handle(async () => {
  const viewer = await requireSession();
  return Response.json(await listOutlets(viewer));
});
