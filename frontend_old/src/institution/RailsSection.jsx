import React, { useEffect, useState } from 'react'
import { N } from './format.js'
import { Msg, Toggle } from './ui.jsx'

export default function RailsSection({ D, rh, m, msg, X, act }) {
  const [mx, setMx] = useState({})

  // Update payment limit inputs when dashboard data changes
  useEffect(() => {
    if (D) {
      setMx(
        Object.fromEntries(
          Object.entries(D.policy).map(([k, v]) => [
            k,
            v.max_per_txn
          ])
        )
      )
    }
  }, [D])

  return (
    <section className="p w" id="rails">

      <h2>
        Payment rails &amp; institution-wide controls

        <span className="mut">
          {rh
            ? 'Regional head: you can change these'
            : 'Read-only for branch managers; a regional head changes policy'}
        </span>
      </h2>

      <table>
        <thead>
          <tr>
            <th>Rail</th>
            <th className="n">Txns (window)</th>
            <th className="n">Value</th>
            <th className="n">Failure %</th>
            <th className="n">High-risk</th>
            <th>Status</th>
            <th>Max per txn ₹</th>
            <th>Enabled</th>
          </tr>
        </thead>

        <tbody>
          {D.rails.map((r) => {
            const p = D.policy[r.rail]

            return (
              <tr key={r.rail}>

                <td><b>{r.rail}</b></td>
                <td className="n">{N.format(r.count)}</td>
                <td className="n">{m(r.amount)}</td>
                <td className="n">{r.failure_pct}%</td>
                <td className="n">{N.format(r.high_risk)}</td>

                {p ? (
                  <>
                    <td>
                      {p.enabled
                        ? <span className="pill ok">live</span>
                        : <span className="pill bad">suspended</span>}
                    </td>

                    <td>
                      <div className="row">

                        <input
                          style={{ width: 120 }}
                          inputMode="numeric"
                          aria-label={`max ${r.rail}`}
                          value={mx[r.rail] ?? ''}
                          disabled={!rh}
                          onChange={(e) =>
                            setMx({
                              ...mx,
                              [r.rail]: e.target.value
                            })
                          }
                        />

                        <button
                          className="btn sm"
                          disabled={!rh}
                          onClick={() =>
                            act('pol', async () => {
                              await X(
                                'POST',
                                '/api/portal/staff/policy',
                                {
                                  mode: r.rail,
                                  max_per_txn: Number(mx[r.rail])
                                }
                              )

                              return {
                                text: `${r.rail} limit updated.`
                              }
                            })
                          }
                        >
                          Set
                        </button>

                      </div>

                      <span className="mut">
                        ceiling {N.format(p.ceiling)}
                      </span>
                    </td>

                    <td>
                      <Toggle
                        on={p.enabled}
                        disabled={!rh}
                        label={`${r.rail} enabled`}
                        onClick={() =>
                          act('pol', async () => {
                            const was = p.enabled

                            await X(
                              'POST',
                              '/api/portal/staff/policy',
                              {
                                mode: r.rail,
                                enabled: !was
                              }
                            )

                            return {
                              text: `${r.rail} ${was ? 'suspended' : 'resumed'}.`,
                              kind: was ? 'warn' : 'ok'
                            }
                          })
                        }
                      />
                    </td>
                  </>
                ) : (
                  <td colSpan="3" className="mut">
                    not controlled from the portal
                  </td>
                )}

              </tr>
            )
          })}
        </tbody>
      </table>

      <Msg m={msg.pol} />

      <p className="mut">
        Transaction figures come from the synthetic transaction window.
        Suspending a rail or lowering its limit takes effect for new
        customer transfers immediately.
      </p>

    </section>
  )
}