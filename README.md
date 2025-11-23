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

## Security Considerations

- Always use HTTPS in production
- Change `JWT_SECRET` to a strong random string
- Configure proper `CORS_ORIGIN` for production
- The tracking pixel endpoint is public (required for email tracking)
- Consider rate limiting adjustments for your use case

## License

MIT
