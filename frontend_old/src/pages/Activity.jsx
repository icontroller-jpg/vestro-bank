
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

const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN");
};

export default function Activity({ dashboard, loading = false, error = "" }) {
  const transactions = dashboard?.transactions || [];

  return (
    <Page title="Activity">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <p className="text-sm opacity-70">
                Your latest banking transactions
              </p>
            </div>
            <span className="text-sm opacity-70">
              {transactions.length} records
            </span>
          </div>
        </Card>

        {loading && transactions.length === 0 && (
          <Card>
            <p>Loading transaction activity...</p>
          </Card>
        )}

        {!loading && transactions.length === 0 && (
          <Card>
            <p>No transactions available yet.</p>
          </Card>
        )}

        {transactions.map((transaction) => (
          <Card key={transaction.ref}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {titleCase(transaction.rail)}
                </h3>
                <p className="text-xs opacity-60">
                  Reference: {transaction.ref}
                </p>
                <p className="mt-2 text-sm">
                  {transaction.beneficiary || "Bank transaction"}
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold">
                  {money(transaction.amount_paise)}
                </p>
                <span className="text-xs">
                  {titleCase(transaction.status)}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
              <p>
                <span className="opacity-60">From:</span>{" "}
                {transaction.from_masked || "—"}
              </p>
              <p>
                <span className="opacity-60">To:</span>{" "}
                {transaction.to_masked || "—"}
              </p>
              <p className="sm:col-span-2">
                <span className="opacity-60">Date:</span>{" "}
                {dateTime(transaction.created_at)}
              </p>
            </div>

            {transaction.failure_reason && (
              <div className="mt-3 rounded-lg border border-red-300 p-3 text-sm">
                <strong>Transaction details:</strong>{" "}
                {transaction.failure_reason}
              </div>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
