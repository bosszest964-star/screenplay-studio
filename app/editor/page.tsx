import type { Metadata } from "next";
import { EditorPage } from "@/components/editor/editor-page";

export const metadata: Metadata = { title: "ตัวแก้ไขบท — Sceneform" };

export default function Editor() {
  return <EditorPage />;
}
