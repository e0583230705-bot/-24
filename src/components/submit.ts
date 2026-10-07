import { startTransition, useActionState, useSyncExternalStore, type FormEvent } from "react";

/**
 * React מאפס טופס אחרי כל שליחה דרך action — גם כשחזרה שגיאה, ואז המשתמש מאבד את מה שהקליד.
 * שליחה דרך onSubmit שומרת את הערכים; איפוס אחרי הצלחה נעשה במפורש במקום שצריך.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}

const noopSubscribe = () => () => {};

/**
 * עטיפה ל־useActionState לטפסים שנשלחים דרך onSubmit.
 * ready=false עד שהדף נטען בדפדפן: לפני כן לחיצה הייתה שולחת את הטופס בשיטה הישנה
 * (GET), והפרטים — כולל סיסמאות — היו מופיעים בכתובת הדף. לכן הכפתור מושבת עד אז.
 */
export function useFormAction<State>(
  serverAction: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(serverAction, initialState);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return [state, submitKeepingValues(dispatch), pending, ready] as const;
}
