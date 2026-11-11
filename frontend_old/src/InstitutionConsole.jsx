import React, { useEffect, useRef, useState } from 'react'
import { api, hasToken, post, get, setToken } from './consoleApi.js'
import { offlineCall } from './offline.js'
import './InstitutionConsole.css'

const F0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const N = new Intl.NumberFormat('en-IN')
const cr = (v) => (v >= 1e7 ? '₹' + (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? '₹' + (v / 1e5).toFixed(2) + ' L' : F0.format(v))

const Msg = ({ m }) => (m ? <div className={`msg ${m.kind || 'ok'}`} role="status">{m.text}</div> : null)
const Toggle = ({ on, disabled, onClick, label }) => <button className="tg" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={onClick} />
const Dist = ({ data, total, warn }) => Object.entries(data).map(([k, v]) => (
  <div className="dist" key={k}><span>{k}</span><div className={`bar ${warn ? 'w' : ''}`}><i style={{ width: `${(100 * v) / total}%` }} /></div><span className="mut">{N.format(v)}</span></div>))

function Login({ onDone }) {
  const [demo, setDemo] = useState({ staff: [] }); const [u, setU] = useState(''); const [p, setP] = useState(''); const [m, setM] = useState(null)
  useEffect(() => { api.demo().then(setDemo).catch(() => {}) }, [])
  const go = async (user, pw) => {
    try { const r = await api.login(user, pw); if (r.user.role === 'customer') throw new Error('This is the staff console. Customers use the customer portal.'); setToken(r.token); onDone(r.user) }
    catch (e) { setM({ kind: 'bad', text: e.message }) }
  }
  return (<div className="login"><div className="logo"><i>V</i><div>Vestro Bank<small>Institution console · staff sign-in</small></div></div>
    <div className="p w" style={{ marginTop: 14 }}><h2>Sign in</h2>
      <div className="g"><div><label>User ID</label><input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" /></div>
        <div><label>Password</label><input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && go(u, p)} /></div></div>
      <button className="btn" onClick={() => go(u, p)}>Login</button><Msg m={m} />
      <h2 style={{ marginTop: 16 }}>Demo staff <span className="mut">password: vestro-demo</span></h2>
      {demo.staff.map((s) => <button key={s.username} className="chip" onClick={() => go(s.username, 'vestro-demo')}><b>{s.name}</b><small>{s.role === 'regionhead' ? 'Can change payment policy, lift freezes, approve ₹10L+' : 'Can approve below ₹10L, freeze accounts'}</small></button>)}
    </div></div>)
}

