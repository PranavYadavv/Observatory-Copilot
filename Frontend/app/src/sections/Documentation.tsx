export default function Documentation() {
  return (
    <section
      id="documentation"
      style={{
        background: '#030508',
        padding: '120px 24px',
      }}
    >
      <div
        className="mx-auto flex flex-col-reverse lg:flex-row items-center gap-12 lg:gap-16"
        style={{ maxWidth: 1200 }}
      >
        {/* Left Column - Image */}
        <div className="w-full lg:w-6/12 reveal-left">
          <img
            src="/images/img-code-editor.jpg"
            alt="Code editor showing telemetry system configuration with syntax highlighting"
            className="w-full"
            style={{
              border: '1px solid rgba(124, 111, 100, 0.2)',
              borderRadius: 8,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
            }}
            loading="lazy"
          />
        </div>

        {/* Right Column - Text */}
        <div className="w-full lg:w-5/12 reveal-right reveal-delay-2">
          <p className="label-accent" style={{ marginBottom: 16 }}>
            03 / DOCUMENTATION
          </p>
          <h2 className="heading-section" style={{ marginBottom: 24 }}>
            Integrate in Minutes, Not Days
          </h2>
          <p className="body-text" style={{ marginBottom: 32 }}>
            A single OpenTelemetry collector routes all telemetry to Paradigm.
            No agent installation on your services. No sidecars. No code changes.
            Our SDKs for Go, Rust, Python, and Node provide one-line
            instrumentation for custom metrics and traces.
          </p>

          {/* Code Snippet */}
          <div
            style={{
              background: '#0c111c',
              border: '1px solid rgba(124, 111, 100, 0.2)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 32,
              overflowX: 'auto',
            }}
          >
            <pre
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 13,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              <code>
                <span style={{ color: '#d4a373' }}>import</span>
                <span style={{ color: '#e8e4e1' }}> paradigm </span>
                <span style={{ color: '#d4a373' }}>from</span>
                <span style={{ color: '#7c6f64' }}> '@paradigm/sdk'</span>
                {'\n\n'}
                <span style={{ color: '#4a5568' }}>// Initialize with your endpoint</span>
                {'\n'}
                <span style={{ color: '#d4a373' }}>const</span>
                <span style={{ color: '#e8e4e1' }}> client </span>
                <span style={{ color: '#d4a373' }}>=</span>
                <span style={{ color: '#d4a373' }}> new</span>
                <span style={{ color: '#e8e4e1' }}> paradigm.Client</span>
                <span style={{ color: '#d4a373' }}>({'{'}</span>
                {'\n  '}
                <span style={{ color: '#e8e4e1' }}>endpoint</span>
                <span style={{ color: '#d4a373' }}>:</span>
                <span style={{ color: '#7c6f64' }}> 'https://api.paradigm.io'</span>
                <span style={{ color: '#d4a373' }}>,</span>
                {'\n  '}
                <span style={{ color: '#e8e4e1' }}>apiKey</span>
                <span style={{ color: '#d4a373' }}>:</span>
                <span style={{ color: '#e8e4e1' }}> process.env.</span>
                <span style={{ color: '#e8e4e1' }}>PARADIGM_KEY,</span>
                {'\n  '}
                <span style={{ color: '#e8e4e1' }}>samplingRate</span>
                <span style={{ color: '#d4a373' }}>:</span>
                <span style={{ color: '#d4a373' }}> 0.05</span>
                <span style={{ color: '#4a5568' }}> // 5%</span>
                {'\n'}
                <span style={{ color: '#d4a373' }}>{'}'})</span>
                {'\n\n'}
                <span style={{ color: '#4a5568' }}>// One-line instrumentation</span>
                {'\n'}
                <span style={{ color: '#e8e4e1' }}>client.</span>
                <span style={{ color: '#d4a373' }}>instrument</span>
                <span style={{ color: '#e8e4e1' }}>(app)</span>
              </code>
            </pre>
          </div>

          <a href="#" className="text-link">
            Read the Full Docs →
          </a>
        </div>
      </div>
    </section>
  );
}
