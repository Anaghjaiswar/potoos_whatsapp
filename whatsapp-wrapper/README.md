# WhatsApp Business Integration API

A production-ready WhatsApp API wrapper that enables businesses to integrate WhatsApp messaging into their existing systems. Built with `@whiskeysockets/baileys` v7, this solution provides a reliable HTTP API for automated customer communication, with persistent sessions and webhook notifications.

## Business Benefits

- **Customer Communication**: Automate responses and engage with customers via WhatsApp
- **File Sharing**: Send product catalogs, invoices, and marketing materials
- **Webhook Integration**: Receive customer messages directly in your CRM/backend
- **Reliable Connection**: Auto-reconnecting sessions with PostgreSQL persistence
- **Easy Deployment**: Production-ready Docker setup
- **Media Support**: Send images, videos, documents with auto-type detection
- **Scalable**: Handle multiple customer conversations reliably

## Business Integration Guide

### 1. Deploy the API

```bash
# Clone and setup
git clone https://github.com/sujaybadge/whatsapp-wrapper.git
cd whatsapp-wrapper
cp .env.example .env

# Configure your environment
nano .env  # or use your preferred editor

# Deploy with Docker
docker-compose up -d
```

### 2. Configure Your Environment

In your `.env` file:
```env
# API Configuration
PORT=3000                    # Your preferred port
POSTBACK_URL=https://your-domain.com/crm/whatsapp/webhook  # Your backend webhook

# Database Configuration
PGHOST=postgres
PGPORT=5432
PGUSER=your_user
PGPASSWORD=strong_password
PGDATABASE=whatsapp_db
```

### 3. Connect Your WhatsApp Account

1. Access the QR code at `http://your-domain.com/qr.png`
2. Scan with your business WhatsApp account
3. Wait for the "✅ WhatsApp connected" message in logs

### 4. Integrate with Your Backend

1. Set up a webhook endpoint in your backend (e.g., `/crm/whatsapp/webhook`)
2. Update `POSTBACK_URL` to point to your webhook
3. Start sending messages using the API endpoints

## Business Integration Examples

### 1. Customer Service Automation

Send automated welcome message:
```http
POST /sendText
Content-Type: application/json

{
    "jid": "911234567890@s.whatsapp.net",
    "text": "Welcome to ACME Corp! How can we assist you today?"
}
```

### 2. Product Catalog Distribution

Send product brochure:
```http
POST /sendFile
Content-Type: multipart/form-data

file: [product-catalog.pdf]
jid: 911234567890@s.whatsapp.net
caption: Our latest product catalog with special offers!
fileName: ACME-Catalog-2025.pdf
```

### 3. Order Updates

Send order confirmation:
```http
POST /sendText
Content-Type: application/json

{
    "jid": "911234567890@s.whatsapp.net",
    "text": "Your order #12345 has been confirmed!\n\nTotal: $99.99\nDelivery: 2-3 business days\n\nTrack your order: https://track.acme.com/12345"
}
```

### 4. Receiving Customer Messages

Your webhook endpoint will receive customer messages:

```json
{
  "messages": [{
    "key": {
      "remoteJid": "911234567890@s.whatsapp.net",
      "fromMe": false,
      "id": "ABCD1234..."
    },
    "message": {
      "conversation": "I'm interested in your products"
    },
    "messageTimestamp": "1635789456"
  }]
}
```

