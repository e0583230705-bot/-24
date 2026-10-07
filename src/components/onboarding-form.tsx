"use client";

import { createOrganizationAction, type FormState } from "@/app/actions";
import { FormError } from "./form-error";
import { useFormAction } from "./submit";

/** הקמת משרד רואי חשבון: שם, ח.פ. / מספר עוסק, ופרטי קשר */
export function OnboardingForm() {
  const [state, action, pending, ready] = useFormAction<FormState>(createOrganizationAction, {});
  return (
    <form method="post" onSubmit={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">שם המשרד</label>
          <input id="name" name="name" required className="input" placeholder="למשל: כהן ושות׳ רואי חשבון" />
        </div>
        <div>
          <label className="label" htmlFor="taxId">מספר ח.פ. / עוסק</label>
          <input id="taxId" name="taxId" required inputMode="numeric" className="input num" />
        </div>
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">טלפון</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">כתובת</label>
          <input id="address" name="address" className="input" />
        </div>
      </div>
      <FormError message={state.error} />
      <button className="btn" disabled={pending || !ready}>
        {pending ? "יוצר..." : "הקמת המשרד"}
      </button>
    </form>
  );
}
