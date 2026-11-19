"use client";

import { ArrowUpRight, MapPin, UserRound } from "lucide-react";
import type { MouseEvent } from "react";
import { ReferenceImage } from "@/components/production/reference-image";
import { nameKey, productionHref, referenceIndex, speakerName, type CharacterProfile, type ScriptScene } from "@/lib/production";
import { sceneFields, sceneText, type Project } from "@/lib/screenplay";

export function SceneReferences({ scene, project, onNavigate }: {
  scene: ScriptScene;
  project: Project;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const fields = sceneFields(scene.heading);
  const location = referenceIndex(project.locations ?? []).get(nameKey(fields.location));
  const characters = referenceIndex(project.characters ?? []);
  const assigned = project.beats?.find((card) => card.sceneId === scene.heading.id)?.castIds ?? [];
  const cast = new Map<string, { name: string; profile?: CharacterProfile }>((project.characters ?? [])
    .filter(({ id }) => assigned.includes(id))
    .map((record) => [nameKey(record.name), { name: record.name, profile: record }]));

  for (const block of scene.blocks) {
    if (block.kind !== "character") continue;
    const name = speakerName(block.text);
    if (!name) continue;
    const profile = characters.get(nameKey(name));
    const label = profile?.name ?? name;
    if (!cast.has(nameKey(label))) {
      cast.set(nameKey(label), { name: label, profile });
    }
  }

  return (
    <div className="scene-reference">
      <p className="scene-reference-slug">{fields.location.trim() ? sceneText(fields, "thai") : "หัวฉากใหม่"}</p>
      <section aria-label="สถานที่ในฉาก">
        <div className="scene-reference-heading">
          <h3><MapPin size={16} /> สถานที่</h3>
          <a href={productionHref(project.id, "locations")} onClick={onNavigate} aria-label="จัดการสถานที่"><ArrowUpRight size={16} /></a>
        </div>
        {location ? (
          <div className="scene-reference-location">
            <h4>{location.name}</h4>
            {location.imageId && <ReferenceImage id={location.imageId} alt={`รูปอ้างอิง ${location.name}`} />}
            {location.description && <p>{location.description}</p>}
            {location.lighting && <p><strong>แสง / เวลา</strong> {location.lighting}</p>}
          </div>
        ) : <p className="scene-reference-empty">{fields.location.trim() || "ยังไม่ระบุสถานที่"}{fields.location.trim() && " · ยังไม่มีข้อมูลอ้างอิง"}</p>}
      </section>
      <section aria-label="ตัวละครในฉาก">
        <div className="scene-reference-heading">
          <h3><UserRound size={16} /> ตัวละคร</h3>
          <a href={productionHref(project.id, "characters")} onClick={onNavigate} aria-label="จัดการตัวละคร"><ArrowUpRight size={16} /></a>
        </div>
        {cast.size ? (
          <ul className="scene-reference-cast">
            {[...cast.values()].map(({ name, profile }) => (
              <li key={name}>
                <div className="scene-person-heading">
                  {profile?.imageId && <ReferenceImage id={profile.imageId} alt={`รูปอ้างอิง ${name}`} />}
                  <div><h4>{name}</h4>{profile?.age !== undefined && <small>{profile.age} ปี</small>}</div>
                </div>
                {profile?.personality && <p><strong>บุคลิก</strong> {profile.personality}</p>}
                {profile?.backstory && <p><strong>ปมหลัง</strong> {profile.backstory}</p>}
                {!profile && <p>ยังไม่มีประวัติตัวละคร</p>}
              </li>
            ))}
          </ul>
        ) : <p className="scene-reference-empty">ยังไม่มีตัวละครในฉากนี้</p>}
      </section>
    </div>
  );
}
