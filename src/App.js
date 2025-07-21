import { useState, useEffect } from "react";
import clsx from "clsx";
import { ref, set, onValue } from "firebase/database";
import { realtimeDB } from "./firebase";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { formatTime, ensure24Hour } from "./timeUtils";
import { update } from "firebase/database";


export default function SiraTakip({ isAdmin }) {
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedNames, setSelectedNames] = useState([]);
  const [activeList, setActiveList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callCount, setCallCount] = useState(0);
  const [blink, setBlink] = useState(false);
  const [newName, setNewName] = useState("");
  const [log, setLog] = useState([]);
  const [time, setTime] = useState(new Date());
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const [benimAdim, setBenimAdim] = useState("");
  const [logByDate, setLogByDate] = useState({});
  const [showLegend, setShowLegend] = useState(true);
  const [workInfoIndex, setWorkInfoIndex] = useState(null);
  const [workInfoText, setWorkInfoText] = useState("");
  const todayKey = new Date().toISOString().split("T")[0];

  const currentUserId = auth.currentUser?.uid;
  const userEntry = activeList.find((emp) => emp.uid === currentUserId);
  const userName = userEntry?.name || auth.currentUser?.displayName || "Kullanıcı";

  // Durum rengi fonksiyonu: durum adları ve renkler güncellendi
  const durumRengi = (status) => {
    switch (status) {
      case "Molada":
        return "bg-yellow-200 border-yellow-400 text-black";
      case "İzinli":
        return "bg-gray-200 border-gray-400 text-gray-600";
      case "Çalışıyor":
        return "bg-orange-300 border-red-400 text-black";
      case "Müsait":
        return "bg-green-200 border-green-500 text-black";
      default:
        return "bg-white border-gray-300 text-black";
    }
  };

  useEffect(() => {
    if (Notification.permission !== "granted") Notification.requestPermission();
  }, []);

  useEffect(() => {
    const index = siradakiIndex();
    const siradaki = activeList[index]?.name;
    if (siradaki && siradaki === benimAdim) bildirimGonder(benimAdim);
  }, [currentIndex, activeList, benimAdim]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ad =
      activeList.find((emp) => emp.uid === auth.currentUser?.uid)?.name ||
      auth.currentUser?.displayName ||
      "";
    setBenimAdim(ad);
  }, [activeList]);

  useEffect(() => {
    const dataRef = ref(realtimeDB, "siraTakip");
    onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setActiveList(data.activeList || []);
        setCurrentIndex(data.currentIndex || 0);
        setCallCount(data.callCount || 0);
        setAllEmployees(data.allEmployees || []);
        setSelectedNames(data.selectedNames || []);
        setLogByDate(data.logByDate || {});

        if (!data.logByDate?.[todayKey]) {
          const updated = { ...data.logByDate, [todayKey]: [] };
          set(ref(realtimeDB, "siraTakip/logByDate"), updated);
          setLogByDate(updated);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (callCount > 0) {
      const interval = setInterval(() => setBlink((prev) => !prev), 500);
      return () => clearInterval(interval);
    } else setBlink(false);
  }, [callCount]);

  const bildirimGonder = async (isim) => {
  if (Notification.permission === "granted") {
    try {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification("Sıra Sende!", {
        body: `${isim}, çağrıyı sen alacaksın.`,
        icon: "/favicon.ico"
      });
    } catch (error) {
      console.error('Bildirim gönderme hatası:', error);
    }
  }
};


  const siradakiIndex = () => {
    if (activeList.length === 0) return -1;
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    for (let i = 0; i < activeList.length; i++) {
      const idx = (startIndex + i) % activeList.length;
      if (activeList[idx]?.status === "Müsait") return idx;
    }
    return -1; // Hiç müsait yoksa -1 döndür
  };

  // Bilgi kısmı için yardımcı fonksiyonlar
  const siradakiMusaitIndex = () => {
    // Önce currentIndex'ten başlayarak ileriye doğru müsait kişi ara
    for (let i = 0; i < activeList.length; i++) {
      const idx = (currentIndex + i) % activeList.length;
      if (activeList[idx]?.status === "Müsait") {
        return idx;
      }
    }
    return -1; // Hiç müsait yoksa -1 döndür
  };

  const siradakiKisi = () => {
    // Önce currentIndex'ten başlayarak ileriye doğru müsait kişi ara
    for (let i = 0; i < activeList.length; i++) {
      const idx = (currentIndex + i) % activeList.length;
      if (activeList[idx]?.status === "Müsait") {
        return activeList[idx].name;
      }
    }
    return "-";
  };

  const kalanKisiSayisi = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return 0;

    // currentIndex'ten başlayarak sıralı şekilde tüm "Müsait"leri gez
    let sayac = 0;
    for (let i = 0; i < activeList.length; i++) {
      const idx = (currentIndex + i) % activeList.length;
      const kisi = activeList[idx];

      if (kisi?.status === "Müsait") {
        if (kisi.uid === uid) {
          return sayac; // Kendi sıranı bulunca dur
        }
        sayac++;
      }
    }

    return 0; // Bulunamazsa
  };


  const ileriAl = () => {
    const musaitler = activeList.filter((emp) => emp.status === "Müsait");
    if (musaitler.length === 0) return;

    const currentUserIndex = activeList.findIndex(
      (emp) => emp.uid === auth.currentUser?.uid
    );

    if (currentUserIndex !== -1) {
      const updated = [...activeList];
      const oldStatus = updated[currentUserIndex].status;
      updated[currentUserIndex].status = "Çalışıyor";

      // Sıradaki müsait kişiye geç
      const nextMusait = activeList.findIndex((emp, idx) => 
        idx > currentUserIndex && emp.status === "Müsait"
      );
      const yeniIndex = nextMusait !== -1 ? nextMusait : 
        activeList.findIndex(emp => emp.status === "Müsait");

      const person = activeList[currentUserIndex].name;
      const timestamp = formatTime();
      const yeniLog = [
        { 
          person, 
          time: timestamp,
          action: "çağrıyı aldı ve durumu değişti: " + oldStatus + " → Çalışıyor"
        },
        ...(logByDate[todayKey] || [])
      ].slice(0, 200);
      const updatedLogByDate = { ...logByDate, [todayKey]: yeniLog };

      setActiveList(updated);
      setCallCount(callCount > 0 ? callCount - 1 : 0);
      setLogByDate(updatedLogByDate);
      setCurrentIndex(yeniIndex);

      guncelleFirebase({ 
        activeList: updated, 
        callCount: callCount > 0 ? callCount - 1 : 0,
        logByDate: updatedLogByDate,
        currentIndex: yeniIndex
      });
      const yeniSiradaki = updated[yeniIndex]?.name || "-";
      set(ref(realtimeDB, "/siradakiKisi"), yeniSiradaki);
    }
  };
  const durumGuncelle = (index, status, info = "") => {
    const updated = [...activeList];
    const eskiStatus = updated[index].status;
    updated[index].status = status;

    // Eğer Müsait durumuna geçiliyorsa ve currentIndex güncellemesi gerekiyorsa
    let yeniIndex = currentIndex; // olduğu gibi kalsın, değiştirme

    const person = updated[index].name;
    const timestamp = formatTime();
    const logEntry = { person, time: timestamp, action: `Durum: ${eskiStatus} → ${status}` };
    if (info) logEntry.info = info;
    const yeniLog = [logEntry, ...(logByDate[todayKey] || [])].slice(0, 200);
    const updatedLogByDate = { ...logByDate, [todayKey]: yeniLog };

    setActiveList(updated);
    setLogByDate(updatedLogByDate);
    setCurrentIndex(yeniIndex);
    
    guncelleFirebase({ 
      activeList: updated, 
      logByDate: updatedLogByDate,
      currentIndex: yeniIndex
    });
  };

  const guncelleFirebase = (yeniVeriler) => {
      update(ref(realtimeDB, "siraTakip"), yeniVeriler);
    };


  const toggleName = (name) => {
    if (selectedNames.includes(name)) {
      const updated = selectedNames.filter((n) => n !== name);
      const updatedList = activeList.filter((emp) => emp.name !== name);
      setSelectedNames(updated);
      setActiveList(updatedList);
      guncelleFirebase({ selectedNames: updated, activeList: updatedList });
    } else {
      const updated = [...selectedNames, name];
      const updatedList = [...activeList, {
       name,
       status: "Müsait",
       uid: auth.currentUser?.uid || null
     }];
      setSelectedNames(updated);
      setActiveList(updatedList);
      guncelleFirebase({ selectedNames: updated, activeList: updatedList });
    }
  };

  // Logged in kullanıcıyı en başta göstermek için liste sıralaması
  const userIndex = activeList.findIndex(emp => emp.uid === auth.currentUser?.uid);
  const indices = activeList.map((_, idx) => idx);
  const displayIndices =
    userIndex === -1
      ? indices
      : [...indices.slice(userIndex), ...indices.slice(0, userIndex)];

  const toplamKullanici = activeList.length;

  return (
    <div className="bg-white text-black min-h-screen w-full max-w-[100vw] overflow-x-hidden flex flex-col box-border px-[0.5vw]" style={{ overflowY: 'hidden' }}>
      {/* Üst Bar */}
      <header className="sticky top-0 z-20 bg-inherit backdrop-blur-md border-b border-gray-300/20 py-[0.75vh] mb-[1vh] w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[0.5vw] w-full">
          {/* Başlık ve Saat */}
          <div className="min-w-0">
            <h1 className="text-[clamp(1.2rem,1.1vw,2.5rem)] font-semibold tracking-tight truncate">Çağrı Takip Sistemi</h1>
            <div className="flex items-center gap-[0.25vw] text-[clamp(0.7rem,0.5vw,1.2rem)] text-gray-600 mt-[0.25vh]">
              <span>🕒</span>
              <span>
                {formatTime(time)} -
                {time.toLocaleDateString("tr-TR")}
              </span>
            </div>
          </div>
          {/* Kullanıcı Bilgisi ve İşlemler */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-[1vw] text-[clamp(1rem,0.8vw,1.8rem)] w-full sm:w-auto">
            <div className="text-right sm:text-left w-full sm:w-auto">
              <p className="text-gray-800 truncate">
                Hoş geldin, <span className="font-semibold text-blue-600">{userName || "Kullanıcı"}</span>
              </p>
              {isAdmin && (
                <a
                  href="/admin"
                  className="inline-block mt-[0.5vh] text-[clamp(0.7rem,0.5vw,1.2rem)] text-blue-500 hover:underline hover:text-blue-600 transition"
                >
                  🔧 Admin Panel
                </a>
              )}
            </div>
            <div className="flex items-center gap-[0.6vw] mt-[1vh] sm:mt-0 w-full sm:w-auto">
              <button
                onClick={() => signOut(auth)}
                aria-label="Çıkış Yap"
                className="p-[0.8vw] rounded hover:bg-red-100 transition text-red-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-[1.6vw] h-[1.6vw] min-w-[24px] min-h-[24px]">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      {/* Çağrı Listesi ve Kayıtlar */}
      <div>
        <div className="relative flex flex-nowrap items-center mt-[1vh] gap-[1vw] w-full overflow-x-auto">
          {/* Sol tarafta çağrı butonları */}
          <div className="flex gap-[0.3vw] items-center">
            <button
              className={`flex items-center gap-[0.4vw] px-[0.8vw] py-[0.4vh] rounded-md font-semibold text-white shadow-md transition text-[clamp(1rem,0.8vw,1.8rem)] w-auto ${
                blink ? "bg-red-600 animate-pulse" : "bg-red-500 hover:bg-red-600"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`w-[1.2vw] h-[1.2vw] min-w-[20px] min-h-[20px] ${
                  callCount > 0 ? "animate-bounce ring" : ""
                }`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.807 4.057 2.118 5.52a.75.75 0 01-.297 1.206 24.564 24.564 0 01-4.831 1.243 3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Çağrı Sayısı: {callCount}</span>
            </button>

            <button
              onClick={() => {
                const yeniSayi = callCount + 1;
                setCallCount(yeniSayi);
                guncelleFirebase({ callCount: yeniSayi });
              }}
              className={`p-[0.3vw] rounded-md font-semibold text-white shadow-md transition text-[clamp(1rem,0.8vw,1.8rem)] w-auto ${
                blink ? "bg-gray-600 animate-pulse" : "bg-gray-600 hover:bg-gray-700"
              }`}
              aria-label="Çağrı Artır"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[1vw] h-[1vw] min-w-[20px] min-h-[20px]"
              >
                <path
                  fillRule="evenodd"
                  d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <button
              onClick={() => {
                setCallCount((prev) => {
                  if (prev <= 0) return prev;
                  const yeniSayi = prev - 1;
                  guncelleFirebase({ callCount: yeniSayi });
                  return yeniSayi;
                });
              }}
              disabled={callCount === 0}
              className={`p-[0.3vw] rounded-md font-semibold text-white shadow-md transition text-[clamp(1rem,0.8vw,1.8rem)] w-auto ${
                callCount === 0
                  ? "bg-gray-400 opacity-50 cursor-not-allowed"
                  : blink
                    ? "bg-gray-600 animate-pulse"
                    : "bg-gray-600 hover:bg-gray-700"
              }`}
              aria-label="Çağrı Azalt"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[1vw] h-[1vw] min-w-[20px] min-h-[20px]"
              >
                <path
                  fillRule="evenodd"
                  d="M3.75 12a.75.75 0 01.75-.75h15a.75.75 0 010 1.5h-15a.75.75 0 01-.75-.75z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Sağ tarafta bilgi kısmı */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center">
            <div className="flex items-center gap-[0.4vw] bg-blue-100 text-blue-900 rounded px-[0.8vw] py-[0.5vh] text-[clamp(0.7rem,0.8vw,1.1rem)] font-medium shadow-sm whitespace-nowrap">
              <span>
                Sıradaki kişi: <span className="font-bold">{siradakiKisi()}</span>. Size sıra gelmesine <span className="font-bold">{kalanKisiSayisi()}</span> kişi var.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col lg:flex-row w-full gap-[0.5vw] mt-[2vh] overflow-hidden">
        <div className="w-full lg:w-[75%] pr-0 lg:pr-[0.5vw] space-y-[0.5vh] overflow-visible">
          <h2 className="text-[clamp(1rem,1vw,1.3rem)] font-semibold mb-[0.8vh]">Aktif Kullanıcılar</h2>
          <div className="space-y-[0.6vh]">
            {displayIndices.map((i) => {
              const emp = activeList[i];
              const isCurrentUser = emp.uid === auth.currentUser?.uid;
              return (
              <div
                key={emp.uid}
                className={clsx(
                  "flex flex-col gap-[0.4vh] rounded-[0.4vw] shadow-sm p-[0.6vw] duration-200",
                  "bg-white",
                  i === siradakiMusaitIndex() && "bg-blue-50 border-2 border-green-500",
                )}
              >
                {/* Üst Satır: Durum rengi ve isim */}
                <div className="flex items-center justify-between flex-wrap gap-[0.5vw] min-h-[3vh]">
                  <div className="flex items-center gap-[0.6vw]">
                    {/* Durum Dairesi */}
                    <div
                      className={clsx(
                        "w-[1vw] h-[1vw] min-w-[0.8vw] min-h-[0.8vw] rounded-full",
                        emp.status === "Müsait" && "bg-green-500",
                        emp.status === "Molada" && "bg-yellow-400",
                        emp.status === "İzinli" && "bg-gray-400",
                        emp.status === "Çalışıyor" && "bg-orange-500"
                      )}
                    ></div>
                    <p className="text-[clamp(0.9rem,0.7vw,1.1rem)] font-semibold truncate max-w-[50vw]">{emp.name}</p>
                    {isCurrentUser && (
                      <span className="flex items-center gap-[0.3vw] ml-[0.4vw] bg-blue-200 text-blue-800 px-[0.4vw] py-[0.1vh] rounded text-[clamp(0.6rem,0.6vw,0.8rem)]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-[0.8vw] h-[0.8vw] min-w-[12px] min-h-[12px]">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6c0 2.071-1.679 3.75-3.75 3.75s-3.75-1.679-3.75-3.75S9.929 2.25 12 2.25s3.75 1.679 3.75 3.75z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.501 20.118C4.571 16.037 7.902 12.75 12 12.75s7.428 3.287 7.499 7.369C17.216 21.166 14.676 21.75 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        Siz
                      </span>
                    )}
                  </div>

                  {/* Durum veya butonlar */}
                  {emp.uid === auth.currentUser?.uid ? (
                    <div className="flex flex-wrap gap-[0.3vw]">
                      <button
                        onClick={() => durumGuncelle(i, "Molada")}
                        className="px-[0.7vw] py-[0.3vh] bg-yellow-200 text-black rounded text-[clamp(0.6rem,0.6vw,0.8rem)]"
                      >
                        Moladayım
                      </button>
                      <button
                        onClick={() => durumGuncelle(i, "İzinli")}
                        className="px-[0.7vw] py-[0.3vh] bg-gray-300 text-black rounded text-[clamp(0.6rem,0.6vw,0.8rem)]"
                      >
                        İzinliyim
                      </button>
                      <button
                        onClick={() => {
                          setWorkInfoIndex(i);
                          setWorkInfoText("");
                        }}
                        className="px-[0.7vw] py-[0.3vh] bg-orange-400 text-black rounded text-[clamp(0.6rem,0.6vw,0.8rem)]"
                      >
                        Çalışıyorum
                      </button>
                      <button
                        onClick={() => durumGuncelle(i, "Müsait")}
                        className="px-[0.7vw] py-[0.3vh] bg-green-400 text-black rounded text-[clamp(0.6rem,0.6vw,0.8rem)]"
                      >
                        Müsaitim
                      </button>
                    </div>
                  ) : (
                    <p className="italic text-[clamp(0.6rem,0.6vw,0.8rem)] w-[10ch] whitespace-nowrap mr-[0.4vw]">Durum: {emp.status}</p>
                  )}
                </div>

                {/* "Çağrı Aldım" butonu */}
                {emp.uid === auth.currentUser?.uid && emp.status === "Müsait" && i === siradakiMusaitIndex() && (
                  <div className="flex justify-start mt-[0.4vh]">
                    <button
                      onClick={ileriAl}
                      className="bg-green-500 text-white px-[0.7vw] py-[0.3vh] rounded hover:bg-green-600 transition text-[clamp(0.7rem,0.7vw,0.9rem)] min-w-[7vw] min-h-[2.5vh]"
                    >
                      ✅ Çağrı Aldım
                    </button>
                  </div>
                )}
              </div>
            );
            })}
            <div className="flex justify-between items-center mt-[0.6vh] text-[clamp(0.8rem,0.7vw,1rem)] text-gray-600 font-medium p-[0.6vw]">
              <span>Toplam kullanıcı sayısı: {toplamKullanici}</span>
            </div>
          </div>
        </div>
        <div className="w-full lg:w-1/4 flex flex-col">
          <div className="border-l-0 lg:pl-[1.5vw] pr-0" style={{height: 'calc(104vh - 20vw)'}}>
            <div className="bg-white border border-gray-300 rounded-[0.7vw] shadow-sm px-[1vw] pt-[1vh] pb-[1vh] mr-0 lg:mr-[1vw] h-full flex flex-col">
              <h2 className="text-[clamp(1rem,1vw,1.5rem)] font-semibold mb-[0.8vh]">📋 Bugünkü Çağrı Kayıtları</h2>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ul className="list-disc pl-[1vw] sm:pl-[1.5vw] text-[clamp(0.65rem,0.7vw,1rem)] space-y-[0.4vh]">
                  {(logByDate[todayKey] || []).map((entry, index) => (
                    <li key={index}>
                      {ensure24Hour(entry.time)} - {entry.person}{" "}
                      {entry.action ? entry.action : "çağrıyı aldı"}
                      {entry.info ? ` - ${entry.info}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
        <div className="w-full text-left py-2 mt-auto text-[10px] sm:text-xs text-gray-400 mb-1 bg-inherit">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="mr-[0.5vw] p-[0.4vw] rounded bg-gray-400 hover:bg-gray-500 text-white transition"
            aria-label={showLegend ? "Gizle" : "Göster"}
          >
            {showLegend ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[0.8vw] h-[0.8vw] min-w-[12px] min-h-[12px]"
              >
                <path
                  fillRule="evenodd"
                  d="M7.72 12.53a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 1 1 1.06 1.06L9.31 12l6.97 6.97a.75.75 0 1 1-1.06 1.06l-7.5-7.5Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[0.8vw] h-[0.8vw] min-w-[10px] min-h-[10px]"
              >
                <path
                  fillRule="evenodd"
                  d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
          {showLegend && (
            <>
              <span className="inline-flex items-center mr-[0.5vw]">
                <span className="w-[1vw] h-[1vw] min-w-[0.8vw] min-h-[0.8vw] rounded-full bg-green-500 inline-block mr-[0.3vw]"></span>
                Müsait
              </span>
              <span className="inline-flex items-center mr-[0.5vw]">
                <span className="w-[1vw] h-[1vw] min-w-[0.8vw] min-h-[0.8vw] rounded-full bg-orange-500 inline-block mr-[0.3vw]"></span>
                Çalışıyor
              </span>
              <span className="inline-flex items-center mr-[0.5vw]">
                <span className="w-[1vw] h-[1vw] min-w-[0.8vw] min-h-[0.8vw] rounded-full bg-yellow-400 inline-block mr-[0.3vw]"></span>
                Molada
              </span>
              <span className="inline-flex items-center">
                <span className="w-[1vw] h-[1vw] min-w-[0.8vw] min-h-[0.8vw] rounded-full bg-gray-400 inline-block mr-[0.3vw]"></span>
                İzinli
              </span>
            </>
          )}
        </div>
          <footer className="w-full text-center py-2 mt-auto text-[10px] sm:text-xs text-gray-400 border-t border-gray-200 bg-inherit">
        <span>Created by Ali Bekir Özer</span>
      </footer>
      {workInfoIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow flex flex-col gap-2 w-80 max-w-[90vw]">
            <textarea
              className="border p-2 rounded w-full"
              rows="3"
              placeholder="Ne üzerinde çalışıyorsunuz?"
              value={workInfoText}
              onChange={(e) => setWorkInfoText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setWorkInfoIndex(null);
                  setWorkInfoText("");
                }}
                className="px-3 py-1 rounded bg-gray-200 text-gray-700"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  if (workInfoText.trim().length >= 6) {
                    durumGuncelle(workInfoIndex, "Çalışıyor", workInfoText.trim());
                    setWorkInfoIndex(null);
                    setWorkInfoText("");
                  }
                }}
                disabled={workInfoText.trim().length < 6}
                className={`px-3 py-1 rounded text-white ${
                  workInfoText.trim().length < 6
                    ? "bg-blue-300 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
