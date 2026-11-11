// Glue between the simulated bank engine and React: one shared store, a provider, and a few hooks.
import React, { createContext, createElement, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { createBank } from "./engine/index.js";

export const bank = createBank();
const Ctx = createContext(null);

export function BankProvider({ children }) {
  const state = useSyncExternalStore(bank.subscribe, bank.getState);
  const [toasts, setToasts] = useState([]);
  const [otp, setOtp] = useState(null);       // { id, onDone }
  const [nav, setNav] = useState({ tab: "overview", params: {} });

  const toast = useCallback((text, kind = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 4000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /** Runs an engine action. Never throws for business errors: returns { ok, value } or { ok:false, error }. */
  const call = useCallback((name, ...args) => {
    try { return { ok: true, value: bank.dispatch(name, ...args) }; }
    catch (e) { if (e && e.name === "BankError") return { ok: false, error: e.message, code: e.code }; throw e; }
  }, []);
  const openOtp = useCallback((id, onDone) => setOtp({ id, onDone }), []);
  const closeOtp = useCallback(() => setOtp(null), []);
  const go = useCallback((tab, params = {}) => { setNav({ tab, params }); window.scrollTo?.({ top: 0 }); }, []);

  const value = useMemo(() => ({ state, call, toast, toasts, dismissToast, otp, openOtp, closeOtp, nav, go }), [state, call, toast, toasts, dismissToast, otp, openOtp, closeOtp, nav, go]);
  return createElement(Ctx.Provider, { value }, children);
}
export const useBank = () => useContext(Ctx);
export { React };
