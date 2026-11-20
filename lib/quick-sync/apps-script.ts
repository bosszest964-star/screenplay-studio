/** Source pasted into the user's own Apps Script deployment. The setup wizard inserts a unique key. */
const template = String.raw`const PAIRING_KEY = "__PAIRING_KEY__";
const FOLDER = "ScreenplayStudio";
const PART_BYTES = 768 * 1024;

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function matchesKey_(key) {
  if (typeof key !== "string" || key.length !== PAIRING_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ PAIRING_KEY.charCodeAt(i);
  return diff === 0;
}

function check_(condition, message) {
  if (!condition) throw new Error(message);
}

function id_(value) {
  check_(typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value), "รหัสรายการไม่ถูกต้อง");
  return value;
}

function hash_(value) {
  check_(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "รหัสข้อมูลไม่ถูกต้อง");
  return value;
}

function folder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function file_(folder, name) {
  const found = folder.getFilesByName(name);
  return found.hasNext() ? found.next() : null;
}

function workspace_() {
  return folder_(folder_(DriveApp.getRootFolder(), FOLDER), "Quick Sync");
}

function list_(root) {
  const result = [];
  const projects = root.getFolders();
  while (projects.hasNext()) {
    const project = projects.next();
    if (!project.getName().startsWith("Project-")) continue;
    const files = project.getFilesByType(MimeType.PLAIN_TEXT);
    while (files.hasNext()) {
      const file = files.next();
      if (!file.getName().startsWith("revision-")) continue;
      try {
        const info = JSON.parse(file.getDescription());
        if (info && info.id && info.projectId === project.getName().slice(8)) result.push(info);
      } catch (_) {}
    }
  }
  const parents = new Set(result.map(function (revision) { return revision.parent; }));
  return result.filter(function (revision) { return !parents.has(revision.id); });
}

function putRevision_(root, data) {
  const projectId = id_(data.projectId);
  const hash = data.hash === "deleted" ? "deleted" : hash_(data.hash);
  const parent = data.parent == null ? undefined : id_(data.parent);
  check_(hash === "deleted" || (data.snapshot && data.snapshot.project.id === projectId), "โปรเจกต์ไม่ตรงกับไฟล์");
  const project = folder_(root, "Project-" + projectId);
  const revisionId = id_(data.id);
  const name = "revision-" + revisionId + ".json";
  const existing = file_(project, name);
  if (existing && existing.getDescription()) return JSON.parse(existing.getDescription());
  const revision = { id: revisionId, projectId: projectId, hash: hash, parent: parent, createdTime: new Date().toISOString() };
  const file = existing || project.createFile(name, JSON.stringify(data.snapshot || null), MimeType.PLAIN_TEXT);
  file.setDescription(JSON.stringify(revision));
  return revision;
}

function asset_(root, data, put) {
  const project = folder_(root, "Project-" + id_(data.projectId));
  const hash = hash_(data.hash);
  check_(Number.isInteger(data.index) && data.index >= 0 && data.index < 14, "ส่วนของรูปภาพไม่ถูกต้อง");
  const name = "asset-" + hash + "-" + data.index;
  const existing = file_(project, name);
  if (!put) {
    check_(existing, "ไม่พบส่วนของรูปใน Drive");
    return Utilities.base64Encode(existing.getBlob().getBytes());
  }
  if (existing) return true;
  check_(typeof data.base64 === "string" && data.base64.length <= PART_BYTES * 4 / 3, "รูปอ้างอิงส่วนนี้ใหญ่เกินไป");
  const bytes = Utilities.base64Decode(data.base64);
  check_(bytes.length > 0 && bytes.length <= PART_BYTES, "ข้อมูลรูปอ้างอิงไม่ถูกต้อง");
  project.createFile(Utilities.newBlob(bytes, "application/octet-stream", name));
  return true;
}

function styleParagraph_(paragraph, bold, font) {
  paragraph.setSpacingAfter(5);
  paragraph.editAsText().setFontFamily(font).setFontSize(12).setBold(Boolean(bold));
}

function docs_(root, data) {
  const folder = folder_(root, "Project-" + id_(data.projectId));
  const script = data.script;
  check_(script && typeof script.name === "string" &&
    ["international", "thai", "two-column"].includes(script.format) &&
    Array.isArray(script.paragraphs) && Array.isArray(script.rows), "รูปแบบบทไม่ถูกต้อง");
  const doc = DocumentApp.create(script.name.slice(0, 100) || "Screenplay");
  const docId = doc.getId();
  try {
    const body = doc.getBody();
    body.clear();
    body.setPageWidth(595.28).setPageHeight(841.89).setMarginLeft(56).setMarginRight(56);
    const title = body.appendParagraph(script.name);
    title.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(125).setSpacingAfter(15);
    title.editAsText().setFontFamily("Sarabun").setFontSize(26).setBold(true);
    const sub = body.appendParagraph("บทภาพยนตร์");
    styleParagraph_(sub, false, "Sarabun");
    sub.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (script.format === "two-column") {
      body.appendPageBreak();
      const table = body.appendTable([["ภาพ", "เสียง"]].concat(script.rows.map(function (row) {
        return [String(row.visual || ""), String(row.audio || "")];
      })));
      table.setColumnWidth(0, 240).setColumnWidth(1, 240);
      for (let i = 0; i < table.getNumRows(); i++) {
        for (let side = 0; side < 2; side++) {
          const cell = table.getCell(i, side);
          if (cell.getText()) cell.editAsText().setFontFamily("Sarabun").setFontSize(12).setBold(i === 0 || Boolean(script.rows[i - 1] && script.rows[i - 1].heading));
          if (i === 0) cell.setBackgroundColor("#eeeaf7");
        }
      }
    } else if (script.paragraphs.length) {
      body.appendPageBreak();
      script.paragraphs.forEach(function (item) {
        const text = String(item.text || "");
        const paragraph = body.appendParagraph(text);
        const international = script.format === "international";
        styleParagraph_(paragraph, ["sceneHeading", "character", "transition"].includes(item.kind),
          international && !/[\u0e00-\u0e7f]/.test(text) ? "Courier Prime" : "Sarabun");
        if (international) {
          if (item.kind === "character") paragraph.setIndentStart(155);
          if (item.kind === "dialogue") paragraph.setIndentStart(95).setIndentEnd(80);
          if (item.kind === "parenthetical") paragraph.setIndentStart(120).setIndentEnd(82);
          if (item.kind === "transition") paragraph.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        }
      });
    }
    doc.saveAndClose();
    DriveApp.getFileById(docId).moveTo(folder);
    return "https://docs.google.com/document/d/" + docId + "/edit";
  } catch (error) {
    DriveApp.getFileById(docId).setTrashed(true);
    throw error;
  }
}

function doPost(event) {
  let lock;
  try {
    const raw = event && event.postData && event.postData.contents;
    check_(typeof raw === "string" && raw.length <= 2097152, "ข้อมูลคำขอไม่ถูกต้อง");
    const request = JSON.parse(raw);
    if (!matchesKey_(request.key)) return json_({ ok: false, error: "รหัสจับคู่ไม่ตรงกับโค้ดที่ Deploy" });
    const data = request.payload || {};
    const op = request.operation;
    check_(["ping", "list", "publish", "snapshot", "assets", "putAsset", "getAsset", "docs"].includes(op), "คำสั่งไม่ถูกต้อง");
    // Serialize folder creation, immutable revision writes and asset chunk deduplication.
    lock = LockService.getScriptLock();
    check_(lock.tryLock(5000), "กำลังซิงค์จากอุปกรณ์อื่น ลองอีกครั้ง");
    const root = workspace_();
    let value;
    if (op === "ping") value = { version: 1 };
    if (op === "list") value = list_(root);
    if (op === "publish") value = putRevision_(root, data);
    if (op === "snapshot") {
      const project = folder_(root, "Project-" + id_(data.projectId));
      const file = file_(project, "revision-" + id_(data.id) + ".json");
      check_(file, "ไม่พบโปรเจกต์บน Drive");
      value = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    }
    if (op === "assets") {
      value = [];
      const project = folder_(root, "Project-" + id_(data.projectId));
      const files = project.getFilesByType("application/octet-stream");
      while (files.hasNext()) value.push(files.next().getName());
    }
    if (op === "putAsset" || op === "getAsset") value = asset_(root, data, op === "putAsset");
    if (op === "docs") value = docs_(root, data);
    return json_({ ok: true, value: value });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || "ทำรายการไม่สำเร็จ") });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
`;

export function appsScriptCode(key: string) {
  return template.replace("__PAIRING_KEY__", key);
}
