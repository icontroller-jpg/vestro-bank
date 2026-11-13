
import React from "react";
import { Card, Notice, Page } from "../components/ui.jsx";

const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);

const dateFormat = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

export default function Deposits({ dashboard, loading = false, error = "" }) {
  const deposits = dashboard?.deposits || [];

  const total = deposits.reduce(
    (sum, deposit) => sum + (Number(deposit.principal_paise) || 0),
    0
  );

  return (
    <Page title="My Deposits">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}

        <Card>
          <p className="text-sm opacity-70">Total deposit principal</p>
          <h2 className="mt-1 text-2xl font-bold">{money(total)}</h2>
          <p className="mt-1 text-xs opacity-60">
            Across {deposits.length} deposit{deposits.length === 1 ? "" : "s"}
          </p>
        </Card>

        {loading && deposits.length === 0 && (
          <Card>
            <p>Loading your deposits...</p>
          </Card>
        )}

        {!loading && deposits.length === 0 && (
          <Card>
            <h3 className="font-semibold">No deposits found</h3>
            <p className="text-sm opacity-70">
              Your fixed deposits will appear here when available.
            </p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {deposits.map((deposit, index) => (
            <Card key={`${deposit.opened_at}-${index}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm opacity-70">Fixed deposit</p>
                  <h3 className="text-xl font-bold">
                    {money(deposit.principal_paise)}
                  </h3>
                </div>

                <span className="rounded-full border px-3 py-1 text-xs">
                  {deposit.tenor_months} months
                </span>
              </div>

              <div className="mt-5 border-t pt-4">
                <p className="text-xs opacity-60">Opening date</p>
                <p className="font-medium">
                  {dateFormat(deposit.opened_at)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
