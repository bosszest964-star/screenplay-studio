const driveUrl = "https://www.googleapis.com/drive/v3";
const uploadUrl = "https://www.googleapis.com/upload/drive/v3";
const folderMime = "application/vnd.google-apps.folder";
const fields = "id,name,mimeType,createdTime,appProperties";

export interface GoogleSession {
  configured: boolean;
  accessToken?: string;
  expiresAt?: number;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  appProperties?: Record<string, string>;
}

export interface GoogleAccount { accountId: string; email?: string }

export class GoogleRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Google API request failed (${status})`);
  }
}

export async function googleSession(refresh = false): Promise<GoogleSession> {
  const response = await fetch(`/api/google?action=session${refresh ? "&refresh=1" : ""}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(18_000),
  });
  if (response.status === 404 || !response.headers.get("Content-Type")?.includes("application/json")) {
    return { configured: false };
  }
  if (!response.ok) throw new GoogleRequestError(response.status);
  return await response.json() as GoogleSession;
}

export async function googleFetch(token: string, url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new GoogleRequestError(response.status);
  return response;
}

function quote(value: string) {
  return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

export function driveProperty(key: string, value: string) {
  return `appProperties has { key=${quote(key)} and value=${quote(value)} }`;
}

export class GoogleDrive {
  constructor(readonly token: string) {}

  async account(): Promise<GoogleAccount> {
    const response = await googleFetch(this.token, driveUrl + "/about?fields=user(permissionId,emailAddress)");
    const { user } = await response.json() as { user: { permissionId?: string; emailAddress?: string } };
    if (!user.permissionId) throw new Error("ไม่สามารถระบุบัญชี Drive ได้");
    return { accountId: user.permissionId, email: user.emailAddress };
  }

  async list(filter: string) {
    const files: DriveFile[] = [];
    const query = new URLSearchParams({ q: `trashed=false and (${filter})`, fields: `nextPageToken,files(${fields})`, pageSize: "1000", orderBy: "createdTime" });
    do {
      const response = await googleFetch(this.token, `${driveUrl}/files?${query}`);
      const page = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
      files.push(...page.files ?? []);
      if (!page.nextPageToken) break;
      query.set("pageToken", page.nextPageToken);
    } while (true);
    return files;
  }

  async create(name: string, mimeType: string, parent?: string, appProperties?: Record<string, string>) {
    const response = await googleFetch(this.token, driveUrl + "/files?fields=" + fields, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType, parents: parent ? [parent] : undefined, appProperties }),
    });
    return await response.json() as DriveFile;
  }

  async patch(id: string, properties: { trashed?: boolean; name?: string }) {
    await googleFetch(this.token, `${driveUrl}/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(properties),
    });
  }

  async upload(name: string, content: Blob, parent: string, properties: Record<string, string>) {
    const boundary = "sceneform_" + crypto.randomUUID();
    const metadata = { name, parents: [parent], appProperties: properties, mimeType: content.type };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${content.type}\r\n\r\n`, content, `\r\n--${boundary}--\r\n`,
    ]);
    const response = await googleFetch(this.token, `${uploadUrl}/files?uploadType=multipart&fields=${fields}`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    return await response.json() as DriveFile;
  }

  download(id: string) {
    return googleFetch(this.token, `${driveUrl}/files/${encodeURIComponent(id)}?alt=media`);
  }

  async workspace() {
    const matches = await this.list(`mimeType=${quote(folderMime)} and ${driveProperty("ssType", "root")}`);
    return matches[0] ?? this.create("ScreenplayStudio", folderMime, undefined, { ssType: "root" });
  }

  async projectFolder(root: string, project: { id: string; name: string }) {
    const matches = await this.list(`mimeType=${quote(folderMime)} and ${driveProperty("ssType", "project")} and ${driveProperty("ssProject", project.id)}`);
    return matches[0] ?? this.create(project.name, folderMime, root, { ssType: "project", ssProject: project.id });
  }
}
