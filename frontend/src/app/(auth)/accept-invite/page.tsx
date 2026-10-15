import Link from "next/link"

import { prisma } from "@/lib/prisma"
import { AcceptInviteForm } from "@/components/auth/accept-invite-form"
import { RoleBadge } from "@/components/dashboard/role-badge"

function InviteMessage({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  )
}

function isInvitationExpired(expiresAt: Date) {
  return expiresAt.getTime() < Date.now()
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <InviteMessage
        title="Invalid invitation"
        message="This invitation link is missing a token."
      />
    )
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
      outlet: { select: { name: true } },
    },
  })

  if (!invitation) {
    return (
      <InviteMessage
        title="Invalid invitation"
        message="We couldn't find an invitation for this link."
      />
    )
  }

  if (invitation.acceptedAt) {
    return (
      <InviteMessage
        title="Invitation already used"
        message="This invitation has already been accepted."
      />
    )
  }

  if (isInvitationExpired(invitation.expiresAt)) {
    return (
      <InviteMessage
        title="Invitation expired"
        message="This invitation has expired. Please ask for a new one."
      />
    )
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
        <p className="text-muted-foreground">
          You&apos;ve been invited to join{" "}
          <span className="font-medium text-foreground">
            {invitation.organization.name}
          </span>
          {invitation.outlet ? (
            <>
              {" "}
              at{" "}
              <span className="font-medium text-foreground">
                {invitation.outlet.name}
              </span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          <span>Role:</span>
          <RoleBadge role={invitation.role} />
        </div>
      </div>

      <AcceptInviteForm token={token} email={invitation.email} />
    </div>
  )
}
