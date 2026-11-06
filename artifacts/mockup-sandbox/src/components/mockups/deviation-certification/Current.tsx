import "./_group.css";
import "./Current.css";

export function Current() {
  return (
    <main className="stamp-preview stamp-preview--current">
      <div className="di-certification-overlay is-active" role="status" aria-label="Temporary identity certified">
        <div className="di-certification-overlay__field">
          <span className="di-certification-overlay__coordinates">ES / IDENTITY SYSTEM · 02—03</span>
          <div className="di-certification-seal">
            <span className="di-certification-seal__orbit di-certification-seal__orbit--outer" />
            <span className="di-certification-seal__orbit di-certification-seal__orbit--inner" />
            <span className="di-certification-seal__crosshair di-certification-seal__crosshair--horizontal" />
            <span className="di-certification-seal__crosshair di-certification-seal__crosshair--vertical" />
            <span className="di-certification-seal__core">
              <small>TEMPORARY</small>
              <strong>IDENTITY</strong>
              <i />
              <b>CERTIFIED</b>
            </span>
          </div>
          <span className="di-certification-overlay__caption">Temporary identity certified</span>
        </div>
      </div>
    </main>
  );
}
