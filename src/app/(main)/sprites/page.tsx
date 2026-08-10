import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** El taller de sprites vive solo en el Lab (pestaña Sprites). */
export default function SpritesPage() {
  redirect("/lab?tab=sprites");
}
