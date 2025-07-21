import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setError("");
      alert("Giriş başarılı!");
    } catch (err) {
      setError("Giriş başarısız: " + err.message);
    }
  };



  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
  <form onSubmit={handleLogin} className="space-y-4 max-w-sm mx-auto mt-10 p-4 border rounded shadow">
    <h2 className="text-xl font-semibold text-center">Giriş Yap</h2>
    
    <input
      type="email"
      placeholder="Email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      className="w-full p-2 border rounded"
      required
    />
    
    <input
      type="password"
      placeholder="Şifre"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="w-full p-2 border rounded"
      required
    />
    
    {error && <p className="text-red-500 text-sm">{error}</p>}

    <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
      Giriş Yap
    </button>


  </form>
  </div>
);
}
