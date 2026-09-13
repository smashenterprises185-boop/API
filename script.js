// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────
// Automatically uses localhost during local testing, or relative paths when deployed together
const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:5000'
  : ''; 

const CONTACT_ENDPOINT = `${API_BASE}/api/contact`;
const HEALTH_ENDPOINT = `${API_BASE}/api/health`;
const HEALTH_POLL_INTERVAL_MS = 30000;

const LIMITS = {
  name: { min: 2, max: 100 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 2000 },
};

// ────────────────────────────────────────────────────────────
// Element references
// ────────────────────────────────────────────────────────────
const form = document.getElementById('contactForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const subjectInput = document.getElementById('subject');
const messageInput = document.getElementById('message');
const websiteInput = document.getElementById('website'); // honeypot

const submitBtn = document.getElementById('submitBtn');
const submitLabel = document.getElementById('submitLabel');
const submitSpinner = document.getElementById('submitSpinner');
const feedback = document.getElementById('feedback');
const charCount = document.getElementById('charCount');

const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const errorEls = {
  name: document.getElementById('nameError'),
  email: document.getElementById('emailError'),
  subject: document.getElementById('subjectError'),
  message: document.getElementById('messageError'),
};

// ────────────────────────────────────────────────────────────
// Client-side validation
// ────────────────────────────────────────────────────────────
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateField(field, value) {
  switch (field) {
    case 'name':
      if (!value || value.length < LIMITS.name.min || value.length > LIMITS.name.max) {
        return `Name must be ${LIMITS.name.min}-${LIMITS.name.max} characters.`;
      }
      return '';
    case 'email':
      if (!value || !isValidEmail(value)) {
        return 'Please enter a valid email address.';
      }
      return '';
    case 'subject':
      if (!value || value.length < LIMITS.subject.min || value.length > LIMITS.subject.max) {
        return `Subject must be ${LIMITS.subject.min}-${LIMITS.subject.max} characters.`;
      }
      return '';
    case 'message':
      if (!value || value.length < LIMITS.message.min || value.length > LIMITS.message.max) {
        return `Message must be ${LIMITS.message.min}-${LIMITS.message.max} characters.`;
      }
      return '';
    default:
      return '';
  }
}

function setFieldError(input, errorEl, message) {
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
  } else {
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
  }
}

function validateForm() {
  const fields = [
    { input: nameInput, errorEl: errorEls.name, key: 'name' },
    { input: emailInput, errorEl: errorEls.email, key: 'email' },
    { input: subjectInput, errorEl: errorEls.subject, key: 'subject' },
    { input: messageInput, errorEl: errorEls.message, key: 'message' },
  ];

  let isValid = true;
  for (const { input, errorEl, key } of fields) {
    const message = validateField(key, input.value.trim());
    setFieldError(input, errorEl, message);
    if (message) isValid = false;
  }
  return isValid;
}

[nameInput, emailInput, subjectInput, messageInput].forEach((input) => {
  input.addEventListener('blur', () => {
    const message = validateField(input.id, input.value.trim());
    setFieldError(input, errorEls[input.id], message);
  });
});

messageInput.addEventListener('input', () => {
  charCount.textContent = `${messageInput.value.length} / ${LIMITS.message.max}`;
});

// ────────────────────────────────────────────────────────────
// Feedback banner helpers
// ────────────────────────────────────────────────────────────
function showFeedback(type, message, details) {
  feedback.hidden = false;
  feedback.dataset.type = type;

  let html = `<p>${message}</p>`;
  if (Array.isArray(details) && details.length > 0) {
    html += '<ul>' + details.map((d) => `<li>${d.message || d}</li>`).join('') + '</ul>';
  }
  feedback.innerHTML = html;
  feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideFeedback() {
  feedback.hidden = true;
  feedback.innerHTML = '';
}

// ────────────────────────────────────────────────────────────
// Submit button UI states
// ────────────────────────────────────────────────────────────
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitSpinner.hidden = !isLoading;
  submitLabel.textContent = isLoading ? 'Sending…' : 'Send message';
}

// ────────────────────────────────────────────────────────────
// Form submission
// ────────────────────────────────────────────────────────────
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideFeedback();

  if (websiteInput.value.trim() !== '') {
    return;
  }

  if (!validateForm()) {
    showFeedback('error', 'Please fix the highlighted fields and try again.');
    return;
  }

  const payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
    subject: subjectInput.value.trim(),
    message: messageInput.value.trim(),
    website: websiteInput.value,
  };

  setLoading(true);

  try {
    const response = await fetch(CONTACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_) {}

    if (response.status === 200 && data.success) {
      showFeedback('success', data.message || 'Message sent successfully!');
      form.reset();
      charCount.textContent = `0 / ${LIMITS.message.max}`;
    } else if (response.status === 400) {
      showFeedback('error', data.message || 'Validation failed.', data.details);
    } else if (response.status === 429) {
      showFeedback('error', data.message || 'Too many requests. Please slow down and try again shortly.');
    } else if (response.status === 500) {
      showFeedback('error', data.message || 'Server error. Please try again later.');
    } else {
      showFeedback('error', data.message || `Unexpected response (HTTP ${response.status}).`);
    }
  } catch (err) {
    showFeedback('error', 'Network error — unable to reach the API. Is the server running?');
  } finally {
    setLoading(false);
  }
});

// ────────────────────────────────────────────────────────────
// API status badge
// ────────────────────────────────────────────────────────────
async function checkApiStatus() {
  statusBadge.dataset.state = 'checking';
  statusText.textContent = 'Checking status…';

  try {
    const start = performance.now();
    const response = await fetch(HEALTH_ENDPOINT, { method: 'GET' });
    const latency = Math.round(performance.now() - start);

    if (response.ok) {
      const data = await response.json();
      statusBadge.dataset.state = 'online';
      statusText.textContent = `API online · ${latency}ms`;
      return data;
    }

    statusBadge.dataset.state = 'offline';
    statusText.textContent = 'API unreachable';
  } catch (err) {
    statusBadge.dataset.state = 'offline';
    statusText.textContent = 'API offline';
  }
  return null;
}

checkApiStatus();
setInterval(checkApiStatus, HEALTH_POLL_INTERVAL_MS);