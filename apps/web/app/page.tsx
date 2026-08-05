import { branding } from "@careerid/branding";

// Milestone 1.1 shell — real surfaces (user/institution/employer/admin/share)
// are built in their own milestones, see docs/ROADMAP.md.
export default function Home() {
  return (
    <main style={{ padding: "4rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>{branding.productName}</h1>
      <p>{branding.tagline.en}</p>
    </main>
  );
}
