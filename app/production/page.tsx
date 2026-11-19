import type { Metadata } from "next";
import { ProductionPage } from "@/components/production/production-page";

export const metadata: Metadata = { title: "วางแผนเรื่อง — Sceneform" };

export default function Production() {
  return <ProductionPage />;
}
