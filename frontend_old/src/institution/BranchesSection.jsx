import React from 'react'
import { N } from './format.js'

export default function BranchesSection({ D, m }) {
  const K = D.kpis
  const maxBal = Math.max(...D.branches.map((b) => b.balance))

  return (
    <section className="p w" id="branches">

      <h2>
        Branch network

        <span className="mut">
          top 15 of {K.branches} by balances
        </span>
      </h2>

      <table>

        <thead>
          <tr>
            <th>Branch</th>
            <th>State</th>
            <th>Type</th>
            <th className="n">Customers</th>
            <th className="n">Accounts</th>
            <th className="n">Dormant</th>
            <th className="n">Balances</th>
            <th style={{ width: '22%' }}>Share of top</th>
          </tr>
        </thead>

        <tbody>
          {D.branches.map((b) => (
            <tr key={b.id}>

              <td>
                {b.name}
                <br />
                <span className="mut">{b.id}</span>
              </td>

              <td>{b.state}</td>
              <td>{b.type}</td>
              <td className="n">{N.format(b.customers)}</td>
              <td className="n">{N.format(b.accounts)}</td>
              <td className="n">{b.dormant}</td>
              <td className="n">{m(b.balance)}</td>

              <td>
                <div className="bar">
                  <i
                    style={{
                      width: `${(100 * b.balance) / maxBal}%`
                    }}
                  />
                </div>
              </td>

            </tr>
          ))}
        </tbody>

      </table>

    </section>
  )
}