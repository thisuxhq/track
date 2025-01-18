#!/bin/bash

# Set your API endpoint
API_URL="https://your-worker.workers.dev"

# Track a play event
curl -X POST "$API_URL/track" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "play",
    "user_id": "user123",
    "metadata": {
      "song_id": "song456",
      "playlist": "workout_mix",
      "device": "iphone"
    }
  }'

# Track a stop event
curl -X POST "$API_URL/track" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "stop",
    "user_id": "user123",
    "metadata": {
      "song_id": "song456",
      "played_duration": 180
    }
  }'

# Get metrics for the last 7 days
START_DATE=$(date -v-7d +%Y-%m-%d)  # macOS
# START_DATE=$(date -d "7 days ago" +%Y-%m-%d)  # Linux
END_DATE=$(date +%Y-%m-%d)

curl "$API_URL/metrics?start_date=$START_DATE&end_date=$END_DATE&group_by=day&user_id=user123"

# Get session data for the last month
START_DATE=$(date -v-30d +%Y-%m-%d)  # macOS
# START_DATE=$(date -d "30 days ago" +%Y-%m-%d)  # Linux
END_DATE=$(date +%Y-%m-%d)

curl "$API_URL/sessions?start_date=$START_DATE&end_date=$END_DATE&group_by=week&user_id=user123"

# Test error cases
# Invalid date format
curl "$API_URL/metrics?start_date=2024-1-1&end_date=2024-01-10"

# Missing required dates
curl "$API_URL/metrics"

# Test metadata size limit
curl -X POST "$API_URL/track" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test",
    "user_id": "user123",
    "metadata": {
      "large_field": "'"$(printf 'x%.0s' {1..5000})"'"
    }
  }' 