import React from 'react'
import { N } from './format.js'
import { Msg } from './ui.jsx'

export default function QueueSection({ Q, money, msg, X, act }) {
  // Approval workflow
  const wf = (it, a) =>
    act('q', async () => {
      await X(
        'POST',
        `/api/portal/staff/${it.id}/${a}`,
        a === 'reject'
          ? { note: 'Rejected at review' }
          : {}
      )

      return {
        text: `${a} recorded for ${it.id}`
      }
    })

  return (
    <section className="p w" id="queue">

      <h2>
        Approval queue

        <span className="mut">
          maker-checker: the person who authorises cannot also release;
          ₹{N.format(Q.high_value_threshold)}+ needs a regional head
        </span>
      </h2>

      <Msg m={msg.q} />

      <table>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Customer</th>
            <th>Beneficiary</th>
            <th className="n">Amount</th>
            <th>Why held</th>
            <th>State</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {Q.payments.length ? (
            Q.payments.map((p) => (
              <tr key={p.id}>

                <td>{p.id}</td>
                <td>{p.data.customer_id}</td>
                <td>{p.data.beneficiary}</td>
                <td className="n">
                  {money(p.data.amount_inr)}
                </td>

                <td>
                  {p.data.high_value
                    ? <span className="pill warn">high value</span>
                    : <span className="pill warn">risk {p.data.frm_score}</span>}

                  {p.data.new_beneficiary && (
                    <> <span className="pill">new payee</span></>
                  )}
                </td>

                <td>{p.state.replace('_', ' ')}</td>

                <td>
                  <div className="row">
                    {p.actions.length
                      ? p.actions.map((a) => (
                          <button
                            key={a}
                            className={`btn sm ${a === 'reject' ? 'bad' : ''}`}
                            onClick={() => wf(p, a)}
                          >
                            {a}
                          </button>
                        ))
                      : <span className="mut">none for your role</span>}
                  </div>
                </td>

              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="mut">
                No held payments.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Customer</th>
            <th>Type</th>
            <th className="n">Amount</th>
            <th className="n">EMI burden</th>
            <th>System view</th>
            <th>State</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {Q.loans.length ? (
            Q.loans.map((l) => (
              <tr key={l.id}>

                <td>{l.id}</td>
                <td>{l.data.customer}</td>
                <td>{l.data.loan_type}</td>
                <td className="n">{money(l.data.amount)}</td>
                <td className="n">
                  {Math.round(l.data.foir * 100)}%
                </td>

                <td>
                  <span
                    className={`pill ${l.data.recommendation === 'APPROVE' ? 'ok' : 'warn'}`}
                  >
                    {l.data.recommendation}
                  </span>
                </td>

                <td>{l.state}</td>

                <td>
                  <div className="row">
                    {l.actions.length
                      ? l.actions.map((a) => (
                          <button
                            key={a}
                            className={`btn sm ${a === 'reject' ? 'bad' : ''}`}
                            onClick={() => wf(l, a)}
                          >
                            {a}
                          </button>
                        ))
                      : <span className="mut">none</span>}
                  </div>
                </td>

              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" className="mut">
                No loan applications.
              </td>
            </tr>
          )}
        </tbody>
      </table>

    </section>
  )
}