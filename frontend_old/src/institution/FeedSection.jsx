import React from 'react'

const evDetail = (e) =>
  (
    typeof e.detail === 'string'
      ? e.detail
      : JSON.stringify(e.detail)
  ).slice(0, 110)

export default function FeedSection({ Q }) {
  return (
    <section className="p w" id="feed">

      <h2>
        Institution activity feed

        <span className="mut">
          every portal action is also written to the tamper-evident audit chain
        </span>
      </h2>

      <table>

        <thead>
          <tr>
            <th>Time</th>
            <th>Customer</th>
            <th>Event</th>
            <th>Detail</th>
          </tr>
        </thead>

        <tbody>
          {Q.events.length ? (
            Q.events.slice(0, 25).map((e) => (
              <tr key={e.id}>

                <td className="mut">
                  {e.ts.slice(0, 16).replace('T', ' ')}
                </td>

                <td>{e.customer_id}</td>

                <td>
                  <span
                    className={`pill ${e.severity === 'warn' ? 'warn' : ''}`}
                  >
                    {e.type}
                  </span>
                </td>

                <td className="mut">{evDetail(e)}</td>

              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="mut">
                No activity yet.
              </td>
            </tr>
          )}
        </tbody>

      </table>

    </section>
  )
}