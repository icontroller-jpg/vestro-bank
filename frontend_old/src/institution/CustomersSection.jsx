import React, { useRef, useState } from 'react'
import { Msg } from './ui.jsx'

export default function CustomersSection({
  rh,
  money,
  msg,
  setMsg,
  X,
  run,
  act
}) {
  const [sq, setSq] = useState('')
  const [SR, setSR] = useState([])
  const lastQ = useRef('')

  // Customer search
  const search = (q) =>
    X(
      'GET',
      '/api/portal/staff/search?q=' + encodeURIComponent(q)
    ).then((r) => {
      setSR(r.items)

      setMsg((x) => ({
        ...x,
        c: r.items.length
          ? null
          : {
              kind: 'warn',
              text: 'No matching customers.'
            }
      }))
    })

  const submit = () => {
    lastQ.current = sq
    run('c', () => search(sq))
  }

  // Freeze / unfreeze customer account
  const freeze = (id, on) =>
    act('c', async () => {
      let reason = ''

      if (on) {
        reason = window.prompt(
          'Reason for freezing this account (required, audited):'
        )

        if (!reason) return
      }

      await X(
        'POST',
        `/api/portal/staff/accounts/${id}/freeze`,
        {
          frozen: on,
          reason
        }
      )

      await search(lastQ.current)

      return {
        text: on
          ? 'Account frozen. Outgoing transfers are blocked.'
          : 'Freeze lifted.',
        kind: on ? 'warn' : 'ok'
      }
    })

  return (
    <section className="p w" id="cust">

      <h2>
        Customers &amp; accounts

        <span className="mut">
          freeze needs a reason; only a regional head can lift a freeze
        </span>
      </h2>

      <div className="row">

        <div style={{ width: 280 }}>
          <input
            placeholder="Search customer name or ID (min 2 chars)"
            aria-label="Search customers"
            value={sq}
            onChange={(e) => setSq(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>

        <button className="btn" onClick={submit}>
          Search
        </button>

      </div>

      <Msg m={msg.c} />

      {SR.length ? (
        <table style={{ marginTop: 10 }}>

          <thead>
            <tr>
              <th>Customer</th>
              <th>Segment · KYC · risk</th>
              <th>Account</th>
              <th className="n">Balance</th>
              <th>Status</th>
              <th>Control</th>
            </tr>
          </thead>

          <tbody>
            {SR.flatMap((c) =>
              c.accounts.map((a, i) => (
                <tr key={a.id}>

                  {i === 0 && (
                    <>
                      <td rowSpan={c.accounts.length}>
                        <b>{c.name}</b>
                        <br />
                        <span className="mut">
                          {c.id} · {c.city}
                        </span>
                      </td>

                      <td rowSpan={c.accounts.length}>
                        {c.segment} ·

                        <span
                          className={`pill ${c.kyc_level === 'full' ? 'ok' : 'warn'}`}
                        >
                          KYC {c.kyc_level}
                        </span>
                        {' · '}

                        <span
                          className={`pill ${c.risk_rating === 'high' ? 'bad' : c.risk_rating === 'medium' ? 'warn' : 'ok'}`}
                        >
                          {c.risk_rating}
                        </span>
                      </td>
                    </>
                  )}

                  <td>{a.masked}</td>
                  <td className="n">{money(a.balance)}</td>

                  <td>
                    {a.bank_frozen
                      ? <span className="pill bad">frozen</span>
                      : a.status === 'dormant'
                        ? <span className="pill warn">dormant</span>
                        : <span className="pill ok">active</span>}
                  </td>

                  <td>
                    {a.bank_frozen ? (
                      <button
                        className="btn sec sm"
                        disabled={!rh}
                        title={rh ? '' : 'Regional head only'}
                        onClick={() => freeze(a.id, false)}
                      >
                        Lift freeze
                      </button>
                    ) : (
                      <button
                        className="btn bad sm"
                        onClick={() => freeze(a.id, true)}
                      >
                        Freeze
                      </button>
                    )}
                  </td>

                </tr>
              ))
            )}
          </tbody>

        </table>
      ) : (
        <p className="mut">
          Search to view customers and apply account controls.
        </p>
      )}

    </section>
  )
}