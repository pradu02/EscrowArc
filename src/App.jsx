import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, isAddress, parseUnits } from 'ethers'
import {
  ARC_TESTNET,
  ESCROW_ABI,
  ESCROW_CONTRACT_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from './contractConfig'

const statuses = ['Unknown', 'Funded', 'Accepted', 'Released', 'Refunded']
const configured = isAddress(ESCROW_CONTRACT_ADDRESS)
const shortAddress = (address) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '')
const sameAddress = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

// A dedicated read-only connection straight to the Arc RPC, used for every plain
// "view" call (getEscrow). Reads don't need a wallet at all, and going through
// this instead of the injected wallet avoids provider-relay quirks entirely.
const readOnlyProvider = configured ? new JsonRpcProvider(ARC_TESTNET.rpcUrls[0]) : null

const normalizeEscrow = (id, raw) => ({
  id: String(id),
  client: raw.client,
  freelancer: raw.freelancer,
  amount: formatUnits(raw.amount, USDC_DECIMALS),
  status: Number(raw.status),
  description: raw.description,
})

// Escrow IDs are assigned sequentially starting at 1 (see contracts/EscrowArc.sol),
// and getEscrow() reverts for any ID that doesn't exist yet. That lets us find the
// current total with a binary search over plain read calls -- no eth_getLogs / event
// scanning needed, so it works on any RPC regardless of what block-range or log
// features it supports.
async function findEscrowCount(contract) {
  const exists = async (id) => {
    try { await contract.getEscrow(id); return true } catch { return false }
  }
  if (!(await exists(1))) return 0
  let lo = 1
  let hi = 2
  while (await exists(hi)) { lo = hi; hi *= 2 }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    // eslint-disable-next-line no-await-in-loop
    if (await exists(mid)) lo = mid; else hi = mid
  }
  return lo
}

