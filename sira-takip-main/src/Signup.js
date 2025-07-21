// src/components/Signup.js
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { firestoreDB } from "./firebase"; 
import { ref, get, set } from "firebase/database";
import { realtimeDB } from "./firebase"; // doğru dosya yolunu kullan

export default function Signup({ onBack }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
  e.preventDefault();
  try {
    // Kullanıcıyı oluştur
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // Display name ekle
    await updateProfile(auth.currentUser, {
      displayName: name,
    });

    // Firestore'a kullanıcı kaydet (zaten vardı)
    await setDoc(doc(firestoreDB, "users", auth.currentUser.uid), {
      uid: auth.currentUser.uid,
      name,
      email,
      createdAt: new Date(),
      role: "user"
    });

    // ✅ Realtime Database'e activeList'e ekle
    const activeListRef = ref(realtimeDB, "siraTakip/activeList");
    const snapshot = await get(activeListRef);
    const existingList = snapshot.val() || [];

    // Aynı UID varsa tekrar ekleme
    const alreadyExists = existingList.some(emp => emp.uid === auth.currentUser.uid);
    if (!alreadyExists) {
      const newUser = {
        name,
        uid: auth.currentUser.uid,
        status: "Çalışıyor"
      };
      await set(activeListRef, [...existingList, newUser]);
    }

    alert("Kayıt başarılı! Giriş yapabilirsiniz.");
    onBack(); // Giriş ekranına dön
  } catch (err) {
    setError(err.message);
  }
};

  return (
    <form onSubmit={handleSignup} className="space-y-4 max-w-sm mx-auto mt-10 p-4 border rounded shadow">
      <h2 className="text-xl font-semibold text-center">Kayıt Ol</h2>

      <input
        type="text"
        placeholder="Ad Soyad"
        className="w-full p-2 border rounded"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <input
        type="email"
        placeholder="Email"
        className="w-full p-2 border rounded"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        placeholder="Şifre"
        className="w-full p-2 border rounded"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          className="text-blue-500 text-sm underline"
        >
          Girişe dön
        </button>
        <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
          Kayıt Ol
        </button>
      </div>
    </form>
  );
}
