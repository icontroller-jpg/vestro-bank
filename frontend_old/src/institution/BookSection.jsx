import React from 'react'
import { N } from './format.js'
import { Dist } from './ui.jsx'

export default function BookSection({ D, Q, m }) {
  const K = D.kpis

  return (
    <section className="p w" id="book">

      <div className="kpis">

        <div className="k k1">
          <small>Customers</small>
          <b>{N.format(K.customers)}</b>
          <small>
            {Object.entries(D.segments)
              .map(([k, v]) => `${k} ${N.format(v)}`)
              .join(' · ')}
          </small>
        </div>

        <div className="k k2">
          <small>Accounts · balances</small>
          <b>{m(K.balance)}</b>
          <small>
            {N.format(K.accounts)} accounts ·
            {' '}{N.format(K.dormant_accounts)} dormant
          </small>
        </div>

        <div className="k k3">
          <small>Deposit book (FD)</small>
          <b>{m(K.deposit_book)}</b>
          <small>{N.format(K.deposits)} deposits</small>
        </div>

        <div className="k k4">
          <small>Loan book</small>
          <b>{m(K.loan_book)}</b>
          <small>{N.format(K.loans)} loans</small>
        </div>

        <div className="k k5">
          <small>Cards</small>
          <b>{N.format(K.cards)}</b>
          <small>{N.format(K.cards_blocked)} blocked</small>
        </div>

        <div className="k k6">
          <small>Awaiting approval</small>
          <b>{Q.payments.length + Q.loans.length}</b>
          <small>
            {Q.payments.length} payments · {Q.loans.length} loans
          </small>
        </div>

      </div>

      <div className="split" style={{ marginTop: 16 }}>

        <div>
          <h3>KYC status</h3>
          <Dist data={D.kyc} total={K.customers} />
        </div>

        <div>
          <h3>Customer risk rating</h3>
          <Dist data={D.risk} total={K.customers} warn />
        </div>

        <div>
          <h3>Loan book by type</h3>

          <Dist
            data={Object.fromEntries(
              Object.entries(D.loan_book_by_type).map(
                ([k, v]) => [k, Math.round(v / 1e5)]
              )
            )}
            total={Math.max(
              1,
              Object.values(D.loan_book_by_type).reduce(
                (a, b) => a + b,
                0
              ) / 1e5
            )}
          />

          <div className="mut">₹ lakh</div>
        </div>

        <div>
          <h3>Card features enabled</h3>

          <Dist
            data={{
              online: D.card_features.online,
              international: D.card_features.international
            }}
            total={D.card_features.total}
          />

          <div className="mut">
            of {N.format(D.card_features.total)} cards
          </div>
        </div>

      </div>
    </section>
  )
}