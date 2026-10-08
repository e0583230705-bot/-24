"use client";

export function PrintButton({ label = "הדפסה / שמירה כ־PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-sm print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
