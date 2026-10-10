import { startTransition, useActionState, useSyncExternalStore, type FormEvent } from "react";

/** קבצים שכבר דחוסים — אין טעם לדחוס שוב */
const ALREADY_COMPRESSED = /\.(xlsx|xlsm|xls|zip|gz|pdf|jpe?g|png|gif|webp|heic)$/i;
/** מתחת לגודל הזה שולחים כמו שהוא */
const COMPRESS_FROM = 256 * 1024;

/**
 * בקשה לשרת מוגבלת ל־6MB, וקובצי ספרים ושכר גדולים מזה. קובצי טקסט נדחסים כאן (gzip, בערך פי 8)
 * והשרת פותח אותם (`src/lib/upload.ts`). השם נשמר — לפיו מזהים BKMVDATA / INI וסוג הקובץ.
 */
async function compressFiles(formData: FormData): Promise<FormData> {
  if (typeof CompressionStream === "undefined") return formData;
  const out = new FormData();
  for (const [key, value] of formData.entries()) {
    if (value instanceof File && value.size >= COMPRESS_FROM && !ALREADY_COMPRESSED.test(value.name)) {
      const blob = await new Response(value.stream().pipeThrough(new CompressionStream("gzip"))).blob();
      out.append(key, new File([blob], value.name, { type: "application/gzip" }));
    } else {
      out.append(key, value);
    }
  }
  return out;
}

/**
 * React מאפס טופס אחרי כל שליחה דרך action — גם כשחזרה שגיאה, ואז המשתמש מאבד את מה שהקליד.
 * שליחה דרך onSubmit שומרת את הערכים; איפוס אחרי הצלחה נעשה במפורש במקום שצריך.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const hasFiles = [...formData.values()].some((v) => v instanceof File && v.size > 0);
    if (!hasFiles) {
      startTransition(() => dispatch(formData));
      return;
    }
    startTransition(async () => {
      const compressed = await compressFiles(formData);
      startTransition(() => dispatch(compressed));
    });
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
