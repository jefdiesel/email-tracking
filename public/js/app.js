// Email Tracker Frontend Application

class EmailTracker {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.gmailConnected = false;
    this.currentPage = 1;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.handleUrlParams();

    if (this.accessToken) {
      await this.verifyAuth();
    } else {
      this.showAuth();
    }
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Auth forms
    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

    // Create tracking
    document.getElementById('create-tracking-btn').addEventListener('click', () => this.showModal('create-modal'));
    document.getElementById('create-form').addEventListener('submit', (e) => this.handleCreateTracking(e));

    // Compose email
    document.getElementById('compose-email-btn').addEventListener('click', () => this.showComposeModal());
    document.getElementById('compose-form').addEventListener('submit', (e) => this.handleSendEmail(e));

    // Gmail
    document.getElementById('gmail-connect-btn').addEventListener('click', () => this.handleGmailConnect());
    document.getElementById('gmail-disconnect-btn').addEventListener('click', () => this.handleGmailDisconnect());

    // Copy buttons
    document.getElementById('copy-pixel').addEventListener('click', () => this.copyToClipboard('pixel-html'));
    document.getElementById('copy-url').addEventListener('click', () => this.copyToClipboard('pixel-url'));

    // Modal close
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });

    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModals();
      });
    });
  }

  handleUrlParams() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('gmail_connected') === 'true') {
      this.showNotification('Gmail connected successfully!', 'success');
      window.history.replaceState({}, '', '/');
    }

    if (params.get('gmail_error')) {
      this.showNotification('Failed to connect Gmail: ' + params.get('gmail_error'), 'error');
      window.history.replaceState({}, '', '/');
    }
  }

  // Auth Methods
  switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  }

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
      const res = await this.api('/api/auth/login', 'POST', { email, password });
      this.setAuth(res);
      this.showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');

    try {
      const res = await this.api('/api/auth/register', 'POST', { name, email, password });
      this.setAuth(res);
      this.showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async handleLogout() {
    try {
      await this.api('/api/auth/logout', 'POST', { refreshToken: this.refreshToken });
    } catch {
      // Ignore errors
    }
    this.clearAuth();
    this.showAuth();
  }

  setAuth(data) {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  }

  clearAuth() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  async verifyAuth() {
    try {
      const res = await this.api('/api/auth/me', 'GET');
      this.user = res.user;
      localStorage.setItem('user', JSON.stringify(res.user));
      this.showDashboard();
    } catch {
      // Try refreshing token
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken })
        });
        const data = await res.json();
        if (data.success) {
          this.setAuth(data);
          this.showDashboard();
        } else {
          throw new Error('Refresh failed');
        }
      } catch {
        this.clearAuth();
        this.showAuth();
      }
    }
  }

  // View Methods
  showAuth() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
  }

  async showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('user-name').textContent = this.user.name || this.user.email;

    await Promise.all([
      this.loadStats(),
      this.loadEmails(),
      this.checkGmailStatus()
    ]);
  }

  async loadStats() {
    try {
      const res = await this.api('/api/track/stats', 'GET');
      const stats = res.stats;

      document.getElementById('stat-total').textContent = stats.totalEmails;
      document.getElementById('stat-opened').textContent = stats.openedEmails;
      document.getElementById('stat-opens').textContent = stats.totalOpens;
      document.getElementById('stat-rate').textContent = stats.openRate + '%';

      // Recent opens
      const recentEl = document.getElementById('recent-opens');
      if (stats.recentOpens.length === 0) {
        recentEl.innerHTML = '<p class="empty-state">No recent opens</p>';
      } else {
        recentEl.innerHTML = stats.recentOpens.map(open => `
          <div class="open-item">
            <div class="open-info">
              <span class="open-subject">${this.escapeHtml(open.subject)}</span>
              <span class="open-details">${open.city}, ${open.country} - ${open.recipient}</span>
            </div>
            <span class="open-time">${this.formatDate(open.timestamp)}</span>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async loadEmails(page = 1) {
    try {
      const res = await this.api(`/api/track/emails?page=${page}&limit=10`, 'GET');
      const tbody = document.getElementById('emails-tbody');

      if (res.emails.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No tracked emails yet</td></tr>';
        document.getElementById('pagination').classList.add('hidden');
        return;
      }

      tbody.innerHTML = res.emails.map(email => `
        <tr>
          <td>${this.escapeHtml(email.subject)}</td>
          <td>${this.escapeHtml(email.recipient)}</td>
          <td>
            <span class="badge ${email.openCount > 0 ? 'badge-success' : 'badge-warning'}">
              ${email.openCount}
            </span>
          </td>
          <td>${email.uniqueOpens}</td>
          <td>${email.lastOpenedAt ? this.formatDate(email.lastOpenedAt) : '-'}</td>
          <td>
            <button class="btn btn-small btn-secondary" onclick="app.viewEmailDetails('${email.id}')">View</button>
            <button class="btn btn-small btn-danger" onclick="app.deleteEmail('${email.id}')">Delete</button>
          </td>
        </tr>
      `).join('');

      // Pagination
      if (res.pagination.totalPages > 1) {
        const paginationEl = document.getElementById('pagination');
        paginationEl.classList.remove('hidden');
        paginationEl.innerHTML = Array.from({ length: res.pagination.totalPages }, (_, i) => `
          <button class="${i + 1 === page ? 'active' : ''}" onclick="app.loadEmails(${i + 1})">${i + 1}</button>
        `).join('');
      }

      this.currentPage = page;
    } catch (err) {
      console.error('Failed to load emails:', err);
    }
  }

  async viewEmailDetails(id) {
    console.log('viewEmailDetails called with id:', id);
    try {
      const res = await this.api(`/api/track/emails/${id}`, 'GET');
      console.log('API response:', res);
      const email = res.email;

      const content = document.getElementById('email-details-content');
      content.innerHTML = `
        <div class="detail-header">
          <h3>${this.escapeHtml(email.subject)}</h3>
          <p class="detail-meta">
            To: ${this.escapeHtml(email.recipient)} | Created: ${this.formatDate(email.created_at)}
          </p>
        </div>

        <div class="detail-stats">
          <div class="detail-stat">
            <div class="detail-stat-value">${email.openCount}</div>
            <div class="detail-stat-label">Total Opens</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-value">${email.uniqueOpens}</div>
            <div class="detail-stat-label">Unique Opens</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-value">${email.forwardDetected ? 'Yes' : 'No'}</div>
            <div class="detail-stat-label">Forward Detected</div>
          </div>
        </div>

        <div class="code-block" style="margin-bottom: 1.5rem;">
          <code>${this.escapeHtml(email.htmlSnippet)}</code>
        </div>

        <div class="readers-section">
          <h4>Readers (${email.readers.length})</h4>
          ${email.readers.length === 0 ? '<p class="empty-state">No readers yet</p>' :
            email.readers.map(reader => `
              <div class="reader-card">
                <div class="reader-header">
                  <span class="reader-ip">${reader.ip}</span>
                  <span class="reader-count">${reader.openCount} opens</span>
                </div>
                <div class="reader-location">
                  ${reader.location.city}, ${reader.location.region}, ${reader.location.country}
                  ${reader.location.isp !== 'Unknown' ? ` (${reader.location.isp})` : ''}
                </div>
                <div class="reader-times">
                  First: ${this.formatDate(reader.firstOpen)} |
                  Last: ${this.formatDate(reader.lastOpen)}
                </div>
              </div>
            `).join('')
          }
        </div>
      `;

      this.showModal('details-modal');
    } catch (err) {
      console.error('viewEmailDetails error:', err);
      this.showNotification('Failed to load email details: ' + err.message, 'error');
    }
  }

  async deleteEmail(id) {
    console.log('deleteEmail called with id:', id);
    if (!confirm('Are you sure you want to delete this tracked email?')) return;

    try {
      const res = await this.api(`/api/track/emails/${id}`, 'DELETE');
      console.log('Delete response:', res);
      this.showNotification('Email deleted successfully', 'success');
      await this.loadEmails(this.currentPage);
      await this.loadStats();
    } catch (err) {
      console.error('deleteEmail error:', err);
      this.showNotification('Failed to delete email: ' + err.message, 'error');
    }
  }

  // Tracking Methods
  async handleCreateTracking(e) {
    e.preventDefault();
    const subject = document.getElementById('create-subject').value;
    const recipient = document.getElementById('create-recipient').value;

    try {
      const res = await this.api('/api/track/create', 'POST', { subject, recipient });

      document.getElementById('pixel-html').textContent = res.email.htmlSnippet;
      document.getElementById('pixel-url').textContent = res.email.pixelUrl;
      document.getElementById('pixel-result').classList.remove('hidden');

      await this.loadEmails();
      await this.loadStats();
    } catch (err) {
      this.showNotification(err.message, 'error');
    }
  }

  // Gmail Methods
  async checkGmailStatus() {
    try {
      const res = await this.api('/api/gmail/status', 'GET');
      this.gmailConnected = res.connected;

      const statusEl = document.getElementById('gmail-status');
      const connectBtn = document.getElementById('gmail-connect-btn');

      if (res.connected) {
        statusEl.classList.remove('hidden');
        document.getElementById('gmail-email').textContent = res.profile.email;
        connectBtn.textContent = 'Reconnect Gmail';
      } else {
        statusEl.classList.add('hidden');
        connectBtn.textContent = 'Connect Gmail';
      }
    } catch (err) {
      console.error('Failed to check Gmail status:', err);
    }
  }

  async handleGmailConnect() {
    try {
      const res = await this.api('/api/gmail/auth', 'GET');
      window.location.href = res.authUrl;
    } catch (err) {
      this.showNotification(err.message || 'Failed to initiate Gmail connection', 'error');
    }
  }

  async handleGmailDisconnect() {
    if (!confirm('Are you sure you want to disconnect Gmail?')) return;

    try {
      await this.api('/api/gmail/disconnect', 'POST');
      await this.checkGmailStatus();
      this.showNotification('Gmail disconnected', 'success');
    } catch (err) {
      this.showNotification('Failed to disconnect Gmail', 'error');
    }
  }

  showComposeModal() {
    const warning = document.getElementById('compose-gmail-warning');
    const form = document.getElementById('compose-form');
    const sendBtn = document.getElementById('send-email-btn');

    if (!this.gmailConnected) {
      warning.classList.remove('hidden');
      sendBtn.disabled = true;
    } else {
      warning.classList.add('hidden');
      sendBtn.disabled = false;
    }

    this.showModal('compose-modal');
  }

  async handleSendEmail(e) {
    e.preventDefault();
    const to = document.getElementById('compose-to').value;
    const subject = document.getElementById('compose-subject').value;
    const body = document.getElementById('compose-body').value;

    const sendBtn = document.getElementById('send-email-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      await this.api('/api/gmail/send', 'POST', { to, subject, body });
      this.showNotification('Email sent successfully!', 'success');
      this.closeModals();
      document.getElementById('compose-form').reset();
      await this.loadEmails();
      await this.loadStats();
    } catch (err) {
      this.showNotification(err.message || 'Failed to send email', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send with Tracking';
    }
  }

  // Modal Methods
  showModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('pixel-result').classList.add('hidden');
    document.getElementById('create-form').reset();
  }

  // Utility Methods
  async api(url, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      // Handle token expiry
      if (data.code === 'TOKEN_EXPIRED' && this.refreshToken) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          return this.api(url, method, body);
        }
      }
      throw new Error(data.error || data.errors?.join(', ') || 'Request failed');
    }

    return data;
  }

  async tryRefreshToken() {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
      const data = await res.json();
      if (data.success) {
        this.setAuth(data);
        return true;
      }
    } catch {
      // Ignore
    }
    this.clearAuth();
    this.showAuth();
    return false;
  }

  copyToClipboard(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
      this.showNotification('Copied to clipboard!', 'success');
    });
  }

  showNotification(message, type = 'info') {
    // Simple notification - could be enhanced with a toast library
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      info: '#3b82f6'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${colors[type]};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new EmailTracker();

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(style);
