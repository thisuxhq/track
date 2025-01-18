# Analytics API Documentation

A simple and powerful analytics API built with Cloudflare Workers, KV storage, and Hono.js. Track any kind of user events, calculate session durations, and get insights about user behavior.

## 🚀 Quick Start

1. Install the dependencies:
```bash
npm install hono @hono/zod-validator zod
```

2. Set up your Cloudflare Worker:
```bash
npm install -g wrangler
wrangler login
```

3. Create a KV namespace:
```bash
wrangler kv:namespace create "ANALYTICS_KV"
```

4. Set up your configuration:
```bash
# Copy the example config
cp wrangler.toml.example wrangler.toml

# Update wrangler.toml with your KV namespace IDs and other settings
```

Example wrangler.toml structure:
```toml
name = "analytics-api"
main = "src/index.ts"
compatibility_date = "2024-01-18"

[[kv_namespaces]]
binding = "ANALYTICS_KV"
id = "your-kv-namespace-id"        # Replace with your production KV ID
preview_id = "your-preview-id"     # Replace with your preview KV ID
```

5. Deploy:
```bash
wrangler deploy
```

## 📝 API Reference

### Track Events (POST /track)

Used to log any type of event. Events are stored with metadata and automatically expire after 30 days.

#### Example Request

```http
POST /track

{
  "event": "play",
  "user_id": "user123",
  "timestamp": "2025-01-18T14:30:00Z",
  "metadata": {
    "song_id": "song456",
    "device": "mobile",
    "platform": "ios"
  }
}
```

Response:
```json
{
  "status": "success",
  "message": "Event logged."
}
```

#### What You Need to Know About Tracking
- `timestamp` is optional - defaults to server time
- Future timestamps are automatically set to current server time
- `metadata` is optional and limited to 4KB
- If metadata exceeds 4KB, it's truncated with a warning
- Each event is stored for 30 days
- Events are automatically counted for metrics

### Get Event Counts (GET /metrics)

Get counts of different events over time, grouped by day, week, or month.

```http
GET /metrics?start_date=2025-01-01&end_date=2025-01-31&group_by=day&user_id=user123
```

Required parameters:
- `start_date`: YYYY-MM-DD format
- `end_date`: YYYY-MM-DD format

Optional parameters:
- `group_by`: "day" (default), "week", or "month"
- `user_id`: Filter metrics for specific user

Response:
```json
{
  "status": "success",
  "data": [
    {
      "date": "2025-01-01",
      "play": 24,
      "stop": 22,
      "pause": 5
    }
  ]
}
```

### Get Session Data (GET /sessions)

Get session statistics grouped by time period. Sessions are created from play/stop event pairs.

```http
GET /sessions?start_date=2025-01-01&end_date=2025-01-31&group_by=day&user_id=user123
```

Required parameters:
- `start_date`: YYYY-MM-DD format
- `end_date`: YYYY-MM-DD format

Optional parameters:
- `group_by`: "day" (default), "week", or "month"
- `user_id`: Filter sessions for specific user

Response:
```json
{
  "status": "success",
  "data": [
    {
      "date": "2025-01-01",
      "totalDuration": 7200,
      "sessionCount": 15,
      "averageDuration": 480
    }
  ]
}
```

## 🤔 Common Questions and Edge Cases

### What happens if...

**The same user starts multiple sessions?**
- Each play/stop pair creates a separate session
- We match each stop event with the most recent play event for that user

**A stop event comes without a play event?**
- The stop event is logged but no session is created
- This won't break anything, but won't show up in session stats

**A play event never gets a stop event?**
- The play event is logged but no session duration is calculated
- These incomplete sessions won't appear in session stats

**The timestamp is in the future?**
- The event is logged but marked with the server time instead
- A warning is added to the metadata

**The metadata is really large?**
- There's a 4KB limit on metadata size
- If exceeded, the event is logged but metadata is truncated

### Tips for Best Results

1. Always use consistent user IDs for the same user
2. Send events in real-time when possible
3. Include relevant metadata that you might want to analyze later
4. Use descriptive event names (like "play", "pause", "skip" instead of "event1", "event2")
5. Keep metadata size reasonable (under 4KB)

## 🔍 Example Use Cases

### Music App
```json
// Track song play
POST /track
{
  "event": "play",
  "user_id": "user123",
  "metadata": {
    "song_id": "song456",
    "playlist": "workout_mix",
    "device": "iphone"
  }
}

// Track song completion
POST /track
{
  "event": "complete",
  "user_id": "user123",
  "metadata": {
    "song_id": "song456",
    "listened_seconds": 180
  }
}
```

### E-commerce Site
```json
// Track product view
POST /track
{
  "event": "product_view",
  "user_id": "user123",
  "metadata": {
    "product_id": "prod789",
    "category": "electronics",
    "price": 299.99
  }
}

// Track purchase
POST /track
{
  "event": "purchase",
  "user_id": "user123",
  "metadata": {
    "order_id": "order123",
    "total": 299.99,
    "items": ["prod789"]
  }
}
```

## ⚠️ Error Handling

All errors follow this format:
```json
{
  "status": "error",
  "message": "Description of what went wrong"
}
```

Common error messages:
- "Failed to log event"
- "Failed to fetch metrics"
- "Failed to fetch session metrics"
- "start_date and end_date are required"
- "Invalid date format. Use YYYY-MM-DD"

## 🔒 Rate Limits and Security

- Events expire after 30 days
- Metadata size limit: 4KB
- CORS is enabled for all origins
- SSL/TLS is required for all API calls

Need help? Found a bug? Check our GitHub issues or contact work@thisux.com

## 🧪 Testing

### Curl Examples

We provide a shell script with curl examples for testing all endpoints:

```bash
# Make the script executable
chmod +x examples.sh
./examples.sh
```

The script includes examples for:
- Tracking play/stop events
- Getting metrics with different time ranges
- Testing session analytics
- Testing error cases
- Testing metadata size limits

### Postman Collection

For easier testing, import our Postman collection:

1. Download `analytics-api.postman_collection.json`
2. Import into Postman
3. Set your `baseUrl` variable in the collection variables
4. Start testing!

The collection includes:
- Track Events (play, stop, future timestamps, large metadata)
- Get Metrics (daily, weekly, error cases)
- Get Sessions (daily, weekly aggregation)

## 👋 About Us

This repository is created by [ThisUX.com](https://thisux.com), a design studio specializing in building beautiful and functional apps. We combine technical excellence with stunning design to create exceptional user experiences.

Need help with your next project? [Schedule a 15-min call](https://cal.com/imsanju/15min) with us to discuss how we can help bring your vision to life.