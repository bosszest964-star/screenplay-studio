import { maxRelayBytes, validDeployment, validPairingKey } from "../lib/quick-sync/link";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function error(status: number, message: string) {
  return Response.json({ ok: false, error: message }, { status, headers });
}

async function boundedText(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) throw new Error("Empty body");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let body = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return body + decoder.decode();
      length += part.value.byteLength;
      if (length > maxRelayBytes) throw new Error("Body too large");
      body += decoder.decode(part.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return error(405, "รองรับ POST เท่านั้น");
    if (request.headers.get("Origin") !== new URL(request.url).origin) return error(403, "คำขอต้องมาจากแอป");
    if (Number(request.headers.get("Content-Length")) > maxRelayBytes) return error(413, "ข้อมูลเกินขนาดที่รองรับ");

    let data: { endpoint?: unknown; key?: unknown; operation?: unknown; payload?: unknown };
    try {
      data = JSON.parse(await boundedText(request.body));
      if (!data || !validDeployment(data.endpoint) || !validPairingKey(data.key) || typeof data.operation !== "string") {
        return error(400, "ลิงก์หรือรหัสจับคู่ไม่ถูกต้อง");
      }
    } catch {
      return error(400, "ข้อมูลคำขอไม่ถูกต้องหรือใหญ่เกินไป");
    }

    const signal = AbortSignal.timeout(24_000);
    try {
      // Apps Script serves ContentService responses from a one-time Google URL.
      let response = await fetch(data.endpoint, {
        method: "POST", redirect: "manual", signal,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: JSON.stringify({ key: data.key, operation: data.operation, payload: data.payload }),
      });
      if ([302, 303].includes(response.status)) {
        const location = response.headers.get("Location");
        const url = location && new URL(location);
        if (!url || url.origin !== "https://script.googleusercontent.com" || url.pathname !== "/macros/echo" ||
          url.username || url.password) return error(502, "ตรวจการเผยแพร่ Web App และเลือกผู้เข้าถึงเป็น Anyone");
        response = await fetch(url.href, { redirect: "error", signal });
      }
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
        return error(502, "เปิด Web App ไม่สำเร็จ ตรวจว่าใช้ URL ลงท้าย /exec และเลือก Anyone");
      }
      return new Response(await boundedText(response.body), {
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      });
    } catch {
      return error(502, "ติดต่อ Apps Script ไม่สำเร็จ ลองอีกครั้ง");
    }
  },
};
