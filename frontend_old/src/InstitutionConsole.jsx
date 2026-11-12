import React, { useState } from 'react'
import useInstitutionData from './institution/useInstitutionData.js'
import { F0, cr } from './institution/format.js'
import Toolbar from './institution/Toolbar.jsx'
import BrandNav from './institution/BrandNav.jsx'
import BookSection from './institution/BookSection.jsx'
import RailsSection from './institution/RailsSection.jsx'
import QueueSection from './institution/QueueSection.jsx'
import CustomersSection from './institution/CustomersSection.jsx'
import BranchesSection from './institution/BranchesSection.jsx'
import FeedSection from './institution/FeedSection.jsx'
import './InstitutionConsole.css'

export default function InstitutionConsole({ onAuthFailure }) {
  const {
    phase,
    offline,
    role,
    user,
    D,
    Q,
    msg,
    setMsg,
    X,
    run,
    act,
    switchRole,
    signOut
  } = useInstitutionData({ onAuthFailure })

  const [hide, setHide] = useState(false)
  const [fs, setFs] = useState(16)

  if (phase === 'boot') {
    return <div className="ic" style={{ '--fs': fs + 'px' }} />
  }

  if (phase === 'error') {
    return (
      <div className="ic">
        <div className="p w">
          <h2>Unable to load institution console</h2>
          <p>Please return to the banking portal and try again.</p>
          <button className="btn" onClick={onAuthFailure}>
            Return to login
          </button>
        </div>
      </div>
    )
  }

  // No independent login screen in this component.
  if (phase === 'login') {
    return null
  }

  if (!D || !Q) {
    return <div className="ic" />
  }

  const rh = role === 'regionhead'
  const m = (v) => (hide ? 'XXX' : cr(v))
  const money = (v) => (hide ? 'XXX' : F0.format(v))

  return (
    <div className="ic" style={{ '--fs': fs + 'px' }}>

      {/* Demonstration banner */}
      <div className="sim">
        Simulated demonstration · fictional bank, synthetic customers and
        balances, no real money · limits are illustrative
      </div>

      <Toolbar
        offline={offline}
        role={role}
        user={user}
        hide={hide}
        setHide={setHide}
        fs={fs}
        setFs={setFs}
        onSwitchRole={switchRole}
        onSignOut={signOut}
      />

      <BrandNav K={D.kpis} states={D.states} />

      <main>
        <BookSection D={D} Q={Q} m={m} />
        <RailsSection D={D} rh={rh} m={m} msg={msg} X={X} act={act} />
        <QueueSection Q={Q} money={money} msg={msg} X={X} act={act} />
        <CustomersSection
          rh={rh}
          money={money}
          msg={msg}
          setMsg={setMsg}
          X={X}
          run={run}
          act={act}
        />
        <BranchesSection D={D} m={m} />
        <FeedSection Q={Q} />
      </main>
    </div>
  )
}