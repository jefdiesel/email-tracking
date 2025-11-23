# Email Tracker

A secure, multi-user email tracking service with Gmail integration. Track when your emails are opened with pixel tracking, geolocation, and detailed analytics.

## Features

- **Multi-user Authentication**: Secure JWT-based auth with refresh tokens
- **Email Tracking**: Invisible 1x1 pixel tracking for email opens
- **Gmail Integration**: Send tracked emails directly via Gmail OAuth2
- **Geolocation**: Automatic IP-based location detection for opens
- **Forward Detection**: Identify when emails are forwarded (multiple unique IPs)
- **Analytics Dashboard**: View open rates, unique opens, and reader details
- **Rate Limiting**: Built-in protection against abuse
- **Security**: Helmet.js, CORS, input validation, and password hashing

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/jefdiesel/email-tracking.git
cd email-tracking

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start the server
npm start
```

The server will start at `http://localhost:3000`

## Gmail Integration Setup

To enable sending emails via Gmail:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Gmail API
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
5. Configure OAuth consent screen (External for testing)
6. Set **Authorized redirect URI** to: `http://localhost:3000/api/gmail/callback`
7. Copy the Client ID and Client Secret to your `.env` file

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `BASE_URL` | Public URL | `http://localhost:3000` |
| `JWT_SECRET` | JWT signing key | (required in production) |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `GMAIL_CLIENT_ID` | Google OAuth client ID | - |
| `GMAIL_CLIENT_SECRET` | Google OAuth secret | - |
| `GMAIL_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/api/gmail/callback` |

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/me` | Get current user |

### Tracking

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/track/create` | Create tracked email |
| GET | `/api/track/:id/pixel.png` | Tracking pixel (no auth) |
| GET | `/api/track/emails` | List tracked emails |
| GET | `/api/track/emails/:id` | Get email details |
| DELETE | `/api/track/emails/:id` | Delete tracked email |
| GET | `/api/track/stats` | Get tracking statistics |

### Gmail

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gmail/auth` | Get Gmail OAuth URL |
| GET | `/api/gmail/callback` | OAuth callback |
| GET | `/api/gmail/status` | Check Gmail connection |
| POST | `/api/gmail/disconnect` | Disconnect Gmail |
| POST | `/api/gmail/send` | Send tracked email |

## Remote Hosting

For production deployment:

1. Set `NODE_ENV=production`
2. Set a strong `JWT_SECRET`
3. Update `BASE_URL` to your domain
4. Configure `CORS_ORIGIN` to your frontend domain
5. Update `GMAIL_REDIRECT_URI` to your production callback URL
6. Use HTTPS (via reverse proxy like nginx)

### Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Security & Privacy Disclosure

### What Users Should Know

By using this service and connecting your Gmail account, you should understand:

#### Data We Collect

| Data | Purpose | Stored Where |
|------|---------|--------------|
| Email address & password | Account authentication | PostgreSQL (password hashed with bcrypt) |
| Gmail OAuth tokens | Send emails on your behalf | PostgreSQL database |
| Tracked email metadata | Subject, recipient, sender | PostgreSQL database |
| Email open events | IP address, location, user agent, timestamp | PostgreSQL database |

#### Gmail Access Scope

When you connect Gmail, you grant this app permission to:
- **Send emails as you** - The app can send emails from your Gmail account
- **See your email address** - Used to identify you as the sender

The app **cannot**:
- Read your inbox or existing emails
- Access your contacts
- Delete your emails
- Access your drafts

#### What the App Administrator Can Access

**The administrator of this application has full access to:**
- All user accounts and email addresses
- All Gmail OAuth tokens (can send emails as any connected user)
- All tracked email data and analytics
- All email open events with IP addresses and locations

**This means the admin can:**
- Send emails as any user who has connected Gmail
- See every email you track and who opened it
- See your IP-based location data

#### User Whitelist

Registration is restricted to a whitelist of approved email addresses. Only pre-approved users can create accounts.

#### Data Persistence

Data is stored in PostgreSQL and persists across restarts. There is no automatic data expiration or cleanup.

### Technical Security Measures

| Feature | Implementation |
|---------|----------------|
| Password Storage | bcrypt with 12 rounds |
| Authentication | JWT with 15min expiry + refresh tokens |
| Transport | HTTPS enforced in production |
| Rate Limiting | 100 requests/15min (10 for auth endpoints) |
| Input Validation | All endpoints validated |
| Security Headers | Helmet.js |
| CORS | Configurable origin restriction |

### Recommendations for Users

1. Only connect Gmail accounts you're comfortable the admin having send access to
2. Disconnect Gmail when not actively using the service
3. Be aware that your tracking data (who opens your emails) is visible to the admin
4. Use a strong, unique password for your account

### Revoking Access

You can revoke Gmail access at any time:
1. Go to [Google Account Security](https://myaccount.google.com/permissions)
2. Find this app and click "Remove Access"

This immediately invalidates the OAuth tokens stored in the database.

## License

MIT
