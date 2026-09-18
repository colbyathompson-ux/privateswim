/* CYC private swim lessons — transactional email via SendGrid.
   Netlify env var required: SENDGRID_API_KEY
   Everything a human might want to change lives in CONFIG. */

const CONFIG = {
  from: { email: "cthompson@cycmail.org", name: "CYC Aquatics" },
  replyTo: { email: "cthompson@cycmail.org", name: "Coach Colby" },
  bcc: [],                                  // e.g. ["aquatics@cycmail.org"]
  coachName: "Coach Colby",
  coachEmail: "cthompson@cycmail.org",
  pricePerLesson: 30,
  paymentNote: "Payment is $30 per lesson, due at the aquatics desk before the first lesson. Cash, check (payable to CYC), or card all work.",
  location: "CYC pool",
  timeZone: "America/Chicago",              // used for add-to-calendar links
  arriveMinutes: 5
};

const NAVY = "#12233f";
const GOLD = "#c9a227";
const INK = "#1f2933";
const MUTED = "#6b7480";

/* ---------- helpers ---------- */

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* "3:45 – 4:15 PM" + ISO date -> Google Calendar UTC stamps.
   We send the wall-clock time with a ctz param so Google resolves the zone. */
function calStamps(iso, timeLabel) {
  if (!iso || !timeLabel) return null;
  const m = String(timeLabel).match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  const mer = (m[5] || "").toUpperCase();
  let sh = Number(m[1]), eh = Number(m[3]);
  const sm = Number(m[2]), em = Number(m[4]);
  /* The label carries one meridiem, attached to the END time. Apply it to both
     hours, then walk the start back an hour-cycle if that put it after the end
     (e.g. "11:45 – 12:15 PM" -> 11:45 stays AM). */
  if (mer === "PM") { if (sh < 12) sh += 12; if (eh < 12) eh += 12; }
  if (mer === "AM") { if (sh === 12) sh = 0; if (eh === 12) eh = 0; }
  if (sh * 60 + sm > eh * 60 + em) sh -= 12;
  if (sh < 0) sh += 24;
  const day = iso.replace(/-/g, "");
  const p = (n) => String(n).padStart(2, "0");
  return day + "T" + p(sh) + p(sm) + "00/" + day + "T" + p(eh) + p(em) + "00";
}

