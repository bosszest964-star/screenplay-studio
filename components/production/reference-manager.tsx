"use client";

import { MapPin, PencilLine, Plus, Trash2, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import type { CharacterProfile, LocationProfile } from "@/lib/production";
import { deleteReference, maxReferenceImageBytes, referenceImageTypes, saveReference } from "@/lib/production-data";
import type { Project } from "@/lib/screenplay";
import { ReferenceImage, useBlobUrl } from "./reference-image";

type ReferenceType = "characters" | "locations";
type Profile = CharacterProfile | LocationProfile;

const profileCopy = {
  characters: { title: "Character Sheet", noun: "ตัวละคร", count: "ตัวละคร", icon: UserRound },
  locations: { title: "คลังสถานที่", noun: "สถานที่", count: "สถานที่", icon: MapPin },
} as const;

function ReferenceForm({ type, profile, projectId, onClose }: {
  type: ReferenceType;
  profile: Profile | null;
  projectId: string;
  onClose: () => void;
}) {
  const copy = profileCopy[type];
  const [id] = useState(() => profile?.id ?? crypto.randomUUID());
  const [name, setName] = useState(profile?.name ?? "");
  const [age, setAge] = useState(profile && "personality" in profile ? profile.age?.toString() ?? "" : "");
  const [personality, setPersonality] = useState(profile && "personality" in profile ? profile.personality : "");
  const [backstory, setBackstory] = useState(profile && "backstory" in profile ? profile.backstory : "");
  const [description, setDescription] = useState(profile && "description" in profile ? profile.description : "");
  const [lighting, setLighting] = useState(profile && "lighting" in profile ? profile.lighting : "");
  const [image, setImage] = useState<File | null>();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useBlobUrl(image ?? undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!deleting && !name.trim()) return setError("กรุณาระบุชื่อ");
    const years = age === "" ? undefined : Number(age);
    if (!deleting && type === "characters" && years !== undefined && (!Number.isSafeInteger(years) || years < 0)) {
      return setError("ระบุอายุเป็นจำนวนปีเต็มตั้งแต่ 0 ขึ้นไป");
    }

    setBusy(true);
    setError("");
    try {
      if (deleting) await deleteReference(projectId, type, id);
      else if (type === "characters") {
        await saveReference(projectId, {
          type, isNew: !profile, image,
          profile: { id, name, age: years, personality: personality.trim(), backstory: backstory.trim() },
        });
      } else {
        await saveReference(projectId, {
          type, isNew: !profile, image,
          profile: { id, name, description: description.trim(), lighting: lighting.trim() },
        });
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={deleting ? `ลบ${copy.noun}` : `${profile ? "แก้ไข" : "เพิ่ม"}${copy.noun}`} busy={busy} onClose={onClose}>
      <form className="production-form" onSubmit={submit}>
        {deleting ? <p className="dialog-text">ลบข้อมูลและรูปอ้างอิงของ “{profile?.name}” หรือไม่?</p> : (
          <>
            <label className="name-field">ชื่อ{copy.noun}
              <input data-initial-focus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            {type === "characters" ? (
              <>
                <label className="name-field">อายุ (ปี)
                  <input type="number" inputMode="numeric" min={0} step={1} value={age} onChange={(event) => setAge(event.target.value)} />
                </label>
                <label className="name-field">บุคลิก
                  <textarea rows={2} value={personality} onChange={(event) => setPersonality(event.target.value)} />
                </label>
                <label className="name-field">ปมหลัง
                  <textarea rows={3} value={backstory} onChange={(event) => setBackstory(event.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="name-field">รายละเอียดฉาก
                  <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <label className="name-field">แสง / เวลา
                  <textarea rows={2} value={lighting} onChange={(event) => setLighting(event.target.value)} />
                </label>
              </>
            )}
            <fieldset className="image-input">
              <legend>รูปอ้างอิง</legend>
              {(preview || (image !== null && profile?.imageId)) && (
                <div className="image-preview">
                  <ReferenceImage id={image === undefined ? profile?.imageId : undefined} url={preview} alt={`รูปอ้างอิง ${name}`} />
                  <button type="button" className="secondary-button danger-text" onClick={() => setImage(null)}>นำรูปออก</button>
                </div>
              )}
              <input type="file" aria-label="อัปโหลดรูปอ้างอิง" accept={referenceImageTypes.join(",")}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (!referenceImageTypes.includes(file.type) || file.size > maxReferenceImageBytes || !file.size) {
                    return setError("เลือกรูป JPG, PNG, WebP, GIF หรือ AVIF ขนาดไม่เกิน 10 MB");
                  }
                  setImage(file);
                  setError("");
                }} />
              <small>JPG, PNG, WebP, GIF หรือ AVIF · สูงสุด 10 MB</small>
            </fieldset>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions production-form-actions">
          {profile && !deleting && (
            <button type="button" className="secondary-button danger-text production-delete" disabled={busy}
              onClick={() => { setError(""); setDeleting(true); }}><Trash2 size={15} /> ลบ</button>
          )}
          <button type="button" className="secondary-button" disabled={busy} onClick={deleting ? () => setDeleting(false) : onClose}>ยกเลิก</button>
          <button type="submit" className={deleting ? "danger-button" : "primary-button"} disabled={busy}>
            {deleting ? `ลบ${copy.noun}` : "บันทึกข้อมูล"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReferenceManager({ project, type }: { project: Project; type: ReferenceType }) {
  const copy = profileCopy[type];
  const Icon = copy.icon;
  const records = project[type] ?? [];
  const [profile, setProfile] = useState<Profile | null | undefined>();

  return (
    <>
      <div className="production-heading">
        <div><h1>{copy.title}</h1><p>{records.length} {copy.count}</p></div>
        <button className="primary-button" type="button" onClick={() => setProfile(null)}><Plus size={18} /> เพิ่ม{copy.noun}</button>
      </div>
      {records.length === 0 ? (
        <div className="production-empty">
          <Icon size={29} />
          <h2>ยังไม่มีข้อมูล{copy.noun}</h2>
          <p>ชื่อที่เพิ่มจะพร้อมใช้ในคำแนะนำของหน้าเขียนบท</p>
        </div>
      ) : (
        <div className="reference-grid">
          {records.map((record) => (
            <article key={record.id} className="reference-card">
              <ReferenceImage id={record.imageId} alt={`รูปอ้างอิง ${record.name}`} fallback={<Icon size={22} />} />
              <div className="reference-card-body">
                <div className="reference-card-title">
                  <h2>{record.name}</h2>
                  <button type="button" className="icon-button" aria-label={`แก้ไข${copy.noun} ${record.name}`} onClick={() => setProfile(record)}>
                    <PencilLine size={17} />
                  </button>
                </div>
                {"personality" in record ? (
                  <><p>{record.age !== undefined ? `${record.age} ปี` : ""}</p><p>{record.personality || record.backstory}</p></>
                ) : (
                  <><p>{record.lighting}</p><p>{record.description}</p></>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {profile !== undefined && <ReferenceForm key={profile?.id ?? "new"} type={type} profile={profile} projectId={project.id} onClose={() => setProfile(undefined)} />}
    </>
  );
}
