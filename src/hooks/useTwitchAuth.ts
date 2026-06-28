"use client";
import { useState, useEffect } from "react";
import {
  buildLoginUrl,
  parseHashToken,
  getStoredToken,
  storeToken,
  clearToken,
  fetchTwitchUser,
} from "@/lib/twitchAuth";

export type TwitchAuth = {
  token: string | null;
  username: string | null;
  login: () => void;
  logout: () => void;
};

export function useTwitchAuth(): TwitchAuth {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // OAuth callback — token arrives in the URL hash
    const hashToken = parseHashToken();
    if (hashToken) {
      storeToken(hashToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setToken(hashToken);
      fetchTwitchUser(hashToken).then((name) => setUsername(name));
      return;
    }

    // Returning visitor — restore from localStorage
    const stored = getStoredToken();
    if (!stored) return;
    fetchTwitchUser(stored).then((name) => {
      if (name) {
        setToken(stored);
        setUsername(name);
      } else {
        // Token expired or revoked
        clearToken();
      }
    });
  }, []);

  const login = () => { window.location.href = buildLoginUrl(); };

  const logout = () => {
    clearToken();
    setToken(null);
    setUsername(null);
  };

  return { token, username, login, logout };
}
