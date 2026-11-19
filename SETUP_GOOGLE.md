# ตั้งค่า Google Drive และ Google Docs บน Vercel

Sceneform ใช้ IndexedDB สำหรับทำงานในเครื่อง การสร้างและแก้ไขบท การวางแผน และการส่งออก PDF พร้อมใช้ก่อนตั้งค่าบัญชี Google การตั้งค่าต่อไปนี้เปิดใช้การซิงค์ข้ามอุปกรณ์และส่งออกเป็น Google Docs

## 1. เตรียมโดเมนและ Google Cloud Project

1. เปิดโปรเจกต์ Sceneform ใน Vercel แล้วจดโดเมน Production ที่จะใช้งานจริง เช่น `https://sceneform.vercel.app` หรือโดเมนที่เชื่อมไว้
2. เข้า Google Cloud Console แล้วสร้าง Project ใหม่หรือเลือก Project ที่ต้องการใช้กับ Sceneform [Google Cloud Console](https://console.cloud.google.com/)
3. ไปที่ **APIs & Services → Library** แล้วกด **Enable** ให้ทั้ง Google Drive API และ Google Docs API [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) · [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)

## 2. ตั้งค่าหน้าขออนุญาต Google

1. เปิด **Google Auth Platform** แล้วกรอกชื่อแอป อีเมลติดต่อ และข้อมูลที่ Google ขอใน **Branding** [Google Auth Platform](https://console.cloud.google.com/auth/overview)
2. เปิด **Audience** เลือก **External** สำหรับบัญชีทั่วไป หรือ **Internal** สำหรับผู้ใช้ภายใน Google Workspace ขององค์กร หากเลือก External และยังอยู่ในสถานะ **Testing** ให้เพิ่มบัญชีที่จะใช้ใน **Test users**
3. เปิด **Data Access → Add or remove scopes** แล้วเพิ่มสองรายการนี้

   ```text
   https://www.googleapis.com/auth/drive.file
   https://www.googleapis.com/auth/documents
   ```

บัญชีที่ใช้ทดสอบกับแอป External ในสถานะ Testing อาจต้องเชื่อมใหม่หลังเจ็ดวัน หากจะเปิดใช้กับผู้ใช้ทั่วไป ให้ทำตามขั้นตอน Publish และการยืนยันที่ Google Cloud Console แสดง

## 3. สร้าง OAuth Client ID

1. เปิด **Google Auth Platform → Clients → Create client** แล้วเลือก **Web application** [หน้าจัดการ Client](https://console.cloud.google.com/auth/clients)
2. ตั้งชื่อ Client เช่น `Sceneform Production`
3. เพิ่ม **Authorized redirect URI** โดยต่อ `/api/google` หลังโดเมน Production เช่น `https://sceneform.vercel.app/api/google` สะกดให้ตรงทั้งโดเมนและ path และเว้นเครื่องหมายทับท้ายออก
4. กด **Create** แล้วเก็บ **Client ID** และ **Client secret** ที่ได้ไว้สำหรับกรอกใน Vercel

แอปใช้ Authorization Code Flow ที่ฝั่งเซิร์ฟเวอร์ ค่า **Authorized redirect URI** ใช้รับผลจาก Google โดยตรง ใช้โดเมนเดียวกันตอนเชื่อมบัญชีและตอนกลับเข้าแอป

## 4. ใส่ Environment Variables ใน Vercel

1. เปิดโปรเจกต์ใน Vercel แล้วไปที่ **Settings → Environment Variables → Add New**
2. เพิ่มตัวแปรสี่รายการนี้ในสภาพแวดล้อม **Production**

   | ชื่อตัวแปร | ค่าที่ต้องใส่ |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Client ID จาก Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | Client secret จาก Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | URI เดียวกับ Authorized redirect URI เช่น `https://sceneform.vercel.app/api/google` |
   | `GOOGLE_SESSION_SECRET` | คีย์สุ่ม 32 ไบต์ในรูป Base64 สำหรับเข้ารหัสเซสชัน |

3. สร้างค่า `GOOGLE_SESSION_SECRET` บนเครื่องด้วยคำสั่งนี้ แล้วนำผลลัพธ์ไปกรอกเป็นค่าตัวแปร

   ```sh
   openssl rand -base64 32
   ```

4. ที่ **Deployments** ให้ **Redeploy** เวอร์ชันล่าสุด โครงการใช้ preset **Other** ตาม `vercel.json` เพื่อให้ Vercel เสิร์ฟ Static Export จาก `out/` พร้อมฟังก์ชัน OAuth ที่ `/api/google`

เก็บ Client secret และ Session secret ใน Vercel Environment Variables เท่านั้น ตัวแปรชุดนี้ใช้ฝั่งเซิร์ฟเวอร์และใช้ชื่อโดยไม่มี `NEXT_PUBLIC_` หากจะใช้ Preview ด้วย ให้มีโดเมน Preview ที่คงที่และลงทะเบียน redirect URI ของโดเมนนั้นแยกใน Google และ Vercel

## 5. เชื่อมบัญชีและทดลองซิงค์

1. เปิดแอปผ่านโดเมน Production เลือก **Google Drive → เชื่อมต่อบัญชี Google** แล้วอนุญาตสิทธิ์ที่แสดง
2. เมื่อขึ้น **Synced** ให้เปิด Google Drive หาโฟลเดอร์ **ScreenplayStudio** ภายในมีโฟลเดอร์ของแต่ละโปรเจกต์ พร้อมไฟล์ข้อมูลเวอร์ชันต่าง ๆ และไฟล์รูปอ้างอิง โปรเจกต์ตัวอย่างจะเริ่มซิงค์เมื่อมีการแก้ไข
3. บนอุปกรณ์อีกเครื่องให้เปิดแอปและเชื่อมบัญชี Google เดิม เลือก **ดึงโปรเจกต์จาก Drive** หากต้องการดึงข้อมูลทันที
4. ทดลองแก้บทขณะออฟไลน์แล้วกลับมาออนไลน์ แอปซิงค์อัตโนมัติเมื่อเปิดหรือกลับเข้าแอป เบราว์เซอร์ที่รองรับ Background Sync สามารถประมวลผลคิวระหว่างที่ปิดแอปได้ด้วย
5. หากแก้โปรเจกต์เดียวกันคนละเครื่องพร้อมกัน ระบบเก็บฉบับที่ต่างกันเป็นโปรเจกต์แยกเพื่อรักษาการแก้ไข เอกสาร Google Docs ที่ส่งออกแต่ละครั้งเป็นไฟล์ใหม่ และการแก้ใน Docs แยกจากต้นฉบับ

ใน Editor เลือก **ส่งออกบท → ส่งออกเป็น Google Docs** แล้วกด **เปิดใน Google Docs** เมื่อสร้างเสร็จ ส่วน **ดาวน์โหลด PDF** และ **ตัวอย่างก่อนพิมพ์** ใช้ได้โดยไม่ต้องเชื่อมบัญชี

## ตรวจเมื่อเชื่อมต่อไม่ได้

- หากขึ้น **ยังไม่ได้ตั้งค่า Google OAuth** ให้ตรวจว่าตัวแปรทั้งสี่อยู่ในสภาพแวดล้อมของ Deployment และโดเมนที่เปิดตรงกับ `GOOGLE_REDIRECT_URI`
- หาก Google แจ้ง `redirect_uri_mismatch` ให้ตรวจว่าค่าใน OAuth Client และ Vercel ตรงกันทุกตัวอักษร
- หากบัญชีเปิดหน้าอนุญาตไม่ได้ตอน **Testing** ให้ตรวจว่าเพิ่มอีเมลใน **Test users** แล้ว หากเชื่อมต่อได้แต่ซิงค์หรือส่งออกไม่ได้ ให้ตรวจว่าเปิด Drive API และ Docs API ใน Project เดียวกับ Client ID
