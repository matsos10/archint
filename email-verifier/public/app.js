const form = document.getElementById('verify-form');
const emailsField = document.getElementById('emails');
const checkSmtp = document.getElementById('check-smtp');
const checkCatchAll = document.getElementById('check-catchall');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultsWrap = document.getElementById('results-wrap');
const tbody = document.querySelector('#results tbody');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderResults(results) {
  tbody.innerHTML = results.map((r) => `
    <tr>
      <td>${escapeHtml(r.email)}</td>
      <td><span class="badge badge-${r.status}">${escapeHtml(r.status)}</span></td>
      <td>${escapeHtml(r.reason ?? '-')}</td>
      <td>${r.score}</td>
      <td>${r.hasMxRecords ? 'oui' : 'non'}</td>
      <td>${r.disposable ? 'oui' : 'non'}</td>
      <td>${r.roleAccount ? 'oui' : 'non'}</td>
      <td>${r.catchAll === null ? '-' : r.catchAll ? 'oui' : 'non'}</td>
    </tr>
  `).join('');
  resultsWrap.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const emails = emailsField.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!emails.length) {
    statusEl.hidden = false;
    statusEl.textContent = 'Ajoute au moins une adresse email.';
    return;
  }

  submitBtn.disabled = true;
  statusEl.hidden = false;
  statusEl.textContent = `Vérification de ${emails.length} adresse(s) en cours...`;
  resultsWrap.hidden = true;

  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails,
        checkSmtp: checkSmtp.checked,
        checkCatchAll: checkCatchAll.checked,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      statusEl.textContent = `Erreur : ${data.error ?? response.statusText}`;
      return;
    }

    statusEl.textContent = `${data.results.length} adresse(s) vérifiée(s).`;
    renderResults(data.results);
  } catch (err) {
    statusEl.textContent = `Erreur réseau : ${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});
