
import React from "react";
import { Card, Notice, Page } from "../components/ui.jsx";

export default function Cards({ dashboard, loading = false, error = "" }) {
  const cards = dashboard?.cards || [];

  return (
    <Page title="My Cards">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}

        {loading && cards.length === 0 && (
          <Card>
            <p>Loading your cards...</p>
          </Card>
        )}

        {!loading && cards.length === 0 && (
          <Card>
            <h3 className="font-semibold">No cards available</h3>
            <p className="text-sm opacity-70">
              Cards linked to your banking profile will appear here.
            </p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card, index) => (
            <Card key={`${card.masked_account}-${index}`}>
              <div className="rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">VESTRO BANK</span>
                  <span className="text-xs opacity-70">DEBIT CARD</span>
                </div>

                <div className="my-8">
                  <p className="text-xs opacity-70">Linked account</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-widest">
                    {card.masked_account || "•••• ••••"}
                  </h2>
                </div>

                <p className="text-xs opacity-70">CARDHOLDER</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-semibold">VESTRO CUSTOMER</span>
                  <span className="text-sm font-bold">VESTRO</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm opacity-70">Card status</span>
                  <strong className={card.blocked ? "text-red-600" : "text-green-600"}>
                    {card.blocked ? "Blocked" : "Active"}
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm opacity-70">Online payments</span>
                  <strong>{card.online ? "Enabled" : "Disabled"}</strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm opacity-70">
                    International payments
                  </span>
                  <strong>
                    {card.international ? "Enabled" : "Disabled"}
                  </strong>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
