const nodemailer = require('nodemailer');
const QRCode     = require('qrcode');

// â”€â”€ Transporter (singleton) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    _transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   Number(SMTP_PORT) || 587,
      secure: SMTP_SECURE === 'true',
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });
    // Verify on first use
    try {
      await _transporter.verify();
      console.log('SMTP transporter ready â€” emails will be delivered to real inboxes.');
    } catch (err) {
      console.error('SMTP verify failed:', err.message);
      _transporter = null;
      throw err;
    }
  } else {
    // Fallback: Ethereal (dev only â€” emails visible at the preview URL, NOT delivered)
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.warn('WARNING: No SMTP credentials found. Using Ethereal test account â€” emails are NOT delivered to real inboxes.');
    console.warn('Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable real email delivery.');
  }
  return _transporter;
}

const FROM = () => process.env.SMTP_FROM || '"Felicity Events" <noreply@felicity.iiit.ac.in>';

// â”€â”€ Helper: generate inline QR code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function qrBuffer(text) {
  return QRCode.toBuffer(text, { width: 200, margin: 1, color: { dark: '#1e293b', light: '#ffffff' } });
}

// â”€â”€ Helper: format date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'TBD';
}

// â”€â”€ sendTicketEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sent after: normal event registration, free merch order, team finalization
async function sendTicketEmail({ to, participantName, event, registration, ticketId }) {
  try {
    const transporter   = await getTransporter();
    const isMerchandise = event.eventType === 'merchandise';
    const qrBuf         = await qrBuffer(ticketId);

    // Merchandise order summary rows
    let orderRowsHtml = '';
    if (isMerchandise && registration.merchandiseSelections?.length) {
      orderRowsHtml = registration.merchandiseSelections.map((s) => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${s.itemName}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${[s.size, s.color].filter(Boolean).join(' / ') || 'â€”'}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${s.quantity}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">Rs.${s.priceEach * s.quantity}</td>
        </tr>`).join('');
      orderRowsHtml = `
        <div style="margin:20px 0;">
          <p style="font-weight:600;color:#1e293b;margin:0 0 8px;">Order Summary</p>
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Item</th>
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Variant</th>
                <th style="padding:7px 12px;text-align:center;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Qty</th>
                <th style="padding:7px 12px;text-align:right;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Amount</th>
              </tr>
            </thead>
            <tbody>${orderRowsHtml}</tbody>
            <tfoot>
              <tr style="background:#f8fafc;">
                <td colspan="3" style="padding:7px 12px;font-weight:700;text-align:right;">Total</td>
                <td style="padding:7px 12px;font-weight:700;text-align:right;color:#059669;">Rs.${registration.totalAmount}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }

    const subject = `Registration Confirmed â€” ${event.title} (${ticketId})`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:24px;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);border-radius:10px;padding:28px 32px;color:#fff;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:0.8rem;opacity:0.8;letter-spacing:0.08em;text-transform:uppercase;">Felicity Events Platform</p>
          <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Registration Confirmed</h1>
          <p style="margin:6px 0 0;opacity:0.85;">${event.title}</p>
        </div>

        <!-- Body card -->
        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:16px;">
          <p style="margin:0 0 16px;color:#374151;">Hi <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 20px;color:#374151;">Your ${isMerchandise ? 'order' : 'registration'} has been confirmed. Here are your details:</p>

          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:8px;">
            <tr><td style="padding:5px 0;color:#64748b;width:130px;">Event</td><td style="padding:5px 0;font-weight:600;">${event.title}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Type</td><td style="padding:5px 0;">${isMerchandise ? 'Merchandise' : 'Normal Event'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Date</td><td style="padding:5px 0;">${fmt(event.startDate)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Venue</td><td style="padding:5px 0;">${event.venue || 'â€”'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Organizer</td><td style="padding:5px 0;">${event.organizer?.clubName || event.organizer?.name || 'â€”'}</td></tr>
          </table>

          ${orderRowsHtml}

          <!-- Ticket box with QR -->
          <div style="border:2px dashed #4f46e5;border-radius:10px;padding:20px;text-align:center;margin-top:20px;">
            <p style="margin:0 0 4px;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Ticket ID</p>
            <p style="margin:0 0 14px;font-family:monospace;font-size:1.4rem;font-weight:800;color:#4f46e5;letter-spacing:3px;">${ticketId}</p>
            <img src="cid:qrcode" alt="QR Code" width="150" height="150" style="display:block;margin:0 auto 10px;" />
            <p style="margin:0;font-size:0.78rem;color:#94a3b8;">Scan this QR code or present your Ticket ID at the venue for entry.</p>
          </div>
        </div>

        <p style="text-align:center;color:#94a3b8;font-size:0.75rem;margin:0;">
          This is an automated email from Felicity Events Platform, IIIT Hyderabad. Do not reply.
        </p>
      </div>`;

    await transporter.sendMail({
      from: FROM(), to, subject, html,
      attachments: [{ filename: 'qr.png', content: qrBuf, cid: 'qrcode', contentType: 'image/png' }],
    });
  } catch (err) {
    console.error('sendTicketEmail failed:', err.message);
  }
}

// â”€â”€ sendOrderPlacedEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sent for paid merchandise orders: tells participant to upload payment proof
async function sendOrderPlacedEmail({ to, participantName, event, registration }) {
  try {
    const transporter = await getTransporter();

    const orderRowsHtml = (registration.merchandiseSelections || []).map((s) => `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${s.itemName}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${[s.size, s.color].filter(Boolean).join(' / ') || 'â€”'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${s.quantity}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">Rs.${s.priceEach * s.quantity}</td>
      </tr>`).join('');

    const subject = `Order Placed â€” Upload Payment Proof for ${event.title}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:24px;">
        <div style="background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:10px;padding:28px 32px;color:#fff;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:0.8rem;opacity:0.8;letter-spacing:0.08em;text-transform:uppercase;">Felicity Events Platform</p>
          <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Order Placed â€” Action Required</h1>
          <p style="margin:6px 0 0;opacity:0.85;">${event.title}</p>
        </div>

        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:16px;">
          <p style="margin:0 0 16px;color:#374151;">Hi <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 16px;color:#374151;">Your order has been placed successfully. To complete your purchase, please <strong>upload your payment proof</strong> on the Felicity portal.</p>

          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0;font-weight:600;color:#92400e;">Next Step: Upload Payment Proof</p>
            <p style="margin:6px 0 0;font-size:0.875rem;color:#78350f;">Log in to Felicity, go to your event registration, and upload a screenshot or photo of your payment (UPI / bank transfer).</p>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:20px;">
            <tr><td style="padding:5px 0;color:#64748b;width:130px;">Event</td><td style="padding:5px 0;font-weight:600;">${event.title}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Date</td><td style="padding:5px 0;">${fmt(event.startDate)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Venue</td><td style="padding:5px 0;">${event.venue || 'â€”'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Organizer</td><td style="padding:5px 0;">${event.organizer?.clubName || event.organizer?.name || 'â€”'}</td></tr>
          </table>

          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Item</th>
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Variant</th>
                <th style="padding:7px 12px;text-align:center;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Qty</th>
                <th style="padding:7px 12px;text-align:right;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Amount</th>
              </tr>
            </thead>
            <tbody>${orderRowsHtml}</tbody>
            <tfoot>
              <tr style="background:#f8fafc;">
                <td colspan="3" style="padding:7px 12px;font-weight:700;text-align:right;">Total</td>
                <td style="padding:7px 12px;font-weight:700;text-align:right;color:#d97706;">Rs.${registration.totalAmount}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p style="text-align:center;color:#94a3b8;font-size:0.75rem;margin:0;">
          This is an automated email from Felicity Events Platform, IIIT Hyderabad. Do not reply.
        </p>
      </div>`;

    await transporter.sendMail({ from: FROM(), to, subject, html });
  } catch (err) {
    console.error('sendOrderPlacedEmail failed:', err.message);
  }
}

// â”€â”€ sendPaymentApprovalEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sent when organizer approves a merchandise payment â€” contains QR ticket
async function sendPaymentApprovalEmail({ to, participantName, event, registration, ticketId }) {
  try {
    const transporter = await getTransporter();
    const qrBuf         = await qrBuffer(ticketId);

    const orderRowsHtml = (registration.merchandiseSelections || []).map((s) => `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${s.itemName}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${[s.size, s.color].filter(Boolean).join(' / ') || 'â€”'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${s.quantity}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">Rs.${s.priceEach * s.quantity}</td>
      </tr>`).join('');

    const subject = `Payment Approved â€” Your ticket for ${event.title} (${ticketId})`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:24px;">
        <div style="background:linear-gradient(135deg,#059669,#0d9488);border-radius:10px;padding:28px 32px;color:#fff;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:0.8rem;opacity:0.8;letter-spacing:0.08em;text-transform:uppercase;">Felicity Events Platform</p>
          <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Payment Approved!</h1>
          <p style="margin:6px 0 0;opacity:0.85;">${event.title}</p>
        </div>

        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:16px;">
          <p style="margin:0 0 16px;color:#374151;">Hi <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 20px;color:#374151;">Your payment has been verified and approved. Your order is confirmed and your entry ticket is ready below.</p>

          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:20px;">
            <tr><td style="padding:5px 0;color:#64748b;width:130px;">Event</td><td style="padding:5px 0;font-weight:600;">${event.title}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Date</td><td style="padding:5px 0;">${fmt(event.startDate)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Venue</td><td style="padding:5px 0;">${event.venue || 'â€”'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Organizer</td><td style="padding:5px 0;">${event.organizer?.clubName || event.organizer?.name || 'â€”'}</td></tr>
          </table>

          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-bottom:20px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Item</th>
                <th style="padding:7px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Variant</th>
                <th style="padding:7px 12px;text-align:center;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Qty</th>
                <th style="padding:7px 12px;text-align:right;font-weight:600;color:#475569;border-bottom:2px solid #e2e8f0;">Amount</th>
              </tr>
            </thead>
            <tbody>${orderRowsHtml}</tbody>
            <tfoot>
              <tr style="background:#f8fafc;">
                <td colspan="3" style="padding:7px 12px;font-weight:700;text-align:right;">Total</td>
                <td style="padding:7px 12px;font-weight:700;text-align:right;color:#059669;">Rs.${registration.totalAmount}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Ticket box with QR -->
          <div style="border:2px dashed #059669;border-radius:10px;padding:20px;text-align:center;margin-top:20px;">
            <p style="margin:0 0 4px;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Ticket ID</p>
            <p style="margin:0 0 14px;font-family:monospace;font-size:1.4rem;font-weight:800;color:#059669;letter-spacing:3px;">${ticketId}</p>
            <img src="cid:qrcode" alt="QR Code" width="150" height="150" style="display:block;margin:0 auto 10px;" />
            <p style="margin:0;font-size:0.78rem;color:#94a3b8;">Scan this QR code or present your Ticket ID at the venue for merchandise collection.</p>
          </div>
        </div>

        <p style="text-align:center;color:#94a3b8;font-size:0.75rem;margin:0;">
          This is an automated email from Felicity Events Platform, IIIT Hyderabad. Do not reply.
        </p>
      </div>`;

    await transporter.sendMail({
      from: FROM(), to, subject, html,
      attachments: [{ filename: 'qr.png', content: qrBuf, cid: 'qrcode', contentType: 'image/png' }],
    });
  } catch (err) {
    console.error('sendPaymentApprovalEmail failed:', err.message);
  }
}

// â”€â”€ sendPaymentRejectionEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sent when organizer rejects a merchandise payment
async function sendPaymentRejectionEmail({ to, participantName, event }) {
  try {
    const transporter = await getTransporter();

    const subject = `Payment Not Approved â€” ${event.title}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:24px;">
        <div style="background:linear-gradient(135deg,#dc2626,#9f1239);border-radius:10px;padding:28px 32px;color:#fff;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:0.8rem;opacity:0.8;letter-spacing:0.08em;text-transform:uppercase;">Felicity Events Platform</p>
          <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Payment Not Approved</h1>
          <p style="margin:6px 0 0;opacity:0.85;">${event.title}</p>
        </div>

        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:16px;">
          <p style="margin:0 0 16px;color:#374151;">Hi <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 16px;color:#374151;">Unfortunately, your payment proof for <strong>${event.title}</strong> could not be verified by the organizer and has been rejected.</p>
          <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
            <p style="margin:0;font-weight:600;color:#991b1b;">What to do next</p>
            <p style="margin:6px 0 0;font-size:0.875rem;color:#7f1d1d;">Please log back into Felicity, re-upload a clear photo of your payment receipt, and re-submit. If you believe this is an error, contact the organizer directly.</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <tr><td style="padding:5px 0;color:#64748b;width:130px;">Event</td><td style="padding:5px 0;font-weight:600;">${event.title}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Date</td><td style="padding:5px 0;">${fmt(event.startDate)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Organizer</td><td style="padding:5px 0;">${event.organizer?.clubName || event.organizer?.name || 'â€”'}</td></tr>
          </table>
        </div>

        <p style="text-align:center;color:#94a3b8;font-size:0.75rem;margin:0;">
          This is an automated email from Felicity Events Platform, IIIT Hyderabad. Do not reply.
        </p>
      </div>`;

    await transporter.sendMail({ from: FROM(), to, subject, html });
  } catch (err) {
    console.error('sendPaymentRejectionEmail failed:', err.message);
  }
}

// ── sendCancellationEmail ─────────────────────────────────────────────────────
// Sent when a participant cancels their registration
async function sendCancellationEmail({ to, participantName, event }) {
  try {
    const transporter = await getTransporter();

    const subject = `Registration Cancelled — ${event.title}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f8fafc;padding:24px;">
        <div style="background:linear-gradient(135deg,#64748b,#475569);border-radius:10px;padding:28px 32px;color:#fff;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:0.8rem;opacity:0.8;letter-spacing:0.08em;text-transform:uppercase;">Felicity Events Platform</p>
          <h1 style="margin:0;font-size:1.5rem;font-weight:700;">Registration Cancelled</h1>
          <p style="margin:6px 0 0;opacity:0.85;">${event.title}</p>
        </div>

        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:16px;">
          <p style="margin:0 0 16px;color:#374151;">Hi <strong>${participantName}</strong>,</p>
          <p style="margin:0 0 20px;color:#374151;">Your registration for <strong>${event.title}</strong> has been successfully cancelled. We're sorry to see you go!</p>

          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:20px;">
            <tr><td style="padding:5px 0;color:#64748b;width:130px;">Event</td><td style="padding:5px 0;font-weight:600;">${event.title}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Date</td><td style="padding:5px 0;">${fmt(event.startDate)}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Venue</td><td style="padding:5px 0;">${event.venue || '—'}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b;">Organizer</td><td style="padding:5px 0;">${event.organizer?.clubName || event.organizer?.name || '—'}</td></tr>
          </table>

          <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;">
            <p style="margin:0;font-size:0.875rem;color:#475569;">If you change your mind, you can re-register on the Felicity portal as long as the event still has available spots and registration is open.</p>
          </div>
        </div>

        <p style="text-align:center;color:#94a3b8;font-size:0.75rem;margin:0;">
          This is an automated email from Felicity Events Platform, IIIT Hyderabad. Do not reply.
        </p>
      </div>`;

    await transporter.sendMail({ from: FROM(), to, subject, html });
  } catch (err) {
    console.error('sendCancellationEmail failed:', err.message);
  }
}

module.exports = { sendTicketEmail, sendOrderPlacedEmail, sendPaymentApprovalEmail, sendPaymentRejectionEmail, sendCancellationEmail };
