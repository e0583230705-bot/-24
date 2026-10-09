"use client";

import { useRef } from "react";
import { addMemberAction, type FormState } from "@/app/actions";
import { ROLES } from "@/lib/domain/permissions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

export function AddMemberForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending, ready] = useFormAction<FormState>(async (prev, formData) => {
    const result = await addMemberAction(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});
  return (
    <form ref={formRef} method="post" onSubmit={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          name="email"
          type="email"
          placeholder="אימייל של משתמש רשום"
          aria-label="אימייל"
          required
          className="input num"
        />
        <select name="role" defaultValue="accountant" className="input" aria-label="תפקיד">
          {Object.entries(ROLES).map(([key, r]) => (
            <option key={key} value={key}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn" disabled={pending || !ready}>
          הוספה
        </button>
      </div>
      <FormError message={state.error} />
      {state.ok && <p className="text-sm text-brand">המשתמש נוסף למשרד.</p>}
    </form>
  );
}
