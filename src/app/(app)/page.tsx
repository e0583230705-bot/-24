import { redirect } from "next/navigation";

/** דף הבית = תיקי הביקורת */
export default function HomePage() {
  redirect("/audit");
}
