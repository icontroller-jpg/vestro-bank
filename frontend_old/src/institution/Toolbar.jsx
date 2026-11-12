import React from 'react'

export default function Toolbar({
  offline,
  role,
  user,
  hide,
  setHide,
  fs,
  setFs,
  onSwitchRole,
  onSignOut
}) {
  return (
    <div className="util">

      <span>
        Institution console

        {offline && (
          <>
            {' · '}
            <b style={{ color: '#F2A33A' }}>
              Offline demo: embedded snapshot of the synthetic bank,
              actions simulated in your browser
            </b>
          </>
        )}
      </span>

      <span className="sp" />

      {offline ? (
        <>
          <span>Viewing as</span>

          <select
            aria-label="Viewing as"
            value={role}
            onChange={(e) => onSwitchRole(e.target.value)}
          >
            <option value="branchmgr">Branch manager</option>
            <option value="regionhead">Regional head</option>
          </select>
        </>
      ) : (
        <span>{user}</span>
      )}

      <button onClick={() => setHide(!hide)}>
        {hide ? 'Show' : 'Hide'} amounts
      </button>

      <button onClick={() => setFs(Math.max(13, fs - 1))}>A−</button>
      <button onClick={() => setFs(Math.min(20, fs + 1))}>A+</button>

      {!offline && <button onClick={onSignOut}>Sign out</button>}

    </div>
  )
}