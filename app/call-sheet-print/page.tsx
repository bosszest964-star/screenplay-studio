import type { Metadata } from "next";
import { CallSheetPrint } from "@/components/production/call-sheet-print";

export const metadata: Metadata = { title: "พิมพ์ใบคิวถ่ายทำ — Sceneform" };

export default function CallSheetPrintPage() {
  return <CallSheetPrint />;
}