function calLink(row, childName) {
  const stamps = calStamps(row.iso, row.time);
  if (!stamps) return null;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: "Swim lesson — " + childName,
    dates: stamps,
    ctz: CONFIG.timeZone,
    location: CONFIG.location,
    details: "Private swim lesson with " + CONFIG.coachName +
             ". Arrive " + CONFIG.arriveMinutes + " minutes early and check in at the aquatics desk."
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

function lessonList(children) {
  return (children || []).map((c) => {
    const rows = (c.rows || []).map((r) => {
      const link = calLink(r, c.name);
      return '<tr>' +
        '<td style="padding:7px 0;border-bottom:1px solid #e6e8ec;font:600 15px/1.4 Georgia,serif;color:' + INK + '">' + esc(r.date) + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e6e8ec;font:400 15px/1.4 Helvetica,Arial,sans-serif;color:' + INK + '">' + esc(r.time) + '</td>' +
        '<td style="padding:7px 0;border-bottom:1px solid #e6e8ec;text-align:right;white-space:nowrap">' +
          (link ? '<a href="' + esc(link) + '" style="font:700 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:' + NAVY + '">+ Calendar</a>' : '') +
        '</td></tr>';
    }).join("");
    return '<div style="margin:0 0 22px">' +
      '<div style="font:700 12px/1 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:' + GOLD + ';margin:0 0 8px">' +
        esc(c.name) + (c.age ? ' · age ' + esc(c.age) : '') +
      '</div>' +
      '<table role="presentation" width="100%" style="border-collapse:collapse">' + rows + '</table>' +
    '</div>';
  }).join("");
}

function shell(preheader, eyebrow, heading, bodyHtml) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;background:#f4f5f7">' +
    '<tr><td align="center" style="padding:32px 16px">' +
    '<table role="presentation" width="100%" style="max-width:560px;border-collapse:collapse;background:#ffffff">' +
      '<tr><td style="padding:28px 32px;background:' + NAVY + '">' +
        '<div style="font:700 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:' + GOLD + '">' + esc(eyebrow) + '</div>' +
        '<div style="height:4px;width:56px;background:' + GOLD + ';margin:14px 0 16px"></div>' +
        '<h1 style="margin:0;font:400 27px/1.15 Georgia,serif;color:#ffffff">' + esc(heading) + '</h1>' +
      '</td></tr>' +
      '<tr><td style="padding:30px 32px 34px">' + bodyHtml + '</td></tr>' +
      '<tr><td style="padding:20px 32px 26px;border-top:1px solid #e6e8ec">' +
        '<div style="font:400 12px/1.6 Helvetica,Arial,sans-serif;color:' + MUTED + '">' +
          'Questions? Just reply to this email or reach ' + esc(CONFIG.coachName) +
          ' at <a href="mailto:' + esc(CONFIG.coachEmail) + '" style="color:' + NAVY + '">' + esc(CONFIG.coachEmail) + '</a>.' +
        '</div>' +
      '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

const P = 'margin:0 0 16px;font:400 15px/1.65 Helvetica,Arial,sans-serif;color:' + INK;

/* ---------- message builders ---------- */

function confirmationEmail(d) {
  const n = d.count || 1;
  const total = n * CONFIG.pricePerLesson;
  const body =
    '<p style="' + P + '">We\'ve got you — thanks for signing up. Here\'s everything on the books:</p>' +
    lessonList(d.children) +
    '<table role="presentation" width="100%" style="border-collapse:collapse;background:#faf7ee;margin:0 0 22px">' +
      '<tr><td style="padding:16px 18px">' +
        '<div style="font:700 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:' + MUTED + ';margin:0 0 6px">Confirmation code</div>' +
        '<div style="font:700 19px/1 monospace;color:' + NAVY + '">' + esc(d.code) + '</div>' +
      '</td></tr></table>' +
    '<p style="' + P + '"><strong>Getting there.</strong> Please arrive ' + CONFIG.arriveMinutes +
      ' minutes early and check in at the aquatics desk — that way we use the full half hour in the water.</p>' +
    '<p style="' + P + '"><strong>Payment.</strong> ' + esc(CONFIG.paymentNote) +
      ' Your total for ' + n + (n === 1 ? ' lesson' : ' lessons') + ' is <strong>$' + total + '</strong>.</p>' +
    '<p style="' + P + '">Bring a suit, a towel, and goggles if your swimmer likes them. See you at the pool.</p>' +
    '<p style="' + P + ';margin-bottom:0">— ' + esc(CONFIG.coachName) + '</p>';
  return {
    subject: "You're on the roster — CYC private lessons (" + d.code + ")",
    html: shell("Your lessons are confirmed. Code " + d.code + ".", "Lessons confirmed", "You're on the roster.", body)
  };
}

function cancelledEmail(d) {
  const body =
    '<p style="' + P + '">I\'m sorry — I had to take this lesson off the schedule:</p>' +
    lessonList(d.children) +
    '<p style="' + P + '">Nothing else on your schedule changed. If you\'d like to move into another open time, ' +
      'the schedule is up on the signup page and I\'m happy to help you find a slot — just reply here.</p>' +
    '<p style="' + P + '">Thanks for understanding.</p>' +
    '<p style="' + P + ';margin-bottom:0">— ' + esc(CONFIG.coachName) + '</p>';
  return {
    subject: "A swim lesson was cancelled — CYC private lessons",
    html: shell("One of your lessons was cancelled.", "Schedule change", "A lesson was cancelled.", body)
  };
}

function changedEmail(d) {
  const body =
    '<p style="' + P + '">A quick heads-up — I updated one of your lessons. Here\'s where it stands now:</p>' +
    lessonList(d.children) +
    (d.previous ? '<p style="' + P + ';color:' + MUTED + '">Previously: ' + esc(d.previous) + '</p>' : '') +
    '<p style="' + P + '">Use the calendar link above to fix it on your side. If this new time doesn\'t work, reply and we\'ll sort it out.</p>' +
    '<p style="' + P + '">Please still arrive ' + CONFIG.arriveMinutes + ' minutes early and check in at the aquatics desk.</p>' +
    '<p style="' + P + ';margin-bottom:0">— ' + esc(CONFIG.coachName) + '</p>';
  return {
    subject: "Your swim lesson was updated — CYC private lessons",
    html: shell("Your lesson details changed.", "Schedule update", "Your lesson was updated.", body)
  };
}

const BUILDERS = { confirmation: confirmationEmail, cancelled: cancelledEmail, changed: changedEmail };

/* ---------- handler ---------- */

async function send(msg) {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SENDGRID_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(msg)
  });
  if (!r.ok) throw new Error("SendGrid " + r.status + ": " + (await r.text()));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!process.env.SENDGRID_API_KEY) return { statusCode: 500, body: "SENDGRID_API_KEY is not set" };

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, body: "Bad JSON" }; }

  /* one payload or a batch */
  const items = Array.isArray(payload) ? payload : Array.isArray(payload.notices) ? payload.notices : [payload];
  const results = [];

  for (const d of items) {
    const kind = d.kind || "confirmation";
    const build = BUILDERS[kind];
    if (!build) { results.push({ kind: kind, ok: false, error: "unknown kind" }); continue; }
    if (!d.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { results.push({ kind: kind, ok: false, error: "no valid recipient" }); continue; }

    const { subject, html } = build(d);
    const to = [{ email: d.email }];
    const personalization = { to: to };
    if (CONFIG.bcc.length) personalization.bcc = CONFIG.bcc.map((e) => ({ email: e }));

    try {
      await send({
        personalizations: [personalization],
        from: CONFIG.from,
        reply_to: CONFIG.replyTo,
        subject: subject,
        content: [{ type: "text/html", value: html }]
      });
      results.push({ kind: kind, ok: true, to: d.email });
    } catch (err) {
      console.error("send failed", kind, d.email, err.message);
      results.push({ kind: kind, ok: false, error: err.message });
    }
  }

  const anyFail = results.some((r) => !r.ok);
  return {
    statusCode: anyFail ? 207 : 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results: results })
  };
};
