/**
 * Learning Resources — in-app home for guides + video chapters.
 * Embeds the self-contained /learn site (served from the same origin: public/learn
 * in dev, Caddy on the VPS in prod). One source serves web and the mobile WebView;
 * videos stream from the server, nothing is bundled into the app.
 */
export function LearningResourcesPage() {
  return (
    <div>
      <div className="wf-page-header">
        <div>
          <h1 className="wf-page-title">Learning Resources</h1>
          <p className="wf-page-subtitle">
            Guides and short video chapters to help you get the most out of WizFlow.
          </p>
        </div>
        <div className="wf-page-header-actions">
          <a href="/learn/index.html" target="_blank" rel="noreferrer" className="wf-btn-secondary text-sm">
            Open in a new tab ↗
          </a>
        </div>
      </div>
      <div
        className="wf-card"
        style={{ overflow: "hidden", padding: 0, height: "calc(100vh - 200px)", minHeight: 520 }}
      >
        <iframe
          src="/learn/index.html"
          title="WizFlow Learning Resources"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>
    </div>
  );
}
