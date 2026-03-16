/**
 * useExport — PDF and image export using html-to-image + jsPDF.
 * Replaces html2canvas which crashes on Tailwind v4's oklab() colors.
 */
import { useCallback, useState } from "react";

export function useExport() {
  const [exporting, setExporting] = useState(false);

  const exportToPdf = useCallback(async (containerRef: React.RefObject<HTMLElement | null>, title: string = "DreamLoom Story") => {
    if (!containerRef.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      const dataUrl = await toPng(containerRef.current, {
        backgroundColor: "#0a0a1a",
        pixelRatio: 2,
      });

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = dataUrl;
      });

      const pdfWidth = img.width * 0.264583; // px to mm at 96dpi
      const pdfHeight = img.height * 0.264583;

      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${title.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const exportToImage = useCallback(async (containerRef: React.RefObject<HTMLElement | null>, title: string = "DreamLoom Story") => {
    if (!containerRef.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");

      const dataUrl = await toPng(containerRef.current, {
        backgroundColor: "#0a0a1a",
        pixelRatio: 2,
      });

      const link = document.createElement("a");
      link.download = `${title.replace(/\s+/g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Image export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  return { exportToPdf, exportToImage, exporting };
}