export default function InstitutionConsole() {
  const [phase, setPhase] = useState('boot')           // boot | login | ready
  const [offline, setOffline] = useState(false)
  const [role, setRole] = useState('branchmgr'); const roleRef = useRef(role); roleRef.current = role
  const [user, setUser] = useState('')
  const [D, setD] = useState(null); const [Q, setQ] = useState(null)
  const [sq, setSq] = useState(''); const [SR, setSR] = useState([]); const lastQ = useRef('')
  const [msg, setMsg] = useState({}); const [hide, setHide] = useState(false); const [fs, setFs] = useState(16); const [mx, setMx] = useState({})
  const off = useRef(false)

  const X = (method, path, b) => (off.current ? Promise.resolve().then(() => offlineCall(roleRef.current, method, path, b)) : (method === 'GET' ? get(path) : post(path, b)))
  const say = (k, text, kind = 'ok') => setMsg((m) => ({ ...m, [k]: { text, kind } }))
  const run = (k, fn) => fn().catch((e) => say(k, e.message, 'bad'))
  const load = async () => { const [d, q] = await Promise.all([X('GET', '/api/portal/institution'), X('GET', '/api/portal/staff/queue')]); setD(d); setQ(q) }
  const goOffline = async () => { off.current = true; setOffline(true); await load(); setPhase('ready') }

  useEffect(() => {
    (async () => {
      try {
        if (hasToken()) { const r = await api.me(); if (r?.user && r.user.role !== 'customer') { setRole(r.user.role); setUser(r.user.name); await load(); setPhase('ready'); return } setToken(null) }
        await api.demo(); setPhase('login')
      } catch (e) { e.offline ? goOffline() : setPhase('login') }
    })()
  }, []) // eslint-disable-line
  useEffect(() => { if (D) setMx(Object.fromEntries(Object.entries(D.policy).map(([k, v]) => [k, v.max_per_txn]))) }, [D])

  if (phase === 'boot') return <div className="ic" style={{ '--fs': fs + 'px' }} />
  if (phase === 'login') return <div className="ic"><div className="sim">Simulated demonstration · fictional bank, synthetic data</div><Login onDone={async (u) => { setRole(u.role); setUser(u.name); await load(); setPhase('ready') }} /></div>
  if (!D || !Q) return <div className="ic" />

  const K = D.kpis; const rh = role === 'regionhead'; const maxBal = Math.max(...D.branches.map((b) => b.balance))
  const m = (v) => (hide ? 'XXX' : cr(v)); const money = (v) => (hide ? 'XXX' : F0.format(v))
  const search = (q) => X('GET', '/api/portal/staff/search?q=' + encodeURIComponent(q)).then((r) => { setSR(r.items); setMsg((x) => ({ ...x, c: r.items.length ? null : { kind: 'warn', text: 'No matching customers.' } })) })
  const act = (k, fn) => run(k, async () => { const r = await fn(); await load(); if (r) say(k, r.text, r.kind) })   // message only after fresh data is on screen
  const wf = (it, a) => act('q', async () => { await X('POST', `/api/portal/staff/${it.id}/${a}`, a === 'reject' ? { note: 'Rejected at review' } : {}); return { text: `${a} recorded for ${it.id}` } })
  const freeze = (id, on) => act('c', async () => {
    let reason = ''; if (on) { reason = window.prompt('Reason for freezing this account (required, audited):'); if (!reason) return }
    await X('POST', `/api/portal/staff/accounts/${id}/freeze`, { frozen: on, reason }); await search(lastQ.current); return { text: on ? 'Account frozen. Outgoing transfers are blocked.' : 'Freeze lifted.', kind: on ? 'warn' : 'ok' }
  })
  const evDetail = (e) => (typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)).slice(0, 110)

  return (<div className="ic" style={{ '--fs': fs + 'px' }}>
    <div className="sim">Simulated demonstration · fictional bank, synthetic customers and balances, no real money · limits are illustrative</div>
    <div className="util"><span>Institution console{offline && <> · <b style={{ color: '#F2A33A' }}>Offline demo: embedded snapshot of the synthetic bank, actions simulated in your browser</b></>}</span><span className="sp" />
      {offline ? <><span>Viewing as</span><select aria-label="Viewing as" value={role} onChange={(e) => { setRole(e.target.value); roleRef.current = e.target.value; setMsg({}); load() }}><option value="branchmgr">Branch manager</option><option value="regionhead">Regional head</option></select></> : <span>{user}</span>}
      <button onClick={() => setHide(!hide)}>{hide ? 'Show' : 'Hide'} amounts</button><button onClick={() => setFs(Math.max(13, fs - 1))}>A−</button><button onClick={() => setFs(Math.min(20, fs + 1))}>A+</button>
      {!offline && <button onClick={() => { setToken(null); setD(null); setPhase('login') }}>Sign out</button>}</div>
    <div className="brand"><div className="logo"><i>V</i><div>Vestro Bank<small>Institution console · {K.branches} branches · {D.states} states</small></div></div>
      <nav>{[['book', 'Book'], ['rails', 'Payments & rails'], ['queue', 'Approvals'], ['cust', 'Customers & accounts'], ['branches', 'Branches'], ['feed', 'Activity']].map(([id, t]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }}>{t}</a>)}</nav></div>
    <main>
      <section className="p w" id="book"><div className="kpis">
        <div className="k k1"><small>Customers</small><b>{N.format(K.customers)}</b><small>{Object.entries(D.segments).map(([k, v]) => `${k} ${N.format(v)}`).join(' · ')}</small></div>
        <div className="k k2"><small>Accounts · balances</small><b>{m(K.balance)}</b><small>{N.format(K.accounts)} accounts · {N.format(K.dormant_accounts)} dormant</small></div>
        <div className="k k3"><small>Deposit book (FD)</small><b>{m(K.deposit_book)}</b><small>{N.format(K.deposits)} deposits</small></div>
        <div className="k k4"><small>Loan book</small><b>{m(K.loan_book)}</b><small>{N.format(K.loans)} loans</small></div>
        <div className="k k5"><small>Cards</small><b>{N.format(K.cards)}</b><small>{N.format(K.cards_blocked)} blocked</small></div>
        <div className="k k6"><small>Awaiting approval</small><b>{Q.payments.length + Q.loans.length}</b><small>{Q.payments.length} payments · {Q.loans.length} loans</small></div></div>
        <div className="split" style={{ marginTop: 16 }}>
          <div><h3>KYC status</h3><Dist data={D.kyc} total={K.customers} /></div>
          <div><h3>Customer risk rating</h3><Dist data={D.risk} total={K.customers} warn /></div>
          <div><h3>Loan book by type</h3><Dist data={Object.fromEntries(Object.entries(D.loan_book_by_type).map(([k, v]) => [k, Math.round(v / 1e5)]))} total={Math.max(1, Object.values(D.loan_book_by_type).reduce((a, b) => a + b, 0) / 1e5)} /><div className="mut">₹ lakh</div></div>
          <div><h3>Card features enabled</h3><Dist data={{ online: D.card_features.online, international: D.card_features.international }} total={D.card_features.total} /><div className="mut">of {N.format(D.card_features.total)} cards</div></div></div></section>

      <section className="p w" id="rails"><h2>Payment rails &amp; institution-wide controls <span className="mut">{rh ? 'Regional head: you can change these' : 'Read-only for branch managers; a regional head changes policy'}</span></h2>
        <table><thead><tr><th>Rail</th><th className="n">Txns (window)</th><th className="n">Value</th><th className="n">Failure %</th><th className="n">High-risk</th><th>Status</th><th>Max per txn ₹</th><th>Enabled</th></tr></thead><tbody>
          {D.rails.map((r) => { const p = D.policy[r.rail]; return (<tr key={r.rail}><td><b>{r.rail}</b></td><td className="n">{N.format(r.count)}</td><td className="n">{m(r.amount)}</td><td className="n">{r.failure_pct}%</td><td className="n">{N.format(r.high_risk)}</td>
            {p ? <><td>{p.enabled ? <span className="pill ok">live</span> : <span className="pill bad">suspended</span>}</td>
              <td><div className="row"><input style={{ width: 120 }} inputMode="numeric" aria-label={`max ${r.rail}`} value={mx[r.rail] ?? ''} disabled={!rh} onChange={(e) => setMx({ ...mx, [r.rail]: e.target.value })} />
                <button className="btn sm" disabled={!rh} onClick={() => act('pol', async () => { await X('POST', '/api/portal/staff/policy', { mode: r.rail, max_per_txn: Number(mx[r.rail]) }); return { text: `${r.rail} limit updated.` } })}>Set</button></div><span className="mut">ceiling {N.format(p.ceiling)}</span></td>
              <td><Toggle on={p.enabled} disabled={!rh} label={`${r.rail} enabled`} onClick={() => act('pol', async () => { const was = p.enabled; await X('POST', '/api/portal/staff/policy', { mode: r.rail, enabled: !was }); return { text: `${r.rail} ${was ? 'suspended' : 'resumed'}.`, kind: was ? 'warn' : 'ok' } })} /></td></>
              : <td colSpan="3" className="mut">not controlled from the portal</td>}</tr>) })}</tbody></table>
        <Msg m={msg.pol} /><p className="mut">Transaction figures come from the synthetic transaction window. Suspending a rail or lowering its limit takes effect for new customer transfers immediately.</p></section>

      <section className="p w" id="queue"><h2>Approval queue <span className="mut">maker-checker: the person who authorises cannot also release; ₹{N.format(Q.high_value_threshold)}+ needs a regional head</span></h2><Msg m={msg.q} />
        <table><thead><tr><th>Ref</th><th>Customer</th><th>Beneficiary</th><th className="n">Amount</th><th>Why held</th><th>State</th><th>Actions</th></tr></thead><tbody>
          {Q.payments.length ? Q.payments.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.data.customer_id}</td><td>{p.data.beneficiary}</td><td className="n">{money(p.data.amount_inr)}</td>
            <td>{p.data.high_value ? <span className="pill warn">high value</span> : <span className="pill warn">risk {p.data.frm_score}</span>}{p.data.new_beneficiary && <> <span className="pill">new payee</span></>}</td><td>{p.state.replace('_', ' ')}</td>
            <td><div className="row">{p.actions.length ? p.actions.map((a) => <button key={a} className={`btn sm ${a === 'reject' ? 'bad' : ''}`} onClick={() => wf(p, a)}>{a}</button>) : <span className="mut">none for your role</span>}</div></td></tr>) : <tr><td colSpan="7" className="mut">No held payments.</td></tr>}</tbody></table>
        <table style={{ marginTop: 12 }}><thead><tr><th>Ref</th><th>Customer</th><th>Type</th><th className="n">Amount</th><th className="n">EMI burden</th><th>System view</th><th>State</th><th>Actions</th></tr></thead><tbody>
          {Q.loans.length ? Q.loans.map((l) => <tr key={l.id}><td>{l.id}</td><td>{l.data.customer}</td><td>{l.data.loan_type}</td><td className="n">{money(l.data.amount)}</td><td className="n">{Math.round(l.data.foir * 100)}%</td><td><span className={`pill ${l.data.recommendation === 'APPROVE' ? 'ok' : 'warn'}`}>{l.data.recommendation}</span></td><td>{l.state}</td>
            <td><div className="row">{l.actions.length ? l.actions.map((a) => <button key={a} className={`btn sm ${a === 'reject' ? 'bad' : ''}`} onClick={() => wf(l, a)}>{a}</button>) : <span className="mut">none</span>}</div></td></tr>) : <tr><td colSpan="8" className="mut">No loan applications.</td></tr>}</tbody></table></section>

      <section className="p w" id="cust"><h2>Customers &amp; accounts <span className="mut">freeze needs a reason; only a regional head can lift a freeze</span></h2>
        <div className="row"><div style={{ width: 280 }}><input placeholder="Search customer name or ID (min 2 chars)" aria-label="Search customers" value={sq} onChange={(e) => setSq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (lastQ.current = sq, run('c', () => search(sq)))} /></div>
          <button className="btn" onClick={() => { lastQ.current = sq; run('c', () => search(sq)) }}>Search</button></div><Msg m={msg.c} />
        {SR.length ? <table style={{ marginTop: 10 }}><thead><tr><th>Customer</th><th>Segment · KYC · risk</th><th>Account</th><th className="n">Balance</th><th>Status</th><th>Control</th></tr></thead><tbody>
          {SR.flatMap((c) => c.accounts.map((a, i) => <tr key={a.id}>
            {i === 0 && <><td rowSpan={c.accounts.length}><b>{c.name}</b><br /><span className="mut">{c.id} · {c.city}</span></td>
              <td rowSpan={c.accounts.length}>{c.segment} · <span className={`pill ${c.kyc_level === 'full' ? 'ok' : 'warn'}`}>KYC {c.kyc_level}</span> · <span className={`pill ${c.risk_rating === 'high' ? 'bad' : c.risk_rating === 'medium' ? 'warn' : 'ok'}`}>{c.risk_rating}</span></td></>}
            <td>{a.masked}</td><td className="n">{money(a.balance)}</td><td>{a.bank_frozen ? <span className="pill bad">frozen</span> : a.status === 'dormant' ? <span className="pill warn">dormant</span> : <span className="pill ok">active</span>}</td>
            <td>{a.bank_frozen ? <button className="btn sec sm" disabled={!rh} title={rh ? '' : 'Regional head only'} onClick={() => freeze(a.id, false)}>Lift freeze</button> : <button className="btn bad sm" onClick={() => freeze(a.id, true)}>Freeze</button>}</td></tr>))}</tbody></table>
          : <p className="mut">Search to view customers and apply account controls.</p>}</section>

      <section className="p w" id="branches"><h2>Branch network <span className="mut">top 15 of {K.branches} by balances</span></h2>
        <table><thead><tr><th>Branch</th><th>State</th><th>Type</th><th className="n">Customers</th><th className="n">Accounts</th><th className="n">Dormant</th><th className="n">Balances</th><th style={{ width: '22%' }}>Share of top</th></tr></thead><tbody>
          {D.branches.map((b) => <tr key={b.id}><td>{b.name}<br /><span className="mut">{b.id}</span></td><td>{b.state}</td><td>{b.type}</td><td className="n">{N.format(b.customers)}</td><td className="n">{N.format(b.accounts)}</td><td className="n">{b.dormant}</td><td className="n">{m(b.balance)}</td><td><div className="bar"><i style={{ width: `${(100 * b.balance) / maxBal}%` }} /></div></td></tr>)}</tbody></table></section>

      <section className="p w" id="feed"><h2>Institution activity feed <span className="mut">every portal action is also written to the tamper-evident audit chain</span></h2>
        <table><thead><tr><th>Time</th><th>Customer</th><th>Event</th><th>Detail</th></tr></thead><tbody>
          {Q.events.length ? Q.events.slice(0, 25).map((e) => <tr key={e.id}><td className="mut">{e.ts.slice(0, 16).replace('T', ' ')}</td><td>{e.customer_id}</td><td><span className={`pill ${e.severity === 'warn' ? 'warn' : ''}`}>{e.type}</span></td><td className="mut">{evDetail(e)}</td></tr>) : <tr><td colSpan="4" className="mut">No activity yet.</td></tr>}</tbody></table></section>
    </main></div>)
}