// The same 3-stage tracker is used twice: once illustratively in the hero,
// and once bound to a real escrow's on-chain status in the check panel.
function Tracker({ status, illustrative }) {
  const outcomeLabel = status === 4 ? 'Refunded' : status === 3 ? 'Released' : 'Released / Refunded'
  const labels = ['Created', 'Accepted', outcomeLabel]
  const stepIndex = illustrative ? 0 : status >= 3 ? 2 : status === 2 ? 1 : 0

  return (
    <div className="tracker">
      {labels.map((label, i) => {
        const done = !illustrative && i < stepIndex
        const current = illustrative ? i === 0 : i === stepIndex
        const outcome = i === 2 && status === 3 ? 'state-released' : i === 2 && status === 4 ? 'state-refunded' : ''
        return (
          <div key={label} className={['tracker-step', done && 'done', current && 'current', outcome].filter(Boolean).join(' ')}>
            <span className="tdot" />
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [account, setAccount] = useState('')
  const [provider, setProvider] = useState(null)
  const [freelancer, setFreelancer] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [escrowId, setEscrowId] = useState('')
  const [escrow, setEscrow] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allEscrows, setAllEscrows] = useState([])
  const [totalEscrows, setTotalEscrows] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [copied, setCopied] = useState(false)

  // Loads every escrow in the vault (id 1..N). This powers the "All escrows"
  // transparency list; the "as client" / "as freelancer" lists below are just
  // this same array filtered client-side, so there's only one data source.
  const loadAllEscrows = useCallback(async () => {
    if (!configured) return
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const contract = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, readOnlyProvider)
      const count = await findEscrowCount(contract)
      const ids = Array.from({ length: count }, (_, i) => i + 1)
      const details = await Promise.all(ids.map((id) => contract.getEscrow(id)))
      const list = details.map((raw, i) => normalizeEscrow(ids[i], raw)).reverse() // newest first
      setTotalEscrows(count)
      setAllEscrows(list)
    } catch (dashboardErr) {
      setDashboardError(dashboardErr.shortMessage || dashboardErr.message || 'Could not load escrows from the vault.')
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  useEffect(() => { loadAllEscrows() }, [loadAllEscrows])

  const myClientEscrows = useMemo(
    () => (account ? allEscrows.filter((item) => sameAddress(item.client, account)) : []),
    [allEscrows, account]
  )
  const myFreelancerEscrows = useMemo(
    () => (account ? allEscrows.filter((item) => sameAddress(item.freelancer, account)) : []),
    [allEscrows, account]
  )

  const loadEscrow = useCallback(async (id = escrowId) => {
    setError('')
    if (!configured) return setError('Deploy EscrowArc first, then add its address in src/contractConfig.js.')
    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) return setError('Enter a valid escrow ID.')
    try {
      const contract = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, readOnlyProvider)
      const result = await contract.getEscrow(BigInt(id))
      setEscrow(normalizeEscrow(id, result))
      setMessage(`Escrow #${id} loaded.`)
    } catch (loadError) {
      setEscrow(null)
      setError(loadError.shortMessage || 'Escrow was not found.')
    }
  }, [escrowId])

  const selectEscrow = (id) => {
    setEscrowId(id)
    loadEscrow(id)
    document.getElementById('check-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  useEffect(() => {
    if (!window.ethereum) return
    const handleAccountsChanged = (accounts) => setAccount(accounts[0] || '')
    window.ethereum.on('accountsChanged', handleAccountsChanged)
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
  }, [])

  const ensureArcNetwork = async () => {
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_TESTNET.chainId }] })
    } catch (switchError) {
      if (switchError.code !== 4902) throw switchError
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [ARC_TESTNET] })
    }
  }

  const connectWallet = async () => {
    setError('')
    if (!window.ethereum) return setError('MetaMask was not found. Install the extension and try again.')
    try {
      const nextProvider = new BrowserProvider(window.ethereum)
      await ensureArcNetwork()
      const accounts = await nextProvider.send('eth_requestAccounts', [])
      setProvider(nextProvider)
      setAccount(accounts[0])
      setMessage('Wallet connected to Arc Testnet.')
    } catch (connectError) {
      setError(connectError.shortMessage || connectError.message || 'Could not connect wallet.')
    }
  }

  const copyAddress = async () => {
    if (!account) return
    try {
      await navigator.clipboard.writeText(account)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy the address.')
    }
  }

  const disconnectWallet = async () => {
    try {
      // EIP-2255: lets the app drop its own permission grant so MetaMask
      // will prompt for account selection again next time (not all wallets support this).
      await window.ethereum?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      // Not supported by this wallet -- fall through to just clearing local state.
    }
    setAccount('')
    setProvider(null)
    setEscrow(null)
    setMessage('Wallet disconnected.')
  }

  const createEscrow = async () => {
    setError('')
    if (!configured) return setError('Deploy EscrowArc first, then add its address in src/contractConfig.js.')
    if (!account || !provider) return setError('Connect your wallet first.')
    if (!isAddress(freelancer) || freelancer.toLowerCase() === account.toLowerCase()) return setError('Enter another valid freelancer wallet address.')
    if (!amount || Number(amount) <= 0) return setError('Enter a valid vUSDC amount.')
    if (description.length > 280) return setError('Keep the milestone description under 280 characters.')
    try {
      setBusy(true)
      const signer = await provider.getSigner()
      const escrowContract = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer)
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer)
      const units = parseUnits(amount, USDC_DECIMALS)
      setMessage('Approve vUSDC in your wallet…')
      await (await usdc.approve(ESCROW_CONTRACT_ADDRESS, units)).wait()
      setMessage('Creating and funding escrow…')
      const receipt = await (await escrowContract.createEscrow(freelancer, units, description)).wait()
      const createdLog = receipt.logs.map((log) => { try { return escrowContract.interface.parseLog(log) } catch { return null } }).find((log) => log?.name === 'EscrowCreated')
      const id = createdLog?.args?.escrowId?.toString()
      setEscrowId(id || '')
      setFreelancer(''); setAmount(''); setDescription('')
      setMessage(id ? `Escrow #${id} funded successfully.` : 'Escrow funded successfully.')
      if (id) await loadEscrow(id)
      loadAllEscrows()
    } catch (createError) {
      setError(createError.shortMessage || createError.message || 'Could not create escrow.')
    } finally { setBusy(false) }
  }

  const runAction = async (action, successMessage) => {
    setError('')
    if (!account || !provider || !escrow) return setError('Connect a wallet and load an escrow first.')
    try {
      setBusy(true)
      const contract = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, await provider.getSigner())
      setMessage('Confirm the transaction in your wallet…')
      await (await contract[action](BigInt(escrow.id))).wait()
      setMessage(successMessage)
      await loadEscrow(escrow.id)
      loadAllEscrows()
    } catch (actionError) {
      setError(actionError.shortMessage || actionError.message || 'Transaction failed.')
    } finally { setBusy(false) }
  }

  const isClient = escrow && account && sameAddress(escrow.client, account)
  const isFreelancer = escrow && account && sameAddress(escrow.freelancer, account)

  return (
    <main>
      <nav>
        <div className="brand">
          <span className="brand-mark">◇</span>
          EscrowArc
        </div>
        <div className="nav-right">
          <span className="network-pill"><span className="dot" /> Arc Testnet</span>
          {account ? (
            <div className="wallet-chip">
              <span className="wallet-address">{shortAddress(account)}</span>
              <button className="icon-btn" title="Copy address" onClick={copyAddress}>{copied ? '✓' : '⧉'}</button>
              <a className="icon-btn" title="View on Arcscan" href={`${ARC_TESTNET.blockExplorerUrls[0]}/address/${account}`} target="_blank" rel="noreferrer">↗</a>
              <button className="icon-btn disconnect-btn" title="Disconnect wallet" onClick={disconnectWallet}>⏻</button>
            </div>
          ) : (
            <button className="connect" onClick={connectWallet}>Connect wallet</button>
          )}
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">ARC TESTNET · ESCROW PROTOCOL</p>
        <h1>Funds don't move <i>until you say release.</i></h1>
        <p className="lede">EscrowArc holds vUSDC in a smart contract between a client and a freelancer on Arc Testnet — so neither side has to trust the other first.</p>

        <div className="flow">
          <div className="flow-node"><div className="flow-badge">C</div><span>Client</span></div>
          <div className="flow-line" />
          <div className="flow-node vault-label">
            <div className="flow-badge vault">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="11" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 11V7.5C8 5 9.8 3 12 3C14.2 3 16 5 16 7.5V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="15.6" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span>Escrow Vault</span>
          </div>
          <div className="flow-line" />
          <div className="flow-node"><div className="flow-badge">F</div><span>Freelancer</span></div>
        </div>
        <Tracker illustrative />
      </section>

      <section className="how">
        <div className="how-head">
          <p className="section-eyebrow">THE FLOW</p>
          <h2>How the vault works</h2>
          <p>Three steps, all enforced on-chain — no one can skip ahead.</p>
        </div>
        <div className="how-steps">
          <div className="how-step">
            <span className="num">01</span>
            <h3>Client funds the vault</h3>
            <p>The client locks the agreed vUSDC amount in the EscrowArc contract. It leaves their wallet immediately, but doesn't reach the freelancer yet.</p>
          </div>
          <div className="how-step">
            <span className="num">02</span>
            <h3>Freelancer accepts</h3>
            <p>The freelancer confirms they're taking the job. Both sides are now locked in on-chain, and work can begin.</p>
          </div>
          <div className="how-step">
            <span className="num">03</span>
            <h3>Client releases or refunds</h3>
            <p>Once the work is delivered, the client releases payment and the freelancer is paid instantly. If work never happens, the client can refund instead.</p>
          </div>
        </div>
        <p className="how-note">The contract can't judge whether the work is good — that decision stays with the client in this version.</p>
      </section>

      {!configured && <p className="notice">Deployment required: deploy <code>contracts/EscrowArc.sol</code>, then paste its address into <code>src/contractConfig.js</code>.</p>}

      <section className="app-section">
        <div className="how-head">
          <p className="section-eyebrow">TRY IT</p>
          <h2>Create or check an escrow</h2>
        </div>
        <section className="grid">
          <article>
            <p className="card-kicker">CLIENT</p>
            <h2>Create an escrow</h2>
            <label>Freelancer wallet<input value={freelancer} onChange={(event) => setFreelancer(event.target.value.trim())} placeholder="0x…" disabled={busy} /></label>
            <label>Milestone amount (vUSDC)<input type="number" min="0" step="0.000001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100" disabled={busy} /></label>
            <label>Milestone description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Landing page design delivery" maxLength="280" disabled={busy} /></label>
            <button className="primary" onClick={createEscrow} disabled={busy || !configured}>{busy ? 'Working…' : 'Approve & fund escrow'}</button>
            <small>Two wallet confirmations: approve, then fund escrow.</small>
          </article>

          <article id="check-panel">
            <p className="card-kicker">PARTICIPANTS</p>
            <h2>Check an escrow</h2>
            <label>Escrow ID<input value={escrowId} onChange={(event) => setEscrowId(event.target.value)} placeholder="1" disabled={busy} /></label>
            <button onClick={() => loadEscrow()} disabled={busy || !configured}>Load escrow</button>
            {escrow ? (
              <div className="escrow">
                <div className={`status status-${escrow.status}`}>{statuses[escrow.status]}</div>
                <p className="amount">{Number(escrow.amount).toFixed(4)} <small>vUSDC</small></p>
                <p>{escrow.description || 'No description provided.'}</p>
                <dl>
                  <div><dt>Client</dt><dd>{shortAddress(escrow.client)}</dd></div>
                  <div><dt>Freelancer</dt><dd>{shortAddress(escrow.freelancer)}</dd></div>
                </dl>
                <Tracker status={escrow.status} />
                {escrow.status === 1 && isFreelancer && <button className="primary" onClick={() => runAction('acceptEscrow', 'Escrow accepted.')}>Accept milestone</button>}
                {(escrow.status === 1 || escrow.status === 2) && isClient && <button className="danger" onClick={() => runAction('refundEscrow', 'vUSDC refunded to your wallet.')}>Refund escrow</button>}
                {escrow.status === 2 && isClient && <button className="primary" onClick={() => runAction('releasePayment', 'Payment released to the freelancer.')}>Release payment</button>}
              </div>
            ) : <p className="empty">Load an ID to view its status and available actions.</p>}
          </article>
        </section>
      </section>

      <section className="app-section">
        <div className="dash-head">
          <div className="how-head">
            <p className="section-eyebrow">DASHBOARD</p>
            <h2>Escrow vault dashboard</h2>
            <p>Every escrow in the vault, read directly from the contract — plus your own view as client and freelancer.</p>
          </div>
          <button onClick={loadAllEscrows} disabled={dashboardLoading || !configured}>{dashboardLoading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        <div className="stats-row">
          <div className="stat"><span className="stat-value">{totalEscrows ?? '—'}</span><span className="stat-label">Total escrows in this vault</span></div>
          <div className="stat"><span className="stat-value">{myClientEscrows.length}</span><span className="stat-label">You created</span></div>
          <div className="stat"><span className="stat-value">{myFreelancerEscrows.length}</span><span className="stat-label">Assigned to you</span></div>
        </div>

        {dashboardError && <p className="message error">{dashboardError}</p>}

        {!account && <p className="empty">Connect your wallet above to split the list below by your client / freelancer role. The full vault list is visible either way.</p>}

        {account && (
          <div className="dash-grid">
            <div className="dash-col">
              <p className="card-kicker">AS CLIENT</p>
              {dashboardLoading && <p className="empty">Loading…</p>}
              {!dashboardLoading && myClientEscrows.length === 0 && <p className="empty">You haven't created any escrows yet.</p>}
              {myClientEscrows.map((item) => (
                <button key={item.id} className="dash-row" onClick={() => selectEscrow(item.id)}>
                  <span className="dash-row-id">#{item.id}</span>
                  <span className="dash-row-desc">{item.description || 'No description'}</span>
                  <span className={`status status-${item.status}`}>{statuses[item.status]}</span>
                </button>
              ))}
            </div>
            <div className="dash-col">
              <p className="card-kicker">AS FREELANCER</p>
              {dashboardLoading && <p className="empty">Loading…</p>}
              {!dashboardLoading && myFreelancerEscrows.length === 0 && <p className="empty">No jobs have been assigned to you yet.</p>}
              {myFreelancerEscrows.map((item) => (
                <button key={item.id} className="dash-row" onClick={() => selectEscrow(item.id)}>
                  <span className="dash-row-id">#{item.id}</span>
                  <span className="dash-row-desc">{item.description || 'No description'}</span>
                  <span className={`status status-${item.status}`}>{statuses[item.status]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="dash-col dash-col-wide">
          <p className="card-kicker">ALL ESCROWS IN THIS VAULT</p>
          {dashboardLoading && <p className="empty">Loading…</p>}
          {!dashboardLoading && allEscrows.length === 0 && <p className="empty">No escrows have been created yet — be the first.</p>}
          {allEscrows.map((item) => (
            <button key={item.id} className="dash-row dash-row-wide" onClick={() => selectEscrow(item.id)}>
              <span className="dash-row-id">#{item.id}</span>
              <span className="dash-row-desc">{item.description || 'No description'}</span>
              <span className="dash-row-addr">C {shortAddress(item.client)}</span>
              <span className="dash-row-addr">F {shortAddress(item.freelancer)}</span>
              <span className="dash-row-amount">{Number(item.amount).toFixed(2)} vUSDC</span>
              <span className={`status status-${item.status}`}>{statuses[item.status]}</span>
            </button>
          ))}
        </div>
      </section>

      {(message || error) && <p className={error ? 'message error' : 'message'}>{error || message}</p>}
      <footer>Test vUSDC only · No dispute system in this first prototype · <a href="https://docs.arc.io/" target="_blank" rel="noreferrer">Arc Docs</a></footer>
    </main>
  )
}
