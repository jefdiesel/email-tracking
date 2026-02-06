// Email Tracker Frontend Application

class EmailTracker {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.gmailConnected = false;
    this.currentPage = 1;
    this.selectedFiles = []; // Accumulate files across selections

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
    document.getElementById('compose-attachments').addEventListener('change', (e) => this.updateAttachmentList(e));

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

        ${email.attachments && email.attachments.length > 0 ? `
          <div class="attachments-section">
            <h4>Attachments (${email.attachments.length})</h4>
            ${email.attachments.map(att => `
              <div class="attachment-card">
                <div class="attachment-header">
                  <span class="attachment-name">📎 ${this.escapeHtml(att.filename)}</span>
                  <span class="attachment-size">${this.formatFileSize(att.size)}</span>
                  <span class="badge ${att.downloadCount > 0 ? 'badge-success' : 'badge-warning'}">
                    ${att.downloadCount} downloads
                  </span>
                </div>
                ${att.downloads && att.downloads.length > 0 ? `
                  <div class="attachment-downloads">
                    ${att.downloads.map(dl => `
                      <div class="download-item ${dl.device?.isBot || dl.location?.city?.includes('Scanner') ? 'scanner-item' : ''}">
                        <span class="download-ip">${dl.ip}</span>
                        ${dl.device?.isBot || dl.location?.city?.includes('Scanner') ? '<span class="badge badge-warning">Scanner</span>' : ''}
                        ${dl.location?.city?.includes('Proxy') ? '<span class="badge badge-info">Proxy</span>' : ''}
                        <span class="download-device">${dl.device?.browser || 'Unknown'} / ${dl.device?.os || 'Unknown'}</span>
                        <span class="download-location">${dl.location?.city || 'Unknown'}, ${dl.location?.country || 'Unknown'}</span>
                        <span class="download-time">${this.formatDate(dl.timestamp)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : '<p class="empty-state">No downloads yet</p>'}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="readers-section">
          <h4>Readers (${email.readers.length})</h4>
          ${email.readers.length === 0 ? '<p class="empty-state">No readers yet</p>' :
            email.readers.map(reader => `
              <div class="reader-card">
                <div class="reader-header">
                  <span class="reader-ip">${reader.ip}</span>
                  <span class="reader-count">${reader.openCount} opens</span>
                  ${reader.device?.isBot ? '<span class="badge badge-warning">Bot</span>' : ''}
                  ${reader.location?.isProxy ? '<span class="badge badge-warning">Proxy/VPN</span>' : ''}
                  ${reader.location?.isHosting ? '<span class="badge badge-info">Hosting/DC</span>' : ''}
                </div>
                <div class="reader-location">
                  <strong>Location:</strong> ${reader.location.city}, ${reader.location.region}, ${reader.location.country}
                  ${reader.location.countryCode ? `(${reader.location.countryCode})` : ''}
                  ${reader.location.timezone ? `· ${reader.location.timezone}` : ''}
                </div>
                <div class="reader-device">
                  ${reader.device?.isProxy || reader.location?.city?.includes('Proxy') ? `
                    <strong>Device:</strong> <em>Hidden by ${reader.location?.city || 'Email Proxy'}</em>
                    <span class="proxy-note">(Email providers hide real device/location info)</span>
                  ` : `
                    <strong>Device:</strong> ${reader.device?.deviceType || 'Unknown'}
                    ${reader.location?.isMobile ? '(Mobile Network)' : ''}
                    · ${reader.device?.browser || 'Unknown'}${reader.device?.browserVersion ? ' ' + reader.device.browserVersion : ''}
                    · ${reader.device?.os || 'Unknown'}${reader.device?.osVersion ? ' ' + reader.device.osVersion : ''}
                  `}
                </div>
                <div class="reader-network">
                  <strong>Network:</strong> ${reader.location.isp !== 'Unknown' ? reader.location.isp : ''}
                  ${reader.location.org && reader.location.org !== reader.location.isp ? `(${reader.location.org})` : ''}
                </div>
                ${reader.device?.language ? `<div class="reader-lang"><strong>Language:</strong> ${reader.device.language}</div>` : ''}
                ${reader.location.lat && reader.location.lon ? `
                  <div class="reader-coords">
                    <strong>Coords:</strong> ${reader.location.lat.toFixed(4)}, ${reader.location.lon.toFixed(4)}
                    <a href="https://maps.google.com/?q=${reader.location.lat},${reader.location.lon}" target="_blank" class="map-link">View Map</a>
                  </div>
                ` : ''}
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

    // Clear any previous attachments
    this.selectedFiles = [];
    document.getElementById('attachment-list').innerHTML = '';

    this.showModal('compose-modal');
  }

  updateAttachmentList() {
    const input = document.getElementById('compose-attachments');
    const listEl = document.getElementById('attachment-list');

    // Add newly selected files to our accumulated list
    for (const file of input.files) {
      // Avoid duplicates by name
      if (!this.selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        this.selectedFiles.push(file);
      }
    }

    // Clear the input so the same file can be re-selected if removed
    input.value = '';

    this.renderAttachmentList();
  }

  renderAttachmentList() {
    const listEl = document.getElementById('attachment-list');

    if (this.selectedFiles.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = this.selectedFiles.map((f, idx) => {
      const size = f.size < 1024 * 1024
        ? (f.size / 1024).toFixed(1) + ' KB'
        : (f.size / (1024 * 1024)).toFixed(1) + ' MB';
      return `<span class="attachment-chip">${this.escapeHtml(f.name)} (${size}) <button type="button" class="remove-attachment" data-idx="${idx}">&times;</button></span>`;
    }).join('');

    // Add remove handlers
    listEl.querySelectorAll('.remove-attachment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.idx);
        this.selectedFiles.splice(idx, 1);
        this.renderAttachmentList();
      });
    });
  }

  async handleSendEmail(e) {
    e.preventDefault();
    const to = document.getElementById('compose-to').value;
    const cc = document.getElementById('compose-cc').value;
    const bcc = document.getElementById('compose-bcc').value;
    const subject = document.getElementById('compose-subject').value;
    const body = document.getElementById('compose-body').value;

    const sendBtn = document.getElementById('send-email-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const formData = new FormData();
      formData.append('to', to);
      formData.append('cc', cc);
      formData.append('bcc', bcc);
      formData.append('subject', subject);
      formData.append('body', body);

      for (const file of this.selectedFiles) {
        formData.append('attachments', file);
      }

      await this.api('/api/gmail/send', 'POST', formData);
      this.showNotification('Email sent successfully!', 'success');
      this.closeModals();
      document.getElementById('compose-form').reset();
      this.selectedFiles = [];
      document.getElementById('attachment-list').innerHTML = '';
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
    const headers = {};
    const isFormData = body instanceof FormData;

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = isFormData ? body : JSON.stringify(body);
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
    if (!dateString) return '-';
    const date = new Date(dateString);

    // Check for invalid date
    if (isNaN(date.getTime())) return dateString;

    // API returns timestamps already adjusted - just format in local timezone
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
