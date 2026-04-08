"use client";
import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [adrema, setAdrema] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null); // null, 'pending', 'approved'
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Poll for PDF logic
  const [pdfUrl, setPdfUrl] = useState(null);

  const pollForPDF = async (adremaToPoll) => {
    setPdfUrl(null);
    const maxAttempts = 40; // 2 minutes approx
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/check-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adrema: adremaToPoll })
        });
        const data = await res.json();

        if (data.found) {
          setPdfUrl(data.url);
          setPaymentStatus('approved'); // Ensure status is approved if file found
          clearInterval(interval);
        }
      } catch (e) { console.error("Polling error", e); }

      if (attempts >= maxAttempts) clearInterval(interval);
    }, 3000);
  };

  // Check URL params for payment return
  // We need to wrap this in Suspense boundary usually, but for page.js in App Router it's tricky. 
  // For simplicity ensuring client-side only check.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      const adremaParam = params.get('adrema');

      if (status === 'approved' && adremaParam) {
        setPaymentStatus('approved');
        setAdrema(adremaParam);

        // SYNC: Notify original tab that payment is done
        localStorage.setItem('payment_success_sync', JSON.stringify({
          adrema: adremaParam,
          timestamp: Date.now()
        }));

        // DEV ONLY: Force trigger PDF generation
        fetch('/api/localhost-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adrema: adremaParam })
        }).catch(err => console.error("Trigger Error", err));

        // UX: If we are in the popup, close ourselves or show message
        if (window.opener) {
          document.body.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;font-family:sans-serif;text-align:center;">
                    <h1 style="color:#4CAF50">¡Pago Exitoso!</h1>
                    <p>El informe se está generando en la pestaña principal.</p>
                    <p>Puedes cerrar esta ventana.</p>
                    <button onclick="window.close()" style="padding:10px 20px;margin-top:20px;background:#333;color:#fff;border:1px solid #555;cursor:pointer;">Cerrar ahora</button>
                    <script>setTimeout(function(){ window.close() }, 4000);</script>
                </div>
            `;
          return; // Stop rendering the full app
        }

        // IMPORTANTE: iniciar polling INMEDIATAMENTE (en paralelo con el analyze)
        // Así no se pierde tiempo esperando que scraping termine antes de buscar el PDF
        pollForPDF(adremaParam);

        // Auto-trigger analysis to show modal + datos preview
        fetchAnalysis(adremaParam, false); // false = ya lanzamos pollForPDF arriba
      }
    }
  }, []);

  // --- NEW: LISTEN FOR PAYMENT IN OTHER TABS ---
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'payment_success_sync' && e.newValue) {
        const data = JSON.parse(e.newValue);
        // If payment matches current adrema (or just update regardless if user flow allows)
        if (data.adrema === adrema) {
          setShowDataModal(false); // Close form
          setPaymentStatus('approved'); // Show success UI
          setResult(prev => prev); // Force re-render if needed
          pollForPDF(data.adrema); // Start looking for the file
          alert("¡Pago detectado! Generando tu informe...");
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [adrema]);

  const fetchAnalysis = async (adremaValue, isPostPayment = false) => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adrema: adremaValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Error en el servidor municipal.");
      }

      const data = await response.json();
      setResult(data);

      // Logic:
      // If isPostPayment -> start polling immediately.
      // If not -> User sees preview, decides to buy.

      if (isPostPayment) {
        pollForPDF(adremaValue);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error de conexión.");
      setLoading(false);
    }
  };

  const analyzeAdrema = (e) => {
    e.preventDefault();
    fetchAnalysis(adrema);
  };

  // --- NEW STATE FOR USER DATA MODAL ---
  const [showDataModal, setShowDataModal] = useState(false);
  const [userData, setUserData] = useState({ nombre: '', telefono: '', email: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState('');

  const handleBuyReport = () => {
    // Open Data Modal instead of going directly to pay
    setShowDataModal(true);
  };

  const handleVerifyPayment = async () => {
    setIsVerifyingPayment(true);
    setVerifyMessage('');
    try {
      const res = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adrema })
      });
      const data = await res.json();
      if (data.paid) {
        setShowDataModal(false);
        setPaymentStatus('approved');
        // Disparar generación de PDF (el watcher.js lo procesa)
        fetch('/api/localhost-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adrema })
        }).catch(err => console.error("Trigger Error", err));
        pollForPDF(adrema);
      } else {
        setVerifyMessage('No encontramos tu pago aún. Esperá unos segundos e intentá de nuevo.');
      }
    } catch (e) {
      setVerifyMessage('Error al verificar el pago. Revisá tu conexión.');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleConfirmUserData = async (e) => {
    e.preventDefault();
    if (!userData.nombre || !userData.telefono) {
      alert("Nombre y Teléfono son obligatorios.");
      return;
    }

    setIsRegistering(true);
    try {
      // 1. Registrar datos del cliente
      const regRes = await fetch('/api/register-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, adrema: adrema })
      });
      if (!regRes.ok) throw new Error("Error registrando datos");

      // 2. Ir al pago (misma tab para que el redirect de vuelta funcione)
      await initiatePayment();

    } catch (err) {
      console.error(err);
      alert("Error registrando datos. Intente nuevamente.");
    } finally {
      setIsRegistering(false);
    }
  };

  const initiatePayment = async () => {
    setIsProcessingPayment(true);
    try {
      const res = await fetch('/api/create_preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adrema: adrema || 'ADREMA-UNKNOWN',
          price: 100,
          title: `Informe Factibilidad - ${adrema}`,
          payer_email: userData.email,
          payer_name: userData.nombre,
          payer_phone: userData.telefono
        })
      });
      const data = await res.json();
      if (data.init_point) {
        // Guardar adrema en localStorage para recuperarla al volver de MP
        localStorage.setItem('pending_adrema', adrema);
        // Redirigir la tab actual a MP (no popup)
        // Al volver, MP redirige a /?status=approved&adrema=X y el useEffect lo maneja
        window.location.href = data.init_point;
      } else {
        alert("Error iniciando pago: " + (data.details || "Desconocido"));
        setIsProcessingPayment(false);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión con Mercado Pago");
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className={styles.container}>

      {/* --- VIDEO DE FONDO --- */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline 
        className={styles.videoBackground} 
        poster="/arneaz_clean_bg.png"
      >
        <source src="https://drive.google.com/uc?export=download&id=1vpc_p0494nyGyTnY38jApOi6GnaxmUws" type="video/mp4" />
      </video>
      <div className={styles.videoOverlay}></div>

      <main className={styles.main}>

        {/* --- COLUMNA 1: IDENTIDAD Y FORMULARIO --- */}
        <section className={styles.leftPanel}>
          <div className={styles.headerSection}>
            <h1 className={styles.mainTitle}>
              ARQUITECTO <br />
              <span className={styles.highlight}>VIRTUAL</span>
            </h1>
            <p className={styles.description}>
              Automatiza el análisis de factibilidad de terrenos y genera reportes
              urbanísticos profesionales en segundos. Tecnología de punta
              diseñada para desarrolladores exigentes.
            </p>
          </div>

          <div className={styles.card}>
            <p className={styles.cardInstruction}>
              Ingresa el número de Adrema de tu terreno para obtener
              instantáneamente los indicadores urbanísticos y el análisis de
              factibilidad IA en Corrientes.
            </p>

            <form onSubmit={analyzeAdrema} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>NÚMERO DE ADREMA</label>
                <input
                  type="text"
                  value={adrema}
                  onChange={(e) => setAdrema(e.target.value)}
                  placeholder="ej. A10939431"
                  className={styles.input}
                  disabled={loading}
                />
              </div>
              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? "PROCESANDO..." : "ANALIZAR TERRENO"}
              </button>
            </form>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        </section>

        {/* --- COLUMNA 2: VISUAL CENTRAL --- */}
        <section className={styles.centerPanel}>
          {/* Visual container removed per user request */}
        </section>

        {/* --- COLUMNA 3: DASHBOARD Y CHAT --- */}
        <section className={styles.rightPanel}>
          {/* Dashboard and Chatbot removed per user request */}
        </section>

        {/* --- DATA CAPTURE MODAL --- */}
        {showDataModal && (
          <div className={styles.resultOverlay}>
            <div className={styles.resultCard} style={{ maxWidth: '500px' }}>
              <button onClick={() => setShowDataModal(false)} className={styles.closeButton}>✕</button>
              <h2 className={styles.resultTitle}>DATOS DE CONTACTO (BUNKER)</h2>
              <p style={{ color: '#ccc', marginBottom: '20px' }}>
                Para generar y enviar tu informe personalizado, necesitamos registrar tu contacto.
              </p>

              <form onSubmit={handleConfirmUserData} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label className={styles.label}>Nombre y Apellido *</label>
                  <input
                    type="text"
                    className={styles.input}
                    required
                    value={userData.nombre}
                    onChange={e => setUserData({ ...userData, nombre: e.target.value })}
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div>
                  <label className={styles.label}>Teléfono (con área) *</label>
                  <input
                    type="tel"
                    className={styles.input}
                    required
                    value={userData.telefono}
                    onChange={e => setUserData({ ...userData, telefono: e.target.value })}
                    placeholder="Ej. 3794 123456"
                  />
                </div>
                <div>
                  <label className={styles.label}>Email (Opcional)</label>
                  <input
                    type="email"
                    className={styles.input}
                    value={userData.email}
                    onChange={e => setUserData({ ...userData, email: e.target.value })}
                    placeholder="ejemplo@email.com"
                  />
                </div>

                <button
                  type="submit"
                  className={styles.button}
                  disabled={isRegistering}
                  style={{ marginTop: '10px' }}
                >
                  {isRegistering ? "REGISTRANDO..." : "CONTINUAR AL PAGO"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* --- MODAL DE RESULTADOS (Overlay) --- */}
        {result && !showDataModal && (
          <div className={styles.resultOverlay}>
            <div className={styles.resultCard}>
              <button onClick={() => setResult(null)} className={styles.closeButton}>✕</button>
              <h2 className={styles.resultTitle}>ANÁLISIS DE FACTIBILIDAD (PREVIEW)</h2>
              <div className={styles.resultGrid}>
                <div className={styles.dataCol}>
                  <div className={styles.row}><span>Distrito:</span> <strong>{result.distrito}</strong></div>
                  <div className={styles.row}><span>Superficie:</span> <strong>{result.superficieTotal}</strong></div>
                  <div className={styles.row}><span>Frente:</span> <strong>{result.frente}</strong></div>
                  <div className={styles.row}><span>Altura Máx:</span> <strong>{result.alturaMaxima}</strong></div>

                  {/* Lock Overlay for Content if not paid */}
                  {!paymentStatus && !pdfUrl && (
                    <div style={{ marginTop: '20px', padding: '10px', background: 'rgba(255,0,0,0.1)', border: '1px solid red', borderRadius: '4px' }}>
                      <p style={{ fontSize: '0.9rem', color: '#ffaaaa' }}>ℹ️ Para acceder al Dictamen IA completo y descargar el Informe PDF Oficial, debes procesar el pago.</p>
                    </div>
                  )}
                </div>

                <div className={styles.aiCol} style={{ filter: (!paymentStatus && !pdfUrl) ? 'blur(4px)' : 'none', pointerEvents: (!paymentStatus && !pdfUrl) ? 'none' : 'auto' }}>
                  <h3>DICTAMEN IA</h3>
                  <p>{result.analisisIA}</p>
                </div>
              </div>

              {/* ACTION AREA (PAYMENT or DOWNLOAD) */}
              <div style={{ marginTop: '30px', textAlign: 'center', borderTop: '1px solid #333', paddingTop: '20px' }}>

                {paymentStatus === 'approved' || pdfUrl ? (
                  // FLOW: PAGO APROBADO
                  <>
                    <p style={{ color: '#4CAF50', fontWeight: 'bold', marginBottom: '10px' }}>✅ PAGO ACREDITADO</p>
                    {pdfUrl ? (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.button}
                        style={{ backgroundColor: '#D32F2F', color: 'white', textDecoration: 'none', padding: '15px 30px', borderRadius: '4px', display: 'inline-block', fontSize: '1.2rem' }}
                      >
                        📥 DESCARGAR INFORME PDF
                      </a>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div className={styles.loader} style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #FF9900', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite' }}></div>
                        <p style={{ color: '#fff' }}>Generando informe completo... (Esto puede tomar unos segundos)</p>
                        <button
                          onClick={() => pollForPDF(adrema)}
                          style={{ background: 'transparent', border: '1px solid #FF9900', color: '#FF9900', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '4px' }}
                        >
                          🔄 Verificar si ya está listo
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  // FLOW: PAGO PENDIENTE -> Trigger Modal
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={handleBuyReport}
                      className={styles.button}
                      disabled={isProcessingPayment}
                      style={{
                        fontSize: '1.3rem',
                        padding: '15px 40px',
                        background: 'linear-gradient(90deg, #009EE3, #005F99)',
                        boxShadow: '0 0 20px rgba(0, 158, 227, 0.4)'
                      }}
                    >
                      {isProcessingPayment ? "Redirigiendo..." : "COMPRAR INFORME COMPLETO ($100)"}
                    </button>
                    <button
                      onClick={handleVerifyPayment}
                      disabled={isVerifyingPayment}
                      style={{
                        background: 'transparent',
                        border: '1px solid #4CAF50',
                        color: '#4CAF50',
                        padding: '10px 24px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                      }}
                    >
                      {isVerifyingPayment ? "Verificando..." : "✅ YA REALICÉ EL PAGO"}
                    </button>
                    {verifyMessage && (
                      <p style={{ color: '#ffaaaa', fontSize: '0.85rem', margin: 0 }}>{verifyMessage}</p>
                    )}
                  </div>
                )}

                <p style={{ marginTop: '15px', fontSize: '0.8rem', color: '#666' }}>
                  Aceptamos Mercado Pago, Tarjetas y Transferencia.
                </p>

              </div>
            </div>
          </div>
        )}

      </main>

      {/* Quick spin animation style injection if not in CSS */}
      <style jsx global>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
