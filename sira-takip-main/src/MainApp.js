// src/MainApp.js
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestoreDB } from "./firebase";
import App from "./App";
import Login from "./Login";
import AdminPanel from "./AdminPanel";
import Stats from "./Stats";

export default function MainApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(firestoreDB, "users", firebaseUser.uid));
          setIsAdmin(snap.exists() && snap.data().role === "admin");
        } catch (err) {
          console.error("Failed to fetch user role", err);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="text-center mt-10">Yükleniyor...</div>;

  return (
    <Router>
      <Routes>
        {!user ? (
          <>
            <Route path="*" element={<Login />} />
          </>
        ) : (
          <>
            <Route path="/" element={<App isAdmin={isAdmin} />} />
            <Route
              path="/admin"
              element={
                isAdmin ? (
                  <AdminPanel />
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route
              path="/admin/stats"
              element={
                isAdmin ? (
                  <Stats />
                ) : (
                  <Navigate to="/" />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </Router>
  );
}
