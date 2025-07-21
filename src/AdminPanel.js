import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { firestoreDB, auth, realtimeDB, functions } from "./firebase";
import { formatTime } from "./timeUtils";
import { ref, get, set } from "firebase/database";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { httpsCallable } from "firebase/functions";

const MASK_LENGTH = 5;
const maskPassword = () => "*".repeat(MASK_LENGTH);

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editedName, setEditedName] = useState("");
  const [editedEmail, setEditedEmail] = useState("");
  const [editedPassword, setEditedPassword] = useState("");
  const [editedStatus, setEditedStatus] = useState("");
  const [editedIncluded, setEditedIncluded] = useState(false);
  const [activeList, setActiveList] = useState([]);
  const [logByDate, setLogByDate] = useState({});
  const todayKey = new Date().toISOString().split("T")[0];

  const fetchUsers = async () => {
    const querySnapshot = await getDocs(collection(firestoreDB, "users"));
    const userList = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setUsers(userList);
    setLoading(false);
  };

  const fetchActiveList = async () => {
    const snap = await get(ref(realtimeDB, "siraTakip"));
    const data = snap.val() || {};
    setActiveList(data.activeList || []);
    setLogByDate(data.logByDate || {});
  };

  useEffect(() => {
    fetchUsers();
    fetchActiveList();
  }, []);

  const toggleRole = async (user) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    await updateDoc(doc(firestoreDB, "users", user.uid), { role: newRole });
    setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, role: newRole } : u)));
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`${user.name} adlı kullanıcı silinsin mi?`)) return;

    await deleteDoc(doc(firestoreDB, "users", user.uid));

    // Realtime DB'den de kaldır
    const snapshot = await get(ref(realtimeDB, "siraTakip/activeList"));
    const list = snapshot.val() || [];
    const updatedList = list.filter((emp) => emp.uid !== user.uid);
    await set(ref(realtimeDB, "siraTakip/activeList"), updatedList);

    setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
  };

  const updateStatus = async (user, status) => {
    const activeRef = ref(realtimeDB, "siraTakip/activeList");
    const snap = await get(activeRef);
    const list = snap.val() || [];
    const idx = list.findIndex((emp) => emp.uid === user.uid);
    const oldStatus = idx !== -1 ? list[idx].status : "";
    const updatedList = idx !== -1
      ? list.map((emp) =>
          emp.uid === user.uid ? { ...emp, status } : emp
        )
      : [...list, { uid: user.uid, name: user.name, status }];
    await set(activeRef, updatedList);
    setActiveList(updatedList);

    const logRef = ref(realtimeDB, "siraTakip/logByDate");
    const logSnap = await get(logRef);
    const logData = logSnap.val() || {};
    const entry = {
      person: user.name,
      time: formatTime(),
      action: `Durum: ${oldStatus || "-"} → ${status}`,
    };
    const updatedForToday = [
      entry,
      ...(logData[todayKey] || []),
    ].slice(0, 200);
    const updatedLogs = { ...logData, [todayKey]: updatedForToday };
    await set(logRef, updatedLogs);
    setLogByDate(updatedLogs);
  };

  const startEdit = (user) => {
    setEditingId(user.uid);
    setEditedName(user.name);
    setEditedEmail(user.email);
    setEditedPassword("");
    setEditedStatus(activeList.find((emp) => emp.uid === user.uid)?.status || "");
    setEditedIncluded(activeList.some((emp) => emp.uid === user.uid));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditedName("");
    setEditedEmail("");
    setEditedPassword("");
    setEditedStatus("");
    setEditedIncluded(false);
  };

  const saveChanges = async (user) => {
    try {
      await updateDoc(doc(firestoreDB, "users", user.uid), {
        name: editedName,
        email: editedEmail,
        ...(editedPassword && { passwordLength: editedPassword.length }),
      });

      const activeRef = ref(realtimeDB, "siraTakip/activeList");
      const snap = await get(activeRef);
      let list = snap.val() || [];
      const idx = list.findIndex((emp) => emp.uid === user.uid);
      const wasIncluded = idx !== -1;
      const currentStatus = wasIncluded ? list[idx].status : "";

      if (editedIncluded) {
        if (wasIncluded) {
          list = list.map((emp) =>
            emp.uid === user.uid
              ? { ...emp, name: editedName, status: editedStatus || emp.status }
              : emp
          );
        } else {
          list = [
            ...list,
            { uid: user.uid, name: editedName, status: editedStatus || "Müsait" },
          ];
        }
        await set(activeRef, list);
        setActiveList(list);
        if (editedStatus !== "" && editedStatus !== currentStatus) {
          await updateStatus({ ...user, name: editedName }, editedStatus || "Müsait");
        }
      } else if (wasIncluded) {
        const removedStatus = list[idx].status;
        list = list.filter((emp) => emp.uid !== user.uid);
        await set(activeRef, list);
        setActiveList(list);
        const logRef = ref(realtimeDB, "siraTakip/logByDate");
        const logSnap = await get(logRef);
        const logData = logSnap.val() || {};
        const entry = {
          person: editedName,
          time: formatTime(),
          action: `Durum: ${removedStatus} → -`,
        };
        const updatedForToday = [entry, ...(logData[todayKey] || [])].slice(0, 200);
        const updatedLogs = { ...logData, [todayKey]: updatedForToday };
        await set(logRef, updatedLogs);
        setLogByDate(updatedLogs);
      }

      if (editedEmail !== user.email || editedPassword) {
        const updateCred = httpsCallable(functions, "updateUserCredentials");
        await updateCred({
          uid: user.uid,
          email: editedEmail !== user.email ? editedEmail : undefined,
          password: editedPassword || undefined,
          passwordLength: editedPassword ? editedPassword.length : undefined,
        });
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.uid === user.uid
            ? {
                ...u,
                name: editedName,
                email: editedEmail,
                ...(editedPassword && { passwordLength: editedPassword.length }),
              }
            : u
        )
      );
      cancelEdit();
    } catch (err) {
      console.error("User update error", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const secondaryApp = initializeApp(auth.app.options, "Secondary");
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      await updateProfile(cred.user, { displayName: name });

      await setDoc(doc(firestoreDB, "users", cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        createdAt: new Date(),
        role: "user",
        passwordLength: password.length,
      });

      const activeRef = ref(realtimeDB, "siraTakip/activeList");
      const snap = await get(activeRef);
      const list = snap.val() || [];
      await set(activeRef, [...list, { name, uid: cred.user.uid, status: "Çalışıyor" }]);

      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      setName("");
      setEmail("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const moveUp = async (index) => {
    if (index <= 0) return;
    const newList = [...activeList];
    [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    await set(ref(realtimeDB, "siraTakip/activeList"), newList);
    setActiveList(newList);
  };

  const moveDown = async (index) => {
    if (index >= activeList.length - 1) return;
    const newList = [...activeList];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    await set(ref(realtimeDB, "siraTakip/activeList"), newList);
    setActiveList(newList);
  };

  if (loading) return <div className="p-4 text-center">Yükleniyor...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-md rounded-lg p-6">
        <div className="flex items-center mb-6 justify-between">
          <h2 className="text-2xl font-semibold text-gray-700">Kullanıcı Yönetimi</h2>
          <a
            href="/admin/stats"
            className="text-blue-600 hover:underline text-sm"
          >
            📊 İstatistikler
          </a>
        </div>
        <form
          onSubmit={handleCreateUser}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 items-end"
        >
          <input
            type="text"
            placeholder="Ad Soyad"
            className="border rounded p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            className="border rounded p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Şifre"
            className="border rounded p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Ekle
          </button>
        </form>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b">Ad Soyad</th>
                <th className="px-3 py-2 text-left border-b">Email</th>
                <th className="px-3 py-2 text-left border-b">Şifre</th>
                <th className="px-3 py-2 text-left border-b">Rol</th>
                <th className="px-3 py-2 text-left border-b">Takipte</th>
                <th className="px-3 py-2 text-left border-b">Durum</th>
                <th className="px-3 py-2 text-left border-b">Düzenle</th>
                <th className="px-3 py-2 text-left border-b">Admin/User</th>
                <th className="px-3 py-2 text-left border-b">Sil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.uid} className="hover:bg-gray-50">
              <td className="p-2 border">
                {editingId === user.uid ? (
                  <input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="border p-1"
                  />
                ) : (
                  user.name
                )}
              </td>
              <td className="p-2 border">
                {editingId === user.uid ? (
                  <input
                    type="email"
                    value={editedEmail}
                    onChange={(e) => setEditedEmail(e.target.value)}
                    className="border p-1"
                  />
                ) : (
                  user.email
                )}
              </td>
              <td className="p-2 border">
                {editingId === user.uid ? (
                  <input
                    type="password"
                    value={editedPassword}
                    placeholder={maskPassword()}
                    onChange={(e) => setEditedPassword(e.target.value)}
                    onFocus={(e) => (e.target.placeholder = "")}
                    className="border p-1"
                  />
                ) : (
                  maskPassword()
                )}
              </td>
              <td className="p-2 border capitalize">{user.role}</td>
              <td className="p-2 border text-center">
                {editingId === user.uid ? (
                  <input
                    type="checkbox"
                    checked={editedIncluded}
                    onChange={(e) => setEditedIncluded(e.target.checked)}
                  />
                ) : (
                  activeList.some((emp) => emp.uid === user.uid) ? "✅" : "❌"
                )}
              </td>
              <td className="p-2 border">
                {editingId === user.uid ? (
                  <select
                    value={editedStatus}
                    onChange={(e) => setEditedStatus(e.target.value)}
                    className="border p-1"
                  >
                    <option value="">Seç...</option>
                    <option value="Molada">Molada</option>
                    <option value="İzinli">İzinli</option>
                    <option value="Çalışıyor">Çalışıyor</option>
                    <option value="Müsait">Müsait</option>
                  </select>
                ) : (
                  activeList.find((emp) => emp.uid === user.uid)?.status || ""
                )}
              </td>
              <td className="p-2 border text-left">
                {editingId === user.uid ? (
                  <>
                    <button
                      onClick={() => saveChanges(user)}
                      className="text-green-600 hover:underline"
                    >
                      💾 Kaydet
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-gray-600 hover:underline ml-2"
                    >
                      Vazgeç
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEdit(user)}
                    className="text-blue-600 hover:underline"
                  >
                    ✏️ Düzenle
                  </button>
                )}
              </td>
              <td className="p-2 border text-left">
                <button
                  onClick={() => toggleRole(user)}
                  className="text-blue-600 hover:underline"
                >
                  🔁 {user.role === "admin" ? "User" : "Admin"} yap
                </button>
              </td>
              <td className="p-2 border text-left">
                <button
                  onClick={() => deleteUser(user)}
                  className="text-red-600 hover:underline"
                >
                  🗑 Sil
                </button>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-semibold mt-8 mb-2">Çağrı Takip Sırası</h3>
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left border-b">Sıra</th>
                <th className="px-3 py-2 text-left border-b">Ad Soyad</th>
                <th className="px-3 py-2 text-left border-b">Durum</th>
                <th className="px-3 py-2 text-left border-b">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeList.map((emp, idx) => (
                <tr key={emp.uid} className="hover:bg-gray-50">
                  <td className="p-2 border text-center">{idx + 1}</td>
                  <td className="p-2 border">{emp.name}</td>
                  <td className="p-2 border">{emp.status}</td>
                  <td className="p-2 border text-left">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="text-blue-600 hover:underline disabled:text-gray-400 mr-2"
                    >
                      ⬆️ Yukarı
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === activeList.length - 1}
                      className="text-blue-600 hover:underline disabled:text-gray-400"
                    >
                      ⬇️ Aşağı
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
