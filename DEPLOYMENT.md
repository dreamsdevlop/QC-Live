# QC Live - Deployment Guide

## Pre-Deployment Checklist

- [ ] FFmpeg installed on server
- [ ] Node.js 18+ installed
- [ ] Sufficient disk space for videos
- [ ] Adequate upload bandwidth (3-5 Mbps per stream)
- [ ] SSL certificate configured (for HTTPS)

## Vercel deployment

Vercel is suitable for the QC Live web dashboard and short-lived API requests, but it is not suitable for the FFmpeg process, large persistent video uploads, SQLite, or a 24/7 stream worker. Deploy the dashboard from `dreamsdevlop/QC-Live` as a Next.js project and configure these server-side environment variables in Vercel:

The repository pins Vercel builds to Node 24, which is the runtime currently required by the Vercel builder, and removes the unused `better-sqlite3` package that previously failed to compile. Pushes to `main` should deploy the current commit; if the Vercel dashboard still shows an older commit, trigger a redeploy from the latest GitHub commit rather than redeploying the old deployment.

```env
SESSION_SECRET=<32-or-more-random-characters>
ADMIN_USERNAME=<admin-login>
ADMIN_PASSWORD_HASH=<bcrypt-hash>
SUPABASE_URL=https://rirngdknrszxkgdjcrcv.supabase.co
SUPABASE_ANON_KEY=<public-anon-key>
SUPABASE_AUTH_REDIRECT_URL=https://your-domain.example.com/auth/login
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
CHANNEL_ENCRYPTION_SECRET=<32-or-more-random-characters>
```

For production, run the existing Node.js/FFmpeg application as a persistent worker with durable `data/` and `public/uploads/` storage, automatic restart, and outbound bandwidth for every simultaneous platform. Keep the Vercel dashboard and worker behind the same protected domain or add a server-side worker API URL before exposing remote stream controls.

Do not deploy `SUPABASE_SERVICE_ROLE_KEY` as a public environment variable. Do not expect Vercel serverless functions to keep FFmpeg alive after a request finishes.

## Quick Deployment

### 1. Clone and Setup

```bash
git clone https://github.com/your-repo/qc-live.git
cd qc-live
npm run setup
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Generate a secure password hash:
```bash
npm run generate-password
```

Edit `.env.local`:
```env
SESSION_SECRET=<generate-with-openssl-rand-base64-32>
ADMIN_USERNAME=your-username
ADMIN_PASSWORD_HASH=<hash-from-generate-password>
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are the canonical variables. Older
deployments may use `AUTH_USERNAME` and `AUTH_PASSWORD`, but do not define both
sets with different values because the `ADMIN_*` values take precedence.

For the dedicated PyRunner media worker, configure these server-side variables
in QC Live:

```env
MEDIA_WORKER_URL=https://your-private-worker.example.com
MEDIA_WORKER_TOKEN=<long-random-worker-token>
MEDIA_WORKER_MEDIA_ROOT=/srv/qc-live-media
```

Configure the same token in PyRunner as `MEDIA_WORKER_TOKEN`. The worker must
have FFmpeg installed, durable media access, automatic restart, and sufficient
CPU, memory, disk, and outbound bandwidth. Do not expose the worker API to the
public internet without network controls and token authentication.

To enable passwordless login, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the
deployment, add the exact `SUPABASE_AUTH_REDIRECT_URL` to Supabase Auth's
allowed redirect URLs, and provision the permitted user in Supabase Auth. The
login page then sends a single-use, expiring email link. The link is exchanged
server-side for the normal QC Live session; no Supabase access token is stored
in the QC Live session cookie.

### 3. Build and Start

```bash
npm run build
npm start
```

## Docker Deployment

### Quick Start
```bash
docker-compose -f docker-compose.production.yml up -d
```

### With Custom Environment
```bash
# Create .env file with your settings
docker-compose -f docker-compose.production.yml --env-file .env up -d
```

## Production with PM2

### Install PM2
```bash
npm install -g pm2
```

### Create ecosystem file
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'qc-live',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

### Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 5G;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

## Post-Deployment

### 1. Test Health Endpoint
```bash
curl http://localhost:3000/api/health
```

### 2. Create First Stream
1. Login at https://yourdomain.com/auth/login
2. Upload a video
3. Create a stream
4. Start streaming!

### 3. Monitor Logs
```bash
# PM2
pm2 logs qc-live

# Docker
docker-compose -f docker-compose.production.yml logs -f

# System logs
tail -f logs/combined.log
```

## Backup Strategy

### Database Backup
```bash
# Backup
cp data/streams.db data/streams.db.backup

# Restore
cp data/streams.db.backup data/streams.db
```

### Video Backup
```bash
# Backup uploads
tar -czf uploads-backup.tar.gz uploads/

# Restore
tar -xzf uploads-backup.tar.gz
```

## Troubleshooting

### Stream Won't Start
- Check FFmpeg is installed: `ffmpeg -version`
- Verify RTMP URL is correct
- Check system resources: `top` or `htop`
- Review logs for errors

### Upload Fails
- Check disk space: `df -h`
- Verify upload directory permissions: `ls -la uploads/`
- Check Nginx client_max_body_size

### High CPU Usage
- Limit concurrent streams
- Use lower quality settings
- Check for runaway FFmpeg processes: `ps aux | grep ffmpeg`

## Security Hardening

1. **Change default credentials immediately**
2. **Use strong SESSION_SECRET** (32+ characters)
3. **Enable firewall** (allow only 80, 443, SSH)
4. **Regular updates**: `npm audit fix`
5. **Monitor access logs**
6. **Set up fail2ban for brute force protection**

## Performance Tuning

### System Limits
```bash
# /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535
```

### Sysctl Optimizations
```bash
# /etc/sysctl.conf
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
```

### Node.js Optimizations
```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## Monitoring

### Set up monitoring with:
- **Uptime monitoring**: UptimeRobot, Pingdom
- **Resource monitoring**: Netdata, Grafana
- **Log aggregation**: ELK Stack, Papertrail
- **Error tracking**: Sentry

## Support

For issues or questions:
- Check logs first
- Review troubleshooting section
- Create GitHub issue with details

---

© 2024 QC Live by Himanshu-HIVEcorp
