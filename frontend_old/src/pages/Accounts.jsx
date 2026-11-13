
import React from "react";
import { Card, Notice, Page } from "../components/ui.jsx";

const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);

const titleCase = (value) =>
  String(value || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function Accounts({ dashboard, loading = false, error = "" }) {
  const accounts = dashboard?.accounts || [];

  return (
    <Page title="My Accounts">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}

        {loading && accounts.length === 0 && (
          <Card>
            <p>Loading your accounts...</p>
          </Card>
        )}

        {!loading && accounts.length === 0 && (
          <Card>
            <h3>No accounts available</h3>
            <p>Your accounts will appear here once linked to your profile.</p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.code}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm opacity-70">
                    {titleCase(account.kind)} Account
                  </p>
                  <h3 className="text-lg font-semibold">
                    {account.masked || "Account"}
                  </h3>
                  <p className="text-xs opacity-60">
                    Account code: {account.code}
                  </p>
                </div>

                <span className="rounded-full px-3 py-1 text-xs font-semibold">
                  {titleCase(account.status)}
                </span>
              </div>

              <div className="mt-6">
                <p className="text-sm opacity-70">Available balance</p>
                <h2 className="text-2xl font-bold">
                  {money(account.balance_paise)}
                </h2>
              </div>

              {account.bank_frozen && (
                <div className="mt-4 rounded-lg border border-red-300 p-3">
                  <p className="font-semibold text-red-600">
                    Account temporarily frozen
                  </p>
                  <p className="text-sm">
                    {account.freeze_reason || "Contact the bank for assistance."}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
