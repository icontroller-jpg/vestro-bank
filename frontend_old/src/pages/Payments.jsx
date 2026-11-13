
import React, { useState } from "react";
import { customerApi } from "../customerApi.js";
import { Card, Notice, Page } from "../components/ui.jsx";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const createKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function Payments({ dashboard, onRefresh }) {
  const accounts = (dashboard?.accounts || []).filter(
    (account) =>
      String(account.status || "").toLowerCase() === "active" &&
      !account.bank_frozen
  );

  const [accountCode, setAccountCode] = useState(accounts[0]?.code || "");
  const [recipientAccountCode, setRecipientAccountCode] = useState("");
  const [rail, setRail] = useState("UPI");
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [newBeneficiary, setNewBeneficiary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const updateField = (setter) => (event) => {
    setter(event.target.value);
    setIdempotencyKey("");
    setError("");
    setSuccess("");
  };

  async function submitPayment(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const amountNumber = Number(amount);
    const recipientCode = recipientAccountCode.trim();

    if (
      !accountCode ||
      !beneficiary.trim() ||
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0
    ) {
      setError("Please complete all payment details correctly.");
      return;
    }

    if (recipientCode && recipientCode === accountCode) {
      setError("You cannot transfer to your own debit account.");
      return;
    }

    const key = idempotencyKey || createKey();
    if (!idempotencyKey) setIdempotencyKey(key);

    setLoading(true);

    try {
      const result = await customerApi.transfer({
        account_code: accountCode,
        recipient_account_code: recipientCode,
        rail,
        amount_inr: amountNumber,
        beneficiary: beneficiary.trim(),
        new_beneficiary: newBeneficiary,
        idempotency_key: key,
      });

      setSuccess(
        result?.message ||
          `Payment submitted. Reference: ${
            result?.ref || result?.transaction?.ref || "See transactions"
          }`
      );

      setAmount("");
      setBeneficiary("");
      setRecipientAccountCode("");
      setNewBeneficiary(false);
      setIdempotencyKey("");

      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message || "Payment could not be submitted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Payments">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {success && <Notice>{success}</Notice>}

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Make a payment</h2>

          {accounts.length === 0 ? (
            <p>No eligible active accounts are available for payments.</p>
          ) : (
            <form onSubmit={submitPayment} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Debit account
                </label>
                <select
                  className="w-full rounded-lg border p-3"
                  value={accountCode}
                  onChange={updateField(setAccountCode)}
                  required
                >
                  {accounts.map((account) => (
                    <option key={account.code} value={account.code}>
                      {account.masked} —{" "}
                      {money((account.balance_paise || 0) / 100)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Payment rail
                </label>
                <select
                  className="w-full rounded-lg border p-3"
                  value={rail}
                  onChange={updateField(setRail)}
                >
                  <option value="UPI">UPI</option>
                  <option value="IMPS">IMPS</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Recipient account number
                </label>
                <input
                  className="w-full rounded-lg border p-3"
                  value={recipientAccountCode}
                  onChange={updateField(setRecipientAccountCode)}
                  placeholder="Enter Vestro account code (e.g. AC000002)"
                />
                <p className="mt-1 text-xs opacity-70">
                  Leave blank for a payment to an external beneficiary.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Beneficiary
                </label>
                <input
                  className="w-full rounded-lg border p-3"
                  value={beneficiary}
                  onChange={updateField(setBeneficiary)}
                  placeholder="Enter beneficiary name"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newBeneficiary}
                  onChange={(event) => {
                    setNewBeneficiary(event.target.checked);
                    setIdempotencyKey("");
                    setError("");
                    setSuccess("");
                  }}
                />
                This is a new beneficiary
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Amount (INR)
                </label>
                <input
                  className="w-full rounded-lg border p-3"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={updateField(setAmount)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm opacity-70">Payment amount</p>
                <p className="text-xl font-semibold">{money(amount)}</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg px-4 py-3 font-semibold disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit payment"}
              </button>
            </form>
          )}
        </Card>
      </div>
    </Page>
  );
}
