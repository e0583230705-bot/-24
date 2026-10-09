"use client";

import { useFormStatus } from "react-dom";
import { createDemoEngagementAction } from "@/app/actions";

function Submit({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? "מכין תיק לדוגמה..." : "תיק לדוגמה"}
    </button>
  );
}

/** יוצר תיק עם נתונים מדומים ומעביר אליו */
export function DemoEngagementButton({ className = "btn-ghost" }: { className?: string }) {
  return (
    <form action={createDemoEngagementAction}>
      <Submit className={className} />
    </form>
  );
}
