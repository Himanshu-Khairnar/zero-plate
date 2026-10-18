"use client";

import { useState, useTransition } from "react";
import { MapPin, Trash2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

import { assignUserToOutlet, changeUserRole, removeUser, revokeInvitation, unassignUserFromOutlet } from "@/actions/staff";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/dashboard/role-badge";

export type StaffUser = { id: string; name: string; email: string; role: "OWNER" | "MANAGER" | "KITCHEN_STAFF" | "PLATFORM_ADMIN"; outlets: { id: string; name: string }[]; createdAt: string };
export type StaffInvite = { id: string; email: string; role: string; outletName: string | null; expiresAt: string; expired: boolean };
export type OutletOpt = { id: string; name: string };

export function StaffManager({ users, invites, outlets, viewerId, canEdit }: { users: StaffUser[]; invites: StaffInvite[]; outlets: OutletOpt[]; viewerId: string; canEdit: boolean }) {
  const [assignFor, setAssignFor] = useState<StaffUser | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(okMsg);
      else toast.error(r.error ?? "Failed");
    });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Roles decide what each person sees; outlet assignments decide which outlet managers and kitchen staff work in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Outlets</TableHead>
                <TableHead>Joined</TableHead>
                {canEdit ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const self = u.id === viewerId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}{self ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      {canEdit && !self ? (
                        <NativeSelect value={u.role} className="h-8 w-40" disabled={pending} onChange={(e) => run(() => changeUserRole({ userId: u.id, role: e.target.value as "OWNER" | "MANAGER" | "KITCHEN_STAFF" }), "Role updated")}>
                          <NativeSelectOption value="OWNER">Owner</NativeSelectOption>
                          <NativeSelectOption value="MANAGER">Manager</NativeSelectOption>
                          <NativeSelectOption value="KITCHEN_STAFF">Kitchen staff</NativeSelectOption>
                        </NativeSelect>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {u.outlets.length === 0 ? <span className="text-xs text-muted-foreground">{u.role === "OWNER" ? "all outlets" : "none"}</span> : null}
                        {u.outlets.map((o) => (
                          <Badge key={o.id} variant="secondary" className="gap-1">
                            {o.name}
                            {canEdit ? (
                              <button type="button" aria-label={`Remove ${o.name}`} className="rounded-full hover:text-destructive" onClick={() => run(() => unassignUserFromOutlet({ userId: u.id, outletId: o.id }), "Assignment removed")}>
                                <X className="size-3" />
                              </button>
                            ) : null}
                          </Badge>
                        ))}
                        {canEdit && u.role !== "OWNER" ? (
                          <Button variant="ghost" size="xs" onClick={() => setAssignFor(u)}><MapPin data-icon="inline-start" /> Assign</Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("en-IN")}</TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        {!self ? (
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${u.name}`} />}>
                              <UserMinus />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {u.name}?</AlertDialogTitle>
                                <AlertDialogDescription>They lose access immediately. Their past actions stay in the activity log.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => run(() => removeUser(u.id), "User removed")}>Remove</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>Links are valid for 48 hours. Expired ones can be revoked and re-sent.</CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No pending invitations</EmptyTitle>
                <EmptyDescription>Use &ldquo;Invite staff&rdquo; above to add a manager or kitchen member.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Expires</TableHead>
                  {canEdit ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell><Badge variant="outline">{i.role.replace("_", " ").toLowerCase()}</Badge></TableCell>
                    <TableCell className="text-sm">{i.outletName ?? "—"}</TableCell>
                    <TableCell>{i.expired ? <Badge variant="destructive">expired</Badge> : <span className="text-xs text-muted-foreground">{new Date(i.expiresAt).toLocaleString("en-IN")}</span>}</TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" aria-label="Revoke invitation" disabled={pending} onClick={() => run(() => revokeInvitation(i.id), "Invitation revoked")}><Trash2 /></Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {assignFor ? (
        <AssignDialog user={assignFor} outlets={outlets.filter((o) => !assignFor.outlets.some((x) => x.id === o.id))} onClose={() => setAssignFor(null)} />
      ) : null}
    </div>
  );
}

function AssignDialog({ user, outlets, onClose }: { user: StaffUser; outlets: OutletOpt[]; onClose: () => void }) {
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {user.name} to an outlet</DialogTitle>
          <DialogDescription>They will see that outlet&apos;s plans, kitchen mode and data.</DialogDescription>
        </DialogHeader>
        {outlets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Already assigned to every outlet.</p>
        ) : (
          <NativeSelect value={outletId} onChange={(e) => setOutletId(e.target.value)}>
            {outlets.map((o) => <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !outletId} onClick={() => start(async () => {
            const r = await assignUserToOutlet({ userId: user.id, outletId });
            if (r.ok) { toast.success("Assigned"); onClose(); } else toast.error(r.error);
          })}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
