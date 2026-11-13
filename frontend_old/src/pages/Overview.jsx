import React from "react";
import { Card, Notice, Page } from "../components/ui.jsx";

const money = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);

const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN");
};

export default function Overview({ dashboard }) {
  const customer = dashboard?.customer || {};
  const accounts = dashboard?.accounts || [];
  const transactions = dashboard?.transactions || [];

  const activeAccounts = accounts.filter(
    (account) => account.status === "active" && !account.bank_frozen
  );

  const totalBalance = activeAccounts.reduce(
    (sum, account) => sum + (Number(account.balance_paise) || 0),
    0
  );

  return (
    <Page
      title={`Welcome back${customer.name ? `, ${customer.name}` : ""}`}
      sub="Your Vestro Bank account overview"
    >
      <div className="grid cols-2">
        <Card title="Total available balance">
          <div className="big">{money(totalBalance)}</div>
          <div className="muted small">
            Across {activeAccounts.length} active, unfrozen accounts
          </div>
        </Card>

        <Card title="Customer profile">
          <div className="big">{customer.name || "Vestro Customer"}</div>
          <div className="muted small">
            {customer.segment || "Customer"} · {customer.city || "—"}
          </div>
          <div className="muted small">
            Customer ID: {customer.code || "—"}
          </div>
        </Card>
      </div>

      <Card title="Your accounts" sub="Account information from Vestro Bank">
        {!accounts.length ? (
          <Notice tone="info" title="No accounts found">
            No customer accounts are currently linked to your profile.
          </Notice>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Account number</th>
                  <th>Status</th>
                  <th className="r">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.code}>
                    <td><b>{account.kind || "Bank Account"}</b></td>
                    <td className="nowrap">{account.masked || "—"}</td>
                    <td>
                      <span className={`pill ${
                        account.bank_frozen || account.status !== "active"
                          ? "bad"
                          : "ok"
                      }`}>
                        {account.bank_frozen
                          ? "FROZEN"
                          : String(account.status || "UNKNOWN").toUpperCase()}
                      </span>
                      {account.freeze_reason && (
                        <div className="muted small">
                          {account.freeze_reason}
                        </div>
                      )}
                    </td>
                    <td className="r nowrap">
                      {money(account.balance_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Recent activity"
        sub="Your latest transactions"
        flush
      >
        {!transactions.length ? (
          <div className="pad">
            <p className="muted">No transactions to display yet.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Rail</th>
                  <th>Status</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.ref}>
                    <td className="nowrap">
                      {dateTime(transaction.created_at)}
                    </td>
                    <td>
                      <b>{transaction.beneficiary || "Bank transaction"}</b>
                      <div className="muted small">
                        Ref: {transaction.ref}
                      </div>
                    </td>
                    <td>{transaction.rail || "—"}</td>
                    <td>
                      <span className={`pill ${
                        ["FAILED", "REJECTED", "HELD"].includes(transaction.status)
                          ? "bad"
                          : "ok"
                      }`}>
                        {transaction.status || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="r nowrap">
                      {money(transaction.amount_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
