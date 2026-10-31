import { redirect } from "next/navigation";

/** Results live with the reports. */
export default function ResultsPage() {
  redirect("/dashboard/reports");
}
