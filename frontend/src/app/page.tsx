import { Landing } from "@/components/landing/landing"

// Signed-in users are sent to their home page by src/middleware.ts,
// so this route only ever renders the static landing page.
export default function RootPage() {
  return <Landing />
}
