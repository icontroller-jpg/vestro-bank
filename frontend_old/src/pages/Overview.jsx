
import React from "react";
import { useBank } from "../api.js";
import {
  fmtDateTime,
  inr,
  inr0,
  mask,
} from "../engine/index.js";
import {
  Card,
  Notice,
  Page,
} from "../components/ui.jsx";

export default function Overview() {
  const { state: s } = useBank();

  const accounts = s.accounts || [];
  const cards = s.cards || [];
  const customer = s.customer || {};

  const activeAccounts = accounts.filter(
    (a) => a.status !== "CLOSED"
  );

  const activeCards = cards.filter(
    (c) => c.status !== "BLOCKED"
  );

  const totalBalance = activeAccounts.reduce(
    (sum, account) => sum + (Number(account.balance) || 0),
    0
  );

  // Use the available transaction collection.
  const transactions = [
    ...(Array.isArray(s.transactions) ? s.transactions : []),
    ...(Array.isArray(s.txns) ? s.txns : []),
  ];

  // Avoid showing duplicate transactions.
  const uniqueTransactions = Array.from(
    new Map(
      transactions.map((t, i) => [t.id || `${t.ts}-${i}`, t])
    ).values()
  );

  const recentTransactions = (
    uniqueTransactions.length
      ? uniqueTransactions
      : (s.cardTxns || [])
  ).slice(0, 5);

  const alerts = Array.isArray(s.alerts) ? s.alerts : [];

  return (
    <Page
      title={`Welcome back${customer.name ? `, ${customer.name}` : ""}`}
      sub="Your Vestro Bank account overview"
    >
      {/* Account summary */}
      <div className="grid cols-2">
        <Card title="Total available balance">
          <div className="big">
            {inr(totalBalance)}
          </div>
          <div className="muted small">
            Across {activeAccounts.length} active accounts
          </div>
        </Card>

        <Card title="Customer profile">
          <div className="big">
            {customer.name || "Vestro Customer"}
          </div>
          <div className="muted small">
            {customer.segment || "Personal Banking"}
          </div>
        </Card>
      </div>

      {/* Accounts */}
      <Card title="Your accounts" sub="A summary of your Vestro accounts">
        {!activeAccounts.length ? (
          <Notice
            tone="info"
            title="No active accounts"
          >
            Your active accounts will appear here.
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
                {activeAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>
                        {a.type === "SAVINGS"
                          ? "Savings Account"
                          : a.type === "CURRENT"
                          ? "Current Account"
                          : a.type || "Bank Account"}
                      </b>
                    </td>
                    <td className="nowrap">
                      {a.number ? mask(a.number) : a.id}
                    </td>
                    <td>
                      <span className="pill ok">
                        {a.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="r nowrap">
                      {inr(a.balance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Cards */}
      <Card
        title="Your cards"
        sub="Your debit and credit cards"
      >
        {!activeCards.length ? (
          <Notice
            tone="info"
            title="No active cards"
          >
            Your issued cards will appear here.
          </Notice>
        ) : (
          <div className="grid cols-2">
            {activeCards.map((c) => (
              <div className="cardart" key={c.id}>
                <div className="ca-top">
                  <b>Vestro</b>
                  <span>
                    {c.kind === "CREDIT" ? "CREDIT" : "DEBIT"}
                  </span>
                </div>

                <div className="ca-chip" aria-hidden="true" />

                <div className="ca-num">
                  •••• •••• •••• {c.last4}
                </div>

                <div className="ca-bot">
                  <span>{c.holder || customer.name || "CARD HOLDER"}</span>
                  <span>{c.expiry || ""}</span>
                  <span>{c.network || ""}</span>
                </div>

                {(c.frozen || c.status === "ISSUED") && (
                  <div className="ca-flag">
                    {c.status === "ISSUED" ? "NOT ACTIVATED" : "FROZEN"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="muted small">
          Manage card settings, spending limits and security from Cards.
        </p>
      </Card>

      {/* Recent activity */}
      <Card
        title="Recent activity"
        sub="Your latest transactions"
        flush
      >
        {!recentTransactions.length ? (
          <div className="pad">
            <p className="muted">
              No transactions to display yet.
            </p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((t, i) => (
                  <tr key={t.id || i}>
                    <td className="nowrap">
                      {t.ts ? fmtDateTime(t.ts) : "—"}
                    </td>
                    <td>
                      <b>
                        {t.merchant || t.description || t.type || "Transaction"}
                      </b>
                      <div className="muted small">
                        {t.category || t.channel || ""}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          t.status === "DECLINED" ||
                          t.status === "FAILED"
                            ? "bad"
                            : "ok"
                        }`}
                      >
                        {t.status || "COMPLETED"}
                      </span>
                    </td>
                    <td
                      className={`r nowrap ${
                        t.status === "DECLINED" ? "muted" : t.credit ? "cr" : ""
                      }`}
                    >
                      {t.credit ? "+" : ""}
                      {inr(t.amount || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Notifications */}
      <Card
        title="Notifications"
        sub="Important updates about your account"
      >
        {!alerts.length ? (
          <Notice
            tone="good"
            title="You're all caught up"
          >
            There are no new account notifications.
          </Notice>
        ) : (
          <div className="stack">
            {alerts.slice(0, 5).map((alert, i) => (
              <Notice
                key={alert.id || i}
                tone={alert.tone || "info"}
                title={alert.title || "Account notification"}
              >
                {alert.message || alert.text || String(alert)}
              </Notice>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
