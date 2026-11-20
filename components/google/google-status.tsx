"use client";

import { Cloud, CloudCheck, CloudOff, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { appsScriptCode } from "@/lib/quick-sync/apps-script";
import { createPairingLink, newPairingKey, readPairingLink, validDeployment, validPairingKey, type SyncLink } from "@/lib/quick-sync/link";
import { useGoogle } from "./google-provider";
import "./google.css";

const draftKey = "sceneform-quick-sync-draft";

function qrSource(link: string) {
  const code = qrcode(0, "M");
  code.addData(link);
  code.make();
  return code.createDataURL(3, 12);
}

export function GoogleStatus({ beforeConnect }: { beforeConnect?: () => Promise<boolean> }) {
  const google = useGoogle();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [pair, setPair] = useState<SyncLink>();
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState("");
  const Icon = google.status === "offline" ? CloudOff : google.status === "syncing" ? LoaderCircle :
    google.status === "synced" ? CloudCheck : Cloud;

  const link = origin && google.connection ? createPairingLink(origin, google.connection) : "";
  const qr = useMemo(() => link ? qrSource(link) : "", [link]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const initial = readPairingLink(window.location.hash);
    if (initial) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setPair(initial);
      setOpen(true);
    }
  }, []);

  function initializeSetup() {
    let generated: string | null = null;
    try {
      generated = sessionStorage.getItem(draftKey);
      if (!validPairingKey(generated)) {
        generated = newPairingKey();
        sessionStorage.setItem(draftKey, generated);
      }
    } catch {
      generated ??= newPairingKey();
    }
    setKey(generated);
  }

  async function start() {
    setNote("");
    if (!google.connected && !key) initializeSetup();
    setOpen(true);
    if (google.connected && google.online && (!beforeConnect || await beforeConnect())) void google.sync();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote("");
    const next = pair ?? { endpoint: endpoint.trim(), key };
    if (!validDeployment(next.endpoint)) {
      setNote("วาง URL ของ Google Apps Script Web App ที่ลงท้ายด้วย /exec");
      return;
    }
    setWorking(true);
    try {
      if (beforeConnect && !await beforeConnect()) {
        setNote("กรุณาบันทึกบทให้เรียบร้อยแล้วลองอีกครั้ง");
        return;
      }
      await google.connect(next);
      setPair(undefined);
      setNote("เชื่อมต่อแล้ว สแกน QR เพื่อเชื่อมเครื่องอื่นได้");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ ลองตรวจ URL แล้วกดอีกครั้ง");
    } finally {
      setWorking(false);
    }
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNote(success);
    } catch {
      setNote("คัดลอกไม่สำเร็จ ลองเลือกข้อความแล้วคัดลอกด้วยตนเอง");
    }
  }

  return (
    <>
      <button type="button" className="secondary-button google-status" data-status={google.status} aria-label="ซิงค์ข้อมูล"
        onClick={() => void start()} title={`ซิงค์ข้อมูล · ${google.label}`}>
        <Icon size={17} /><span>ซิงค์ข้อมูล</span>
      </button>
      {open && (
        <Dialog title={google.connected && !pair ? "ซิงค์ข้อมูล" : "ตั้งค่า Quick Sync"} onClose={() => { setOpen(false); setPair(undefined); }} busy={working}>
          <div className="google-panel">
            {pair ? (
              <form onSubmit={save} className="quick-sync-form">
                <p>เชื่อมต่อเครื่องนี้กับ Drive จากลิงก์จับคู่ แล้วซิงค์โปรเจกต์ของเครื่องนี้</p>
                <p>ยืนยันเฉพาะลิงก์ที่คุณสร้างเอง</p>
                <button className="primary-button" type="submit" disabled={working || !google.online}>เชื่อมต่อด้วยลิงก์นี้</button>
              </form>
            ) : google.connected ? (
              <>
                <p role="status">{google.label}</p>
                {google.message && <p role="status">{google.message}</p>}
                <p>สแกน QR ด้วยกล้องมือถือหรือ iPad แล้วเปิดลิงก์เพื่อเชื่อมต่อกับ Drive เดียวกัน</p>
                <img className="quick-sync-qr" src={qr} width={184} height={184} alt="QR สำหรับจับคู่ Quick Sync" />
                <p>แชร์ QR และลิงก์เฉพาะกับอุปกรณ์ของคุณ</p>
                <details><summary>ดูลิงก์จับคู่</summary>
                  <input className="quick-sync-link" aria-label="URL จับคู่" readOnly value={link}
                    onFocus={(event) => event.currentTarget.select()} />
                </details>
                <div className="dialog-actions">
                  <button className="secondary-button" type="button" onClick={() => void copy(link, "คัดลอกลิงก์จับคู่แล้ว")}><Copy size={16} /> ลิงก์จับคู่</button>
                  <button className="primary-button" type="button" disabled={google.status === "syncing" || !google.online}
                    onClick={() => void start()}><RefreshCw size={16} /> ซิงค์ตอนนี้</button>
                  <button className="secondary-button" type="button" onClick={async () => {
                    setWorking(true);
                    try { await google.disconnect(); setNote(""); initializeSetup(); }
                    catch { setNote("ยกเลิกการเชื่อมต่อไม่สำเร็จ"); }
                    finally { setWorking(false); }
                  }}>ยกเลิกการเชื่อมต่อ</button>
                </div>
              </>
            ) : (
              <form className="quick-sync-form" onSubmit={save}>
                <ol>
                  <li><strong>คัดลอกโค้ดแล้วเปิด Apps Script</strong>
                    <div className="dialog-actions">
                      <button type="button" className="secondary-button" disabled={!key}
                        onClick={() => void copy(appsScriptCode(key), "คัดลอกโค้ดแล้ว")}><Copy size={16} /> คัดลอกโค้ดเชื่อมต่อ</button>
                      <a className="secondary-button" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">เปิด Apps Script</a>
                    </div>
                    <details><summary>ดูโค้ด</summary><textarea readOnly value={key ? appsScriptCode(key) : ""} aria-label="โค้ดเชื่อมต่อ" /></details>
                  </li>
                  <li><strong>วางโค้ดและ Deploy เป็น Web App</strong>
                    <p>แทนที่โค้ดใน Code.gs แล้วเลือก Deploy → New deployment → Web app ตั้ง Execute as เป็น Me และ Who has access เป็น Anyone จากนั้นอนุญาตสิทธิ์ Drive และ Docs</p>
                  </li>
                  <li><strong>วางลิงก์ Web App แล้วกดบันทึก</strong>
                    <label className="name-field">URL ของ Web App<input type="url" value={endpoint} required placeholder="https://script.google.com/…/exec"
                      onChange={(event) => setEndpoint(event.target.value)} /></label>
                    <button className="primary-button" type="submit" disabled={!key || !google.online || working}>{working ? "กำลังตรวจลิงก์…" : "บันทึกและซิงค์"}</button>
                  </li>
                </ol>
              </form>
            )}
            {note && <p role="status">{note}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
