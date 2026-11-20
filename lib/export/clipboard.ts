import { isBold, type ExportScript } from "./representation";

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!).replace(/\n/g, "<br>");
}

export function richScript(script: ExportScript) {
  const style = "font-family:Sarabun,Arial,sans-serif;font-size:12pt;line-height:1.4";
  const title = `<p style="font-size:25pt;text-align:center"><strong>${escapeHtml(script.name)}</strong></p>`;
  const content = script.format === "two-column"
    ? `<table style="border-collapse:collapse;width:100%"><tbody><tr><th>ภาพ</th><th>เสียง</th></tr>${script.rows.map((row) =>
      "<tr>" + [row.visual, row.audio].map((value) => {
        const text = escapeHtml(value);
        return `<td style="border:1px solid #bbb;width:50%;padding:6pt;vertical-align:top">${row.heading ? `<strong>${text}</strong>` : text}</td>`;
      }).join("") + "</tr>",
    ).join("")}</tbody></table>`
    : script.paragraphs.map(({ kind, text }) => {
      const alignment = script.format === "international" && kind === "transition" ? "text-align:right" : "";
      const indent = script.format === "international"
        ? ({ character: "margin-left:34%", dialogue: "margin-left:20%;margin-right:15%", parenthetical: "margin-left:25%" } as Record<string, string>)[kind] ?? ""
        : "";
      const escaped = escapeHtml(text);
      return `<p style="margin-top:0;margin-bottom:5pt;${alignment};${indent}">${isBold(kind) ? `<strong>${escaped}</strong>` : escaped}</p>`;
    }).join("");
  const plain = script.format === "two-column"
    ? ["ภาพ\tเสียง", ...script.rows.map(({ visual, audio }) => `${visual}\t${audio}`)].join("\n")
    : script.paragraphs.map(({ text }) => text).join("\n");
  return { html: `<div style="${style}">${title}${content}</div>`, text: script.name + "\n\n" + plain };
}

export async function copyRichScript(script: ExportScript) {
  const { html, text } = richScript(script);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
    return;
  }
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", text);
  };
  document.addEventListener("copy", onCopy, { once: true });
  try {
    if (!document.execCommand("copy")) throw new Error("คัดลอกบทไม่สำเร็จ");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}
