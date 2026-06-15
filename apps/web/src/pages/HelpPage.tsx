import { useState, useMemo, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Step { text: string; tip?: string }
interface Topic {
  id: string; icon: string; title: string; summary: string;
  steps: Step[]; tips: string[]; demo?: string;
}

// ── Topic content ──────────────────────────────────────────────────────────────
const TOPICS: Topic[] = [
  {
    id: "getting-started",
    icon: "🚀",
    title: "Getting Started",
    summary: "Login, explore the dashboard, and understand navigation",
    demo: "login",
    steps: [
      { text: "Open the app and enter your email and password on the login screen." },
      { text: "If your admin has enabled 2FA, open Google Authenticator and enter the 6-digit code that appears after your password." },
      { text: "You land on the Home dashboard — it shows pending inbox items, recent requests, and quick actions." },
      { text: "The top navigation bar gives you access to everything: Home, New request, My requests, Inbox, Build, Insights, Manage, and Help." },
      { text: "Your avatar (top-right) shows your name and notification count. Click it to access Settings or Log out." },
    ],
    tips: [
      "Use the bell icon (top-right) to see all system notifications.",
      "Bookmark the app URL for quick access — no separate installation needed.",
      "If you forget your password, ask your company Admin to reset it.",
    ],
  },
  {
    id: "submit-request",
    icon: "📝",
    title: "Submit a Request",
    summary: "Raise a new approval request through any published workflow",
    demo: "submit",
    steps: [
      { text: "Click New request in the top navigation." },
      { text: "Choose a workflow from the list — e.g. 'Purchase Request' or 'Leave Approval'." },
      { text: "Fill in all required fields on the form. Fields marked * are mandatory." },
      { text: "Attach any supporting files by dragging them onto the upload zone or clicking Browse." },
      { text: "Review the Approval chain panel on the right to see who will approve your request and in what order." },
      { text: "Click Submit request. You will receive a reference number immediately." },
    ],
    tips: [
      "Your request reference number (e.g. REQ-0042) can be shared with approvers for tracking.",
      "You can track status anytime under My requests.",
      "Some workflows route differently based on the amount you enter — the approval chain preview updates live.",
    ],
  },
  {
    id: "my-requests",
    icon: "📋",
    title: "Track My Requests",
    summary: "View status, history, and details of your submitted requests",
    steps: [
      { text: "Click My requests in the top nav." },
      { text: "Each card shows the workflow name, reference number, current status badge, amount, and current stage." },
      { text: "Use the search bar and filters (Status, Date range, Amount) to narrow the list." },
      { text: "Click any card to open the full detail view — showing the form data, approver comments, and timeline." },
      { text: "Overdue requests are highlighted with an orange badge." },
    ],
    tips: [
      "Use saved filters to quickly return to a common view (e.g. 'Pending this week').",
      "The timeline in the detail view shows exactly who approved, rejected, or returned — and when.",
    ],
  },
  {
    id: "inbox",
    icon: "📥",
    title: "Approval Inbox",
    summary: "Review, approve, reject, or return requests assigned to you",
    demo: "inbox",
    steps: [
      { text: "Click Inbox in the top nav. The left panel lists all requests waiting for your action." },
      { text: "Click any item to open its detail panel on the right." },
      { text: "Read the form data, attached files, and any prior comments from earlier approvers." },
      { text: "Add a comment (optional) then click Approve, Reject, or Return to originator." },
      { text: "Use Bulk approve (checkbox + Bulk action button) to approve multiple low-risk items at once." },
      { text: "Use keyboard shortcuts: A to approve, R to reject, ↑/↓ to move between items." },
    ],
    tips: [
      "Returning a request sends it back to the originator for correction — they can resubmit.",
      "Quick-comment chips (pre-set phrases) save time for common responses.",
      "Save custom filter sets so you can quickly see 'High priority' or 'Finance dept' items.",
    ],
  },
  {
    id: "build-workflow",
    icon: "⚙️",
    title: "Build a Workflow",
    summary: "Design multi-step approval workflows with routing rules",
    demo: "build",
    steps: [
      { text: "Go to Build → Workflows and click New workflow." },
      { text: "Give your workflow a name (e.g. 'Vendor Payment Approval')." },
      { text: "Under Form fields, add the fields your requestors will fill in: text, number, dropdown, date, file, etc." },
      { text: "Under Approval steps, add each approver step. Assign by role (e.g. Finance Manager) or by a specific user." },
      { text: "Add routing rules to skip or redirect steps based on field values — e.g. skip CFO approval if amount < 50,000." },
      { text: "Set an SLA (hours) per step so overdue requests are flagged automatically." },
      { text: "Click Preview, then Simulate with sample data to verify the routing logic." },
      { text: "Click Publish to make the workflow available for submissions." },
    ],
    tips: [
      "You can Clone an existing workflow as a starting point instead of building from scratch.",
      "Workflows go through Draft → Preview → Simulate → Publish — you cannot skip simulate.",
      "Published workflows can be versioned — old requests keep their original version.",
    ],
  },
  {
    id: "ai-creator",
    icon: "✨",
    title: "AI Workflow Creator",
    summary: "Describe a process in plain English and let AI draft the workflow",
    demo: "ai",
    steps: [
      { text: "Go to Build → AI creator." },
      { text: "Type a plain-English description of the process, e.g: 'Purchase request with manager and CFO approval for amounts over 100,000; fields: vendor, amount, purpose, department'." },
      { text: "Click Generate. The AI will produce a draft workflow with form fields, steps, and routing rules." },
      { text: "Review the draft — edit field names, step assignees, or routing thresholds as needed." },
      { text: "Click Use this workflow to save it as a draft, then follow the normal Preview → Simulate → Publish flow." },
    ],
    tips: [
      "The more specific your description, the better the AI draft. Include field names, approver roles, and amount thresholds.",
      "You can also use the Wizard mode — the AI asks you clarifying questions one by one.",
      "AI drafts are just starting points — always review and simulate before publishing.",
    ],
  },
  {
    id: "analytics",
    icon: "📊",
    title: "Analytics & Reports",
    summary: "View volume, approval times, bottlenecks, and export reports",
    steps: [
      { text: "Go to Insights → Analytics for charts: request volume by day/week, approval rates, SLA breach rate, and bottleneck stages." },
      { text: "Go to Insights → Reports to generate tabular reports — filter by date range, workflow, status, or department." },
      { text: "Click Export to download the report as CSV, XLSX, or PDF." },
      { text: "Share the export link or file with stakeholders who don't have app access." },
    ],
    tips: [
      "The bottleneck chart shows which approval step causes the longest average delay — use it to reassign workloads.",
      "PDF exports include a header with your company name and report date — ready for board packs.",
    ],
  },
  {
    id: "two-fa",
    icon: "🔐",
    title: "Two-Factor Authentication (2FA)",
    summary: "Secure your account with Google Authenticator",
    demo: "twofa",
    steps: [
      { text: "Install Google Authenticator on your phone (iOS or Android)." },
      { text: "In WizFlow, go to Manage → Settings and scroll to the Two-Factor Authentication section." },
      { text: "Click Set up 2FA. A QR code appears." },
      { text: "Open Google Authenticator → tap the + icon → Scan QR code — point your camera at the QR code." },
      { text: "Enter the 6-digit code shown in the app into the Verify code field and click Enable 2FA." },
      { text: "Next time you log in, after your password you will be prompted for the 6-digit code." },
    ],
    tips: [
      "The code refreshes every 30 seconds — enter it quickly.",
      "If you lose your phone, contact your Admin to disable 2FA on your account.",
      "2FA can only be disabled by entering a valid current code — keep your phone accessible.",
    ],
  },
  {
    id: "integrations",
    icon: "🔗",
    title: "Webhooks & Integrations",
    summary: "Send real-time event notifications to external systems",
    steps: [
      { text: "Go to Manage → Integrations." },
      { text: "Click Add webhook. Enter a name, the target URL (your system's endpoint), and select which events to send: request submitted, approved, rejected, etc." },
      { text: "Click Save. The webhook will fire whenever a matching event occurs." },
      { text: "Click Send test on any webhook row to fire a sample payload and verify your endpoint receives it." },
      { text: "The delivery result (HTTP status + response preview) is shown inline so you can debug immediately." },
    ],
    tips: [
      "Webhook payloads are JSON. Use tools like Pipedream, Make, or Zapier to receive them and trigger further automation.",
      "Private/internal IP addresses are blocked for security — use a publicly reachable URL.",
      "Failed deliveries are not automatically retried — monitor your endpoint and re-test if needed.",
    ],
  },
  {
    id: "master-data",
    icon: "🗂️",
    title: "Master Data",
    summary: "Manage reusable dropdown lists: departments, branches, vendors, and more",
    steps: [
      { text: "Go to Manage → Master data." },
      { text: "Select a category from the dropdown: department, branch, cost_center, vendor, currency, or priority." },
      { text: "To add an entry: fill in the Code (short identifier, e.g. FIN-01) and Label (display name, e.g. Finance), then click Add entry." },
      { text: "Entries appear in the table below. Toggle Active/Inactive to hide stale values without deleting them." },
      { text: "These values automatically appear as dropdown options in workflow form fields that reference the category." },
    ],
    tips: [
      "Use consistent code formats within a category (e.g. VND-001, VND-002) for easy sorting.",
      "Inactive entries are hidden from new forms but preserved in existing request records.",
    ],
  },
  {
    id: "admin",
    icon: "👤",
    title: "Admin: Users & Company",
    summary: "Invite users, assign roles, and configure company settings",
    steps: [
      { text: "Go to Manage → Admin (visible to Company Admin role only)." },
      { text: "Under Users, click Invite user — enter their email and assign a role: Company Admin, Manager, or Staff." },
      { text: "The invited user receives an email with a login link and temporary password." },
      { text: "To deactivate a user (e.g. when they leave), click their row and toggle Active off — they cannot log in but their history is preserved." },
      { text: "Under Company settings, upload your company logo and set a display name — these appear in the app header and email notifications." },
    ],
    tips: [
      "Company Admin can do everything. Manager can approve and build workflows. Staff can only submit requests.",
      "There must always be at least one active Admin — you cannot deactivate yourself.",
    ],
  },
  {
    id: "shortcuts",
    icon: "⌨️",
    title: "Keyboard Shortcuts",
    summary: "Speed up approvals and navigation with keyboard shortcuts",
    steps: [
      { text: "In the Approval Inbox, press A to approve the currently selected request." },
      { text: "Press R to reject the selected request." },
      { text: "Press ↑ / ↓ arrow keys to move between inbox items without using the mouse." },
      { text: "Press Escape to close any open dropdown or modal." },
    ],
    tips: [
      "Shortcuts only work when no input field is focused.",
      "Bulk-approve: tick multiple checkboxes, then use the Bulk action button.",
    ],
  },
];

// ── Animated demos ─────────────────────────────────────────────────────────────

function DemoLogin() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body">
        <div className="help-demo-card">
          <div className="help-demo-logo">WizFlow</div>
          <div className="help-demo-field help-type-1">admin@company.com</div>
          <div className="help-demo-field help-type-2">••••••••</div>
          <div className="help-demo-btn help-btn-pulse">Sign in</div>
          <div className="help-demo-success">✓ Welcome back!</div>
        </div>
      </div>
    </div>
  );
}

