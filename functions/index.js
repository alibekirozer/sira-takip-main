const { onValueWritten } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

const { onValueUpdated } = require("firebase-functions/v2/database"); 
const DEFAULT_TEAMS_WEBHOOK_URL =
  "https://kocsistem.webhook.office.com/webhookb2/abeee0d5-b203-43f5-929d-391659e259b8@1e1aa76b-4b02-45f4-9417-2e13eb0da973/IncomingWebhook/5f03de4551964d6ba81df8bf80da3033/cf410a20-3801-452e-8fea-eb078c94b436/V2RZ3eafed3jWqluMpw99nOfO1_WWRaaMhKQf6sUTBbkI1";

const TEAMS_WEBHOOK_URL =
  process.env.TEAMS_WEBHOOK_URL || DEFAULT_TEAMS_WEBHOOK_URL;

const DEFAULT_PENDING_WEBHOOK_URL =
  "https://kocsistem.webhook.office.com/webhookb2/a2b9f712-5224-4cbe-86fc-9b9568069844@1e1aa76b-4b02-45f4-9417-2e13eb0da973/IncomingWebhook/ac8849d47cf348f99f87e0ab4685c311/cf410a20-3801-452e-8fea-eb078c94b436/V2O5uK3Sjtply8LJrC24w6TcvTu-2WXBGsv0qXE0BDkRU1";
const PENDING_WEBHOOK_URL =
  process.env.PENDING_WEBHOOK_URL || DEFAULT_PENDING_WEBHOOK_URL;
exports.bildirimGonder = onValueWritten(
  {
    region: "europe-west1",
    ref: "/siradakiKisi",
  },
  async (event) => {
    const before = event.data.before;
    const after = event.data.after;

    if (!after.exists()) return;

    const payload = {
      "@type": "MessageCard",
      //"@context": "http://schema.org/extensions",
      "summary": "Çağrı Takip Bildirimi",
      "themeColor": "0076D7",
      "title": "📢 Yeni Çağrı",
      "username": "Çağrı Takip Bildirimi",
      "text": `Şu an çağrı sırası **${after.val()}** kişisine geçti.`,
    };

    try {
      const response = await fetch(TEAMS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("Teams webhook başarısız:", await response.text());
      } else {
        console.log("Teams bildirimi gönderildi.");
      }
    } catch (err) {
      console.error("Webhook gönderim hatası:", err);
    }
  }
);

exports.currentIndexTakip = onValueUpdated(
  {
    region: "europe-west1",
    ref: "siraTakip/currentIndex"
  },
  async (event) => {
    const afterIndex = event.data.after.val();
    if (afterIndex === undefined || afterIndex === null) return;

    const snapshot = await admin.database().ref(`siraTakip/activeList/${afterIndex}`).once("value");
    const kisi = snapshot.val();

    if (!kisi || !kisi.name) return;

    await admin.database().ref("siradakiKisi").set(kisi.name);
    console.log(`siradakiKisi güncellendi: ${kisi.name}`);
  }
);

exports.callCountNotify = onValueUpdated(
  {
    region: "europe-west1",
    ref: "siraTakip/callCount",
  },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();

    if (typeof before === "number" && typeof after === "number" && after > before) {
      const payload = {
        "@type": "MessageCard",
        "summary": "Çağrı Takip Bildirimi",
        "themeColor": "D00000",
        "title": "\uD83D\uDD51 Bekleyen Çağrı",
        "text": `Sistemde bekleyen çağrı sayısı **${after}**.`,
      };

      try {
        const response = await fetch(PENDING_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.error("Pending call webhook başarısız:", await response.text());
        } else {
          console.log("Pending call Teams bildirimi gönderildi.");
        }
      } catch (err) {
        console.error("Pending call webhook gönderim hatası:", err);
      }
    }
  }
);

exports.updateUserCredentials = onCall({ region: "europe-west1" }, async (request) => {
  const { uid, email, password, passwordLength } = request.data || {};
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid");
  }
  const updateData = {};
  if (email) updateData.email = email;
  if (password) updateData.password = password;
  try {
    if (Object.keys(updateData).length) {
      await admin.auth().updateUser(uid, updateData);
    }
    if (email || passwordLength !== undefined) {
      const updateFirestore = {};
      if (email) updateFirestore.email = email;
      if (passwordLength !== undefined) updateFirestore.passwordLength = passwordLength;
      await admin.firestore().collection("users").doc(uid).update(updateFirestore);
    }
    return { success: true };
  } catch (err) {
    console.error("updateUserCredentials error:", err);
    throw new HttpsError("internal", err.message);
  }
});

exports.rotateDailyToOguz = onSchedule(
  {
    region: "europe-west1",
    schedule: "0 18 * * *",
    timeZone: "Europe/Istanbul",
  },
  async () => {
    const db = admin.database();
    const activeSnap = await db.ref("siraTakip/activeList").once("value");
    const list = activeSnap.val() || [];

    const oguzIndex = list.findIndex((emp) => emp.name === "Oğuz");
    if (oguzIndex === -1) {
      console.log("Oğuz bulunamadı");
      return;
    }

    let newIndex = oguzIndex;
    for (let i = 0; i < list.length; i++) {
      const idx = (oguzIndex + i) % list.length;
      if (list[idx] && list[idx].status !== "İzinli") {
        newIndex = idx;
        break;
      }
    }

    await db.ref("siraTakip/currentIndex").set(newIndex);
    const nextName = list[newIndex]?.name || "-";
    await db.ref("siradakiKisi").set(nextName);
    console.log(`Günlük devir yapıldı, yeni sıra: ${nextName}`);
  }
);
