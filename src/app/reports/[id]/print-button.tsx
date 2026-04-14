"use client";

export function PrintButton() {
  return (
    <>
      <button
        onClick={() => window.print()}
        className="no-print"
        style={{
          padding: "0.5rem 1.25rem",
          fontSize: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 600,
          letterSpacing: "0.05em",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Print / Save PDF
      </button>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </>
  );
}
