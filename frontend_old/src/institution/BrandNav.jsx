import React from 'react'

const NAV = [
  ['book', 'Book'],
  ['rails', 'Payments & rails'],
  ['queue', 'Approvals'],
  ['cust', 'Customers & accounts'],
  ['branches', 'Branches'],
  ['feed', 'Activity']
]

export default function BrandNav({ K, states }) {
  return (
    <div className="brand">

      <div className="logo">
        <i>V</i>

        <div>
          Vestro Bank
          <small>
            Institution console · {K.branches} branches · {states} states
          </small>
        </div>
      </div>

      <nav>
        {NAV.map(([id, t]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault()

              document
                .getElementById(id)
                ?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            {t}
          </a>
        ))}
      </nav>

    </div>
  )
}