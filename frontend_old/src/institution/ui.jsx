import React from 'react'
import { N } from './format.js'

export const Msg = ({ m }) => (
  m
    ? <div className={`msg ${m.kind || 'ok'}`} role="status">{m.text}</div>
    : null
)

export const Toggle = ({ on, disabled, onClick, label }) => (
  <button
    className="tg"
    role="switch"
    aria-checked={!!on}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  />
)

export const Dist = ({ data, total, warn }) =>
  Object.entries(data).map(([k, v]) => (
    <div className="dist" key={k}>
      <span>{k}</span>
      <div className={`bar ${warn ? 'w' : ''}`}>
        <i style={{ width: `${(100 * v) / total}%` }} />
      </div>
      <span className="mut">{N.format(v)}</span>
    </div>
  ))