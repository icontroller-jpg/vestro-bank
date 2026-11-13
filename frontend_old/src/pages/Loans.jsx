
import React from "react";
import { Card, Notice, Page } from "../components/ui.jsx";

const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);

const titleCase = (value) =>
  String(value || "Loan")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

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

export default function Loans({ dashboard, loading = false, error = "" }) {
  const loans = dashboard?.loans || [];

  const total = loans.reduce(
    (sum, loan) => sum + (Number(loan.amount_paise) || 0),
    0
  );

  return (
    <Page title="My Loans">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}

        <Card>
          <p className="text-sm opacity-70">Total loan amount recorded</p>
          <h2 className="mt-1 text-2xl font-bold">{money(total)}</h2>
          <p className="mt-1 text-xs opacity-60">
            Across {loans.length} loan{loans.length === 1 ? "" : "s"}
          </p>
        </Card>

        {loading && loans.length === 0 && (
          <Card>
            <p>Loading your loans...</p>
          </Card>
        )}

        {!loading && loans.length === 0 && (
          <Card>
            <h3 className="font-semibold">No loans found</h3>
            <p className="text-sm opacity-70">
              Your active loan records will appear here.
            </p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {loans.map((loan, index) => (
            <Card key={`${loan.opened_at}-${index}`}>
              <p className="text-sm opacity-70">Loan type</p>
              <h3 className="text-lg font-semibold">
                {titleCase(loan.loan_type)}
              </h3>

              <div className="mt-5">
                <p className="text-xs opacity-60">Recorded loan amount</p>
                <h2 className="text-2xl font-bold">
                  {money(loan.amount_paise)}
                </h2>
              </div>

              <div className="mt-5 border-t pt-4">
                <p className="text-xs opacity-60">Opening date</p>
                <p className="font-medium">{dateFormat(loan.opened_at)}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
