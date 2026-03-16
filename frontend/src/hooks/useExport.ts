/**
 * useExport — Storybook PDF and scene-image ZIP export.
 *
 * PDF: title page (cover + logline) followed by one page per scene
 *      with interleaved images and wrapped narration text — like a book.
 * Images: every scene image bundled into a .zip download.
 */
import { useCallback, useState } from "react";
import type { StoryPage } from "../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Fetch a URL and return a base64 data-URL. */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fetch a URL and return a raw Blob. */
async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/** Get pixel dimensions of a data-URL image. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useExport() {
  const [exporting, setExporting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  PDF — storybook layout                                           */
  /* ---------------------------------------------------------------- */
  const exportToPdf = useCallback(
    async (
      pages: StoryPage[],
      title: string,
      coverUrl?: string,
      logline?: string,
    ) => {
      if (exporting) return;
      setExporting(true);
      try {
        const { jsPDF } = await import("jspdf");

        const pageW = 210; // A4 mm
        const pageH = 297;
        const margin = 20;
        const contentW = pageW - margin * 2;

        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        /* ---------- Title page ---------- */
        let y = margin;

        if (coverUrl) {
          try {
            const dataUrl = await fetchImageAsDataUrl(coverUrl);
            const img = await loadImage(dataUrl);
            const ratio = img.height / img.width;
            const imgW = contentW;
            const imgH = Math.min(imgW * ratio, pageH * 0.5);
            const drawW = imgH < imgW * ratio ? imgH / ratio : imgW;
            const imgX = margin + (contentW - drawW) / 2;
            pdf.addImage(dataUrl, "PNG", imgX, y, drawW, imgH);
            y += imgH + 10;
          } catch {
            /* cover unavailable — skip */
          }
        }

        // Title
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(28);
        pdf.setTextColor(30, 30, 30);
        const titleLines: string[] = pdf.splitTextToSize(title, contentW);
        pdf.text(titleLines, pageW / 2, y, { align: "center" });
        y += titleLines.length * 12 + 8;

        // Logline
        if (logline) {
          pdf.setFont("helvetica", "italic");
          pdf.setFontSize(13);
          pdf.setTextColor(80, 80, 80);
          const llLines: string[] = pdf.splitTextToSize(logline, contentW - 20);
          pdf.text(llLines, pageW / 2, y, { align: "center" });
        }

        /* ---------- Scene pages ---------- */
        for (const page of pages) {
          pdf.addPage();
          y = margin;

          // Scene heading
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(18);
          pdf.setTextColor(30, 30, 30);
          const heading = `Scene ${page.sceneNumber}${page.title ? ` — ${page.title}` : ""}`;
          const hLines: string[] = pdf.splitTextToSize(heading, contentW);
          pdf.text(hLines, margin, y);
          y += hLines.length * 8 + 4;

          // Thin separator
          pdf.setDrawColor(180, 180, 180);
          pdf.setLineWidth(0.3);
          pdf.line(margin, y, pageW - margin, y);
          y += 6;

          // Interleaved blocks
          for (const block of page.blocks) {
            if (block.type === "image" && block.url) {
              if (y > pageH - margin - 50) {
                pdf.addPage();
                y = margin;
              }
              try {
                const dataUrl = await fetchImageAsDataUrl(block.url);
                const img = await loadImage(dataUrl);
                const ratio = img.height / img.width;
                const imgW = contentW;
                const imgH = imgW * ratio;
                const available = pageH - y - margin - 5;

                if (available < 50) {
                  pdf.addPage();
                  y = margin;
                }

                const maxH = pageH - y - margin - 5;
                const drawH = Math.min(imgH, maxH);
                const drawW = drawH < imgH ? drawH / ratio : imgW;
                const imgX = margin + (contentW - drawW) / 2;
                pdf.addImage(dataUrl, "PNG", imgX, y, drawW, drawH);
                y += drawH + 6;
              } catch {
                /* image load failed — skip */
              }
            } else if (block.type === "text" && block.content) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(11);
              pdf.setTextColor(40, 40, 40);
              const lineH = 5;
              const lines: string[] = pdf.splitTextToSize(
                block.content,
                contentW,
              );
              for (const line of lines) {
                if (y > pageH - margin) {
                  pdf.addPage();
                  y = margin;
                }
                pdf.text(line, margin, y);
                y += lineH;
              }
              y += 4;
            }
          }
        }

        pdf.save(`${title.replace(/\s+/g, "_")}_Storybook.pdf`);
      } catch (err) {
        console.error("PDF export failed:", err);
      } finally {
        setExporting(false);
      }
    },
    [exporting],
  );

  /* ---------------------------------------------------------------- */
  /*  Images — ZIP of all scene images                                 */
  /* ---------------------------------------------------------------- */
  const exportImages = useCallback(
    async (pages: StoryPage[], title: string) => {
      if (exporting) return;
      setExporting(true);
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();

        let imageIndex = 0;
        for (const page of pages) {
          for (const block of page.blocks) {
            if (block.type === "image" && block.url) {
              imageIndex++;
              try {
                const blob = await fetchBlob(block.url);
                // Derive extension from blob MIME, default to png
                const ext =
                  blob.type === "image/jpeg"
                    ? "jpg"
                    : blob.type === "image/webp"
                      ? "webp"
                      : "png";
                const sceneName = page.title
                  ? page.title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)
                  : `scene_${page.sceneNumber}`;
                zip.file(
                  `${String(imageIndex).padStart(2, "0")}_${sceneName}.${ext}`,
                  blob,
                );
              } catch {
                /* skip failed image */
              }
            }
          }
        }

        if (imageIndex === 0) {
          console.warn("No scene images to export");
          return;
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipBlob);
        link.download = `${title.replace(/\s+/g, "_")}_Images.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error("Image ZIP export failed:", err);
      } finally {
        setExporting(false);
      }
    },
    [exporting],
  );

  return { exportToPdf, exportImages, exporting };
}
