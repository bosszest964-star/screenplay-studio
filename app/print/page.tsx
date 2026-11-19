import type { Metadata } from "next";
import { PrintPage } from "@/components/export/print-page";

export const metadata: Metadata = { title: "ตัวอย่างก่อนพิมพ์ — Sceneform" };

export default function Print() {
  return <PrintPage />;
}
