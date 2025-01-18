import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

interface Env {
  ANALYTICS_KV: KVNamespace;
}

type GroupBy = 'day' | 'week' | 'month';

interface Event {
  event: string;
  user_id: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface Session {
  startTime: string;
  endTime?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

interface MetricData {
  [key: string]: number;
}

const MAX_METADATA_SIZE = 4 * 1024; // 4KB

const trackEventSchema = z.object({
  event: z.string(),
  user_id: z.string(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const metricsQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group_by: z.enum(['day', 'week', 'month']).optional(),
  user_id: z.string().optional(),
});

const app = new Hono<{ Bindings: Env }>();

// Helper functions
const generateEventKey = (userId: string, timestamp: string, event: string) => 
  `event:${userId}:${timestamp}:${event}`;

const generateMetricKey = (date: string, event: string, userId?: string) => 
  userId ? `metric:${date}:${event}:${userId}` : `metric:${date}:${event}`;

const generateSessionKey = (userId: string, timestamp: string) => 
  `session:${userId}:${timestamp}`;

const truncateToDay = (date: Date) => 
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().split('T')[0];

const groupByTimeInterval = (date: Date, interval: GroupBy = 'day'): string => {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  switch (interval) {
    case 'month':
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    case 'week': {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return truncateToDay(weekStart);
    }
    default:
      return truncateToDay(date);
  }
};

const validateMetadata = (metadata?: Record<string, any>): Record<string, any> | undefined => {
  if (!metadata) return undefined;
  
  const size = new TextEncoder().encode(JSON.stringify(metadata)).length;
  if (size > MAX_METADATA_SIZE) {
    // Truncate metadata if too large
    return { 
      warning: 'Metadata truncated due to size limit',
      originalSize: size 
    };
  }
  return metadata;
};

// Track endpoint
app.post('/track', zValidator('json', trackEventSchema), async (c) => {
  const body = c.req.valid('json');
  const now = new Date();
  const timestamp = body.timestamp ? new Date(body.timestamp) > now ? 
    now.toISOString() : body.timestamp : 
    now.toISOString();

  const metadata = validateMetadata(body.metadata);
  const eventKey = generateEventKey(body.user_id, timestamp, body.event);

  try {
    // Store the event
    await c.env.ANALYTICS_KV.put(eventKey, JSON.stringify({
      ...body,
      timestamp,
      metadata,
    }), { expirationTtl: 60 * 60 * 24 * 30 }); // 30 days

    // Update metrics
    const dateKey = truncateToDay(new Date(timestamp));
    const metricKey = generateMetricKey(dateKey, body.event, body.user_id);
    const currentCount = Number(await c.env.ANALYTICS_KV.get(metricKey) || '0');
    await c.env.ANALYTICS_KV.put(metricKey, String(currentCount + 1));

    // Handle session tracking for play/stop events
    if (body.event === 'play') {
      const sessionKey = generateSessionKey(body.user_id, timestamp);
      await c.env.ANALYTICS_KV.put(sessionKey, JSON.stringify({
        startTime: timestamp,
        metadata,
      }));
    } else if (body.event === 'stop') {
      const sessions = await c.env.ANALYTICS_KV.list({ 
        prefix: `session:${body.user_id}:`,
        limit: 1,
      });
      
      if (sessions.keys.length > 0) {
        const sessionKey = sessions.keys[0].name;
        const sessionData = JSON.parse(await c.env.ANALYTICS_KV.get(sessionKey) || '{}') as Session;
        
        if (!sessionData.endTime) {
          const duration = (new Date(timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000;
          await c.env.ANALYTICS_KV.put(sessionKey, JSON.stringify({
            ...sessionData,
            endTime: timestamp,
            duration,
          }));
        }
      }
    }

    return c.json({ status: 'success', message: 'Event logged.' });
  } catch (error) {
    return c.json({ 
      status: 'error', 
      message: 'Failed to log event.' 
    }, 500);
  }
});

// Metrics endpoint
app.get('/metrics', zValidator('query', metricsQuerySchema), async (c) => {
  const { start_date, end_date, group_by = 'day', user_id } = c.req.valid('query');
  
  try {
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const metrics: Record<string, MetricData> = {};

    // List all metrics in the date range
    const prefix = 'metric:';
    const metricsList = await c.env.ANALYTICS_KV.list({ prefix });

    for (const key of metricsList.keys) {
      const [, date, event, keyUserId] = key.name.split(':');
      
      if ((!user_id || keyUserId === user_id) && 
          new Date(date) >= startDate && 
          new Date(date) <= endDate) {
        
        const groupKey = groupByTimeInterval(new Date(date), group_by);
        if (!metrics[groupKey]) metrics[groupKey] = {};
        
        const count = Number(await c.env.ANALYTICS_KV.get(key.name) || '0');
        metrics[groupKey][event] = (metrics[groupKey][event] || 0) + count;
      }
    }

    const formattedData = Object.entries(metrics)
      .map(([date, events]) => ({ date, ...events }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ status: 'success', data: formattedData });
  } catch (error) {
    return c.json({ 
      status: 'error', 
      message: 'Failed to fetch metrics.' 
    }, 500);
  }
});

// Sessions endpoint
app.get('/sessions', zValidator('query', metricsQuerySchema), async (c) => {
  const { start_date, end_date, group_by = 'day', user_id } = c.req.valid('query');

  try {
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const sessionData: Record<string, {
      totalDuration: number;
      sessionCount: number;
      averageDuration: number;
    }> = {};

    const prefix = user_id ? `session:${user_id}:` : 'session:';
    const sessions = await c.env.ANALYTICS_KV.list({ prefix });

    for (const key of sessions.keys) {
      const data = JSON.parse(await c.env.ANALYTICS_KV.get(key.name) || '{}') as Session;
      
      if (!data.duration || !data.startTime || !data.endTime) continue;

      const sessionDate = new Date(data.startTime);
      if (sessionDate < startDate || sessionDate > endDate) continue;

      const groupKey = groupByTimeInterval(sessionDate, group_by);
      
      if (!sessionData[groupKey]) {
        sessionData[groupKey] = {
          totalDuration: 0,
          sessionCount: 0,
          averageDuration: 0,
        };
      }

      sessionData[groupKey].totalDuration += data.duration;
      sessionData[groupKey].sessionCount += 1;
    }

    // Calculate averages and format response
    const formattedData = Object.entries(sessionData)
      .map(([date, stats]) => ({
        date,
        totalDuration: Math.round(stats.totalDuration),
        sessionCount: stats.sessionCount,
        averageDuration: Math.round(stats.totalDuration / stats.sessionCount),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ status: 'success', data: formattedData });
  } catch (error) {
    return c.json({ 
      status: 'error', 
      message: 'Failed to fetch session metrics.' 
    }, 500);
  }
});

export default app;