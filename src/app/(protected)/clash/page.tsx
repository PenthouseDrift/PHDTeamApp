import { redirect } from "next/navigation";

export default function ClashPage() {
  redirect("/cards?tab=clash");
}

