import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "signal.active_api_key";
const EVENT = "signal:active-key-changed";

export function readActiveKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeActiveKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The api_key the console is currently acting as. Read after hydration only,
 * so SSR and the first client render agree.
 */
export function useActiveClient() {
  const [apiKey, setApiKey] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setApiKey(readActiveKey());
    setReady(true);
    const sync = () => setApiKey(readActiveKey());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setKey = useCallback((key: string) => writeActiveKey(key.trim()), []);

  return { apiKey, ready, setKey };
}