function DemoSubmit() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body help-demo-2col">
        <div className="help-demo-form">
          <div className="help-demo-label">Vendor</div>
          <div className="help-demo-field help-type-3">Safaricom PLC</div>
          <div className="help-demo-label">Amount (KES)</div>
          <div className="help-demo-field help-type-4">125,000</div>
          <div className="help-demo-label">Department</div>
          <div className="help-demo-field help-type-5">IT</div>
          <div className="help-demo-btn help-btn-pulse2 mt-2">Submit request</div>
        </div>
        <div className="help-demo-chain">
          <div className="help-demo-chain-title">Approval chain</div>
          <div className="help-demo-chain-step active">① Manager</div>
          <div className="help-demo-chain-step">② CFO</div>
          <div className="help-demo-chain-ref">REQ-0042</div>
        </div>
      </div>
    </div>
  );
}

function DemoInbox() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body help-demo-2col">
        <div className="help-demo-inbox-list">
          <div className="help-demo-inbox-item selected">
            <span className="help-dot" />
            <div>
              <div className="help-demo-inbox-title">Purchase – REQ-0042</div>
              <div className="help-demo-inbox-sub">Vendor: Safaricom · KES 125k</div>
            </div>
          </div>
          <div className="help-demo-inbox-item">
            <span className="help-dot" />
            <div>
              <div className="help-demo-inbox-title">Leave – REQ-0041</div>
              <div className="help-demo-inbox-sub">3 days · HR Dept</div>
            </div>
          </div>
        </div>
        <div className="help-demo-inbox-detail">
          <div className="help-demo-inbox-hdr">Purchase Request</div>
          <div className="help-demo-inbox-row"><b>Amount:</b> KES 125,000</div>
          <div className="help-demo-inbox-row"><b>Vendor:</b> Safaricom PLC</div>
          <div className="help-demo-inbox-actions">
            <div className="help-demo-btn-approve help-btn-pulse3">✓ Approve</div>
            <div className="help-demo-btn-reject">✕ Reject</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoBuild() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body">
        <div className="help-demo-builder">
          <div className="help-demo-wf-title">Vendor Payment Approval</div>
          <div className="help-demo-steps">
            <div className="help-demo-step-node help-node-pulse">
              <span>📝</span> Form
            </div>
            <div className="help-demo-step-arrow">→</div>
            <div className="help-demo-step-node help-node-pulse2">
              <span>👤</span> Manager
            </div>
            <div className="help-demo-step-arrow">→</div>
            <div className="help-demo-step-node help-node-pulse3">
              <span>💼</span> CFO
            </div>
            <div className="help-demo-step-arrow">→</div>
            <div className="help-demo-step-node help-node-done">
              <span>✓</span> Done
            </div>
          </div>
          <div className="help-demo-routing">
            <span className="help-demo-routing-tag">if amount &lt; 50k → skip CFO</span>
          </div>
          <div className="help-demo-btn help-btn-pulse4 mt-2">Publish workflow</div>
        </div>
      </div>
    </div>
  );
}

