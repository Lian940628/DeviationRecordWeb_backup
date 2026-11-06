import "./_group.css";
import "./CertificationRing.css";

export function CertificationRing() {
  return (
    <main className="stamp-preview stamp-preview--ring">
      <div className="ring-stage" role="status" aria-label="Certification">
        <div className="ring-stage__scanlines" aria-hidden="true" />
        <div className="cert-ring">
          <svg className="cert-ring__engraving" viewBox="0 0 600 600" aria-hidden="true">
            <defs>
              <path id="certification-top-arc" d="M 82 300 A 218 218 0 0 1 518 300" />
              <path id="certification-bottom-arc" d="M 82 300 A 218 218 0 0 0 518 300" />
            </defs>
            <circle className="cert-ring__track cert-ring__track--outer" cx="300" cy="300" r="258" />
            <circle className="cert-ring__track cert-ring__track--bright" cx="300" cy="300" r="235" />
            <circle className="cert-ring__track cert-ring__track--inner" cx="300" cy="300" r="180" />
            <circle className="cert-ring__ticks" cx="300" cy="300" r="218" />
            <text className="cert-ring__curve">
              <textPath href="#certification-top-arc" startOffset="50%" textAnchor="middle">CERTIFICATION</textPath>
            </text>
            <text className="cert-ring__curve cert-ring__curve--lower">
              <textPath href="#certification-bottom-arc" startOffset="50%" textAnchor="middle">C E R T I F I C A T I O N</textPath>
            </text>
            <path className="cert-ring__axis" d="M300 0v95 M300 505v95 M0 300h73 M527 300h73" />
            <path className="cert-ring__calibration" d="M300 89v28 M300 483v28 M89 300h28 M483 300h28" />
          </svg>
          <span className="cert-ring__cross cert-ring__cross--left" aria-hidden="true">+</span>
          <span className="cert-ring__cross cert-ring__cross--right" aria-hidden="true">+</span>
          <div className="cert-ring__banner">
            <span>CERTIFICATION</span>
          </div>
          <div className="cert-ring__barcode" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
          </div>
          <div className="cert-ring__spark cert-ring__spark--one" aria-hidden="true" />
          <div className="cert-ring__spark cert-ring__spark--two" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