Process these messages in your backend to:
- Update your CRM
- Trigger automated responses
- Create support tickets
- Update order status
```

## Integration Guide for Developers

### API Endpoints

| Endpoint | Method | Description | Use Case |
|----------|--------|-------------|-----------|
| `/sendText` | POST | Send text message | Customer notifications, order updates |
| `/sendFile` | POST | Send media files | Product catalogs, invoices, marketing materials |
| `/qr.png` | GET | Get QR code | Initial account connection |
| `/` | GET | Health check | Monitor API status |

### Supported File Types

The API automatically handles different file types:

| Type | MIME Pattern | Use Case |
|------|-------------|-----------|
| Images | `image/*` | Product photos, marketing visuals |
| Videos | `video/*` | Product demos, tutorials |
| Audio | `audio/*` | Voice messages, announcements |
| Documents | others | Catalogs, invoices, contracts |

### Backend Integration

1. **Webhook Setup**
   ```javascript
   // Example Express.js webhook handler
   app.post('/crm/whatsapp/webhook', (req, res) => {
     const { messages } = req.body;
     messages.forEach(msg => {
       // Handle different message types
       if (msg.message?.conversation) {
         handleCustomerMessage(msg);
       } else if (msg.message?.imageMessage) {
         handleCustomerImage(msg);
       }
     });
     res.status(200).send('OK');
   });
   ```

2. **Sending Messages**
   ```javascript
   // Example message sender
   async function sendOrderUpdate(phone, orderId, status) {
     await fetch('http://your-whatsapp-api:3000/sendText', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         jid: `${phone}@s.whatsapp.net`,
         text: `Order #${orderId} status: ${status}`
       })
     });
   }
   ```

## Common Business Integration Patterns

### 1. E-commerce Integration

```javascript
// Order confirmation
async function sendOrderConfirmation(orderDetails) {
  await fetch('http://your-whatsapp-api:3000/sendText', {
    method: 'POST',
    body: JSON.stringify({
      jid: `${orderDetails.phone}@s.whatsapp.net`,
      text: `Order Confirmed! #${orderDetails.orderId}\n` +
            `Total: $${orderDetails.total}\n` +
            `Delivery: ${orderDetails.deliveryDate}\n\n` +
            `Track your order: ${orderDetails.trackingUrl}`
    })
  });
}

// Send invoice
async function sendInvoice(orderDetails) {
  const formData = new FormData();
  formData.append('file', invoicePdf);
  formData.append('jid', `${orderDetails.phone}@s.whatsapp.net`);
  formData.append('caption', `Invoice for Order #${orderDetails.orderId}`);
  
  await fetch('http://your-whatsapp-api:3000/sendFile', {
    method: 'POST',
    body: formData
  });
}
```

### 2. Customer Service Integration

```javascript
// Handle incoming customer messages
app.post('/whatsapp/webhook', async (req, res) => {
  const { messages } = req.body;
  
  for (const msg of messages) {
    const customerId = msg.key.remoteJid.split('@')[0];
    const text = msg.message.conversation;
    
    // Create ticket in your CRM
    await createTicket({
      customerId,
      message: text,
      channel: 'whatsapp',
      timestamp: msg.messageTimestamp
    });
    
    // Send automated response
    await sendAutoResponse(customerId);
  }
  
  res.status(200).send('OK');
});
```

### 3. Marketing Campaigns

```javascript
// Send bulk promotional message
async function sendPromotion(customerList, promoDetails) {
  for (const customer of customerList) {
    await fetch('http://your-whatsapp-api:3000/sendFile', {
      method: 'POST',
      body: createFormData({
        file: promoDetails.banner,
        jid: `${customer.phone}@s.whatsapp.net`,
        caption: promoDetails.message
      })
    });
    
    // Rate limiting to avoid blocking
    await sleep(1000);
  }
}
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| PORT | API port | 3000 |
| PGHOST | PostgreSQL host | postgres |
| PGPORT | PostgreSQL port | 5432 |
| PGUSER | PostgreSQL user | baileys |
| PGPASSWORD | PostgreSQL password | baileys |
| PGDATABASE | PostgreSQL database | baileys |
| POSTBACK_URL | Webhook URL | http://localhost:3000/webhook |

## Production Deployment Tips

### 1. Security Considerations

- Deploy behind a reverse proxy (Nginx/Apache)
- Enable HTTPS with valid SSL certificate
- Implement API authentication
- Set up rate limiting
- Monitor webhook endpoints
- Regularly backup PostgreSQL data

### 2. High Availability Setup

```nginx
# Example Nginx configuration
server {
    listen 443 ssl;
    server_name whatsapp-api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/whatsapp-api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/whatsapp-api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Monitoring & Troubleshooting

Watch for these logs:
- "✅ WhatsApp connected" - Ready to send/receive
- "⚠️ Connection closed" - Check internet/reconnecting
- "Logged out" - Need to re-scan QR

Common issues:
1. **Message Delivery**
   - Verify phone numbers format (include country code)
   - Check connection status
   - Monitor rate limits

2. **File Sending**
   - Keep files under 16MB
   - Ensure supported MIME types
   - Use appropriate file extensions

## Contributing
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
MIT

---

*Note: This is an unofficial wrapper for WhatsApp. Use responsibly and in compliance with WhatsApp's terms of service.*