function DemoAI() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body">
        <div className="help-demo-ai">
          <div className="help-demo-ai-prompt help-type-ai">
            Purchase request with manager and CFO approval for amounts over 100,000...
          </div>
          <div className="help-demo-ai-thinking">
            <span className="help-ai-dot" /><span className="help-ai-dot" /><span className="help-ai-dot" />
          </div>
          <div className="help-demo-ai-result">
            <div className="help-demo-ai-chip">📋 3 form fields</div>
            <div className="help-demo-ai-chip">👤 2 approval steps</div>
            <div className="help-demo-ai-chip">🔀 1 routing rule</div>
          </div>
          <div className="help-demo-btn help-btn-pulse5">Use this workflow</div>
        </div>
      </div>
    </div>
  );
}

function Demo2FA() {
  return (
    <div className="help-demo-wrap">
      <div className="help-demo-bar"><span /><span /><span /></div>
      <div className="help-demo-body">
        <div className="help-demo-card">
          <div className="help-demo-qr">
            <div className="help-demo-qr-inner">
              {[...Array(16)].map((_, i) => (
                <div key={i} className="help-demo-qr-cell" style={{ background: Math.random() > 0.5 ? "#534AB7" : "transparent" }} />
              ))}
            </div>
            <div className="help-demo-qr-label">Scan with Google Authenticator</div>
          </div>
          <div className="help-demo-otp-row">
            {["5","3","4","1","2","8"].map((d, i) => (
              <div key={i} className="help-demo-otp-digit help-otp-appear" style={{ animationDelay: `${i * 0.15 + 1}s` }}>{d}</div>
            ))}
          </div>
          <div className="help-demo-btn help-btn-pulse6">Enable 2FA</div>
        </div>
      </div>
    </div>
  );
}

