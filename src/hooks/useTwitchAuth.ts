"use client";
import { useState, useEffect } from "react";
import {
  buildLoginUrl,
  parseHashToken,
  getStoredToken,
  storeToken,
  clearToken,
  fetchTwitchUser,
  storeReturnPath,
  takeReturnPath,
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
      // Login started on another page (e.g. /control) — send the user back.
      // That page restores the token from localStorage on mount.
      const returnPath = takeReturnPath();
      const herePath = window.location.pathname + window.location.search;
      if (returnPath && returnPath !== herePath) {
        window.location.replace(returnPath);
        return;
      }
      window.history.replaceState(null, "", herePath);
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

  const login = () => {
    storeReturnPath(window.location.pathname + window.location.search);
    window.location.href = buildLoginUrl();
  };

  const logout = () => {
    clearToken();
    setToken(null);
    setUsername(null);
  };

  return { token, username, login, logout };
}