function Demo({ id }: { id?: string }) {
  if (id === "login")  return <DemoLogin />;
  if (id === "submit") return <DemoSubmit />;
  if (id === "inbox")  return <DemoInbox />;
  if (id === "build")  return <DemoBuild />;
  if (id === "ai")     return <DemoAI />;
  if (id === "twofa")  return <Demo2FA />;
  return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("getting-started");

  const filtered = useMemo(() =>
    TOPICS.filter(t =>
      query.length < 2 ||
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.summary.toLowerCase().includes(query.toLowerCase()) ||
      t.steps.some(s => s.text.toLowerCase().includes(query.toLowerCase()))
    ), [query]);

  const active = TOPICS.find(t => t.id === activeId) ?? TOPICS[0];

  // Auto-select first result when searching
  useEffect(() => {
    if (filtered.length > 0 && !filtered.find(t => t.id === activeId)) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  return (
    <div className="help-page">
      {/* Header */}
      <div className="help-header">
        <div>
          <h1 className="help-title">Help Centre</h1>
          <p className="help-subtitle">Step-by-step guides for every feature in WizFlow</p>
        </div>
        <div className="help-search-wrap">
          <span className="help-search-icon">🔍</span>
          <input
            className="help-search"
            placeholder="Search topics…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="help-search-clear" onClick={() => setQuery("")}>✕</button>
          )}
        </div>
      </div>

      <div className="help-body">
        {/* Sidebar */}
        <nav className="help-nav">
          {filtered.length === 0 ? (
            <p className="help-no-results">No topics match "{query}"</p>
          ) : (
            filtered.map(t => (
              <button
                key={t.id}
                className={`help-nav-item${t.id === active.id ? " active" : ""}`}
                onClick={() => setActiveId(t.id)}
              >
                <span className="help-nav-icon">{t.icon}</span>
                <span className="help-nav-label">{t.title}</span>
              </button>
            ))
          )}
        </nav>

        {/* Content */}
        <article className="help-content">
          <div className="help-topic-header">
            <span className="help-topic-icon">{active.icon}</span>
            <div>
              <h2 className="help-topic-title">{active.title}</h2>
              <p className="help-topic-summary">{active.summary}</p>
            </div>
          </div>

          <div className={`help-layout${active.demo ? " with-demo" : ""}`}>
            {/* Steps */}
            <div>
              <h3 className="help-section-head">Step-by-step</h3>
              <ol className="help-steps">
                {active.steps.map((s, i) => (
                  <li key={i} className="help-step">
                    <span className="help-step-num">{i + 1}</span>
                    <div>
                      <p className="help-step-text">{s.text}</p>
                      {s.tip && <p className="help-step-tip">💡 {s.tip}</p>}
                    </div>
                  </li>
                ))}
              </ol>

              {active.tips.length > 0 && (
                <>
                  <h3 className="help-section-head mt-6">Tips</h3>
                  <ul className="help-tips">
                    {active.tips.map((tip, i) => (
                      <li key={i} className="help-tip-item">
                        <span className="help-tip-dot" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Demo */}
            {active.demo && (
              <div>
                <h3 className="help-section-head">Live demo</h3>
                <Demo id={active.demo} />
                <p className="help-demo-caption">Animated walkthrough — loops automatically</p>
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Footer quick-links */}
      <div className="help-footer">
        <p className="help-footer-label">Jump to a topic</p>
        <div className="help-quick-links">
          {TOPICS.map(t => (
            <button
              key={t.id}
              className={`help-quick-chip${t.id === active.id ? " active" : ""}`}
              onClick={() => setActiveId(t.id)}
            >
              {t.icon} {t.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
