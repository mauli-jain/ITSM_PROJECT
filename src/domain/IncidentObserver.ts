import { Notification } from '../types/itsm';

export interface IncidentEvent {
  eventName: 'INCIDENT_CREATED' | 'STATE_CHANGED' | 'TECHNICIAN_ASSIGNED' | 'SLA_BREACHED' | 'INCIDENT_CLOSED';
  incidentId: string;
  incidentTitle: string;
  previousState?: string;
  newState?: string;
  recipientId?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  priority?: string;
  details: string;
  timestamp: string;
}

/**
 * Observer Interface (GoF Observer Pattern)
 */
export interface IncidentObserver {
  readonly name: string;
  readonly channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'AUDIT';
  onIncidentEvent(event: IncidentEvent): void;
}

/**
 * Subject: EventBus with register / unregister / notify
 */
export class IncidentEventBus {
  private static instance: IncidentEventBus;
  private observers: IncidentObserver[] = [];
  private notificationHistory: Notification[] = [];

  private constructor() {
    // Automatically register default polymorphic observers
    this.register(inAppObserver);
    this.register(emailAdapter);
    this.register(smsAdapter);
    this.register(auditObserver);
  }

  public static getInstance(): IncidentEventBus {
    if (!IncidentEventBus.instance) {
      IncidentEventBus.instance = new IncidentEventBus();
    }
    return IncidentEventBus.instance;
  }

  private listeners: Map<string, Array<(event: IncidentEvent) => void>> = new Map();

  public register(observer: IncidentObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  public unregister(observer: IncidentObserver): void {
    this.observers = this.observers.filter((o) => o !== observer);
  }

  public on(eventPattern: string, callback: (event: IncidentEvent) => void): void {
    const list = this.listeners.get(eventPattern) || [];
    list.push(callback);
    this.listeners.set(eventPattern, list);
  }

  public off(eventPattern: string, callback: (event: IncidentEvent) => void): void {
    const list = this.listeners.get(eventPattern) || [];
    this.listeners.set(
      eventPattern,
      list.filter((cb) => cb !== callback)
    );
  }

  public notify(event: IncidentEvent): void {
    for (const observer of this.observers) {
      try {
        observer.onIncidentEvent(event);
      } catch (err) {
        console.error(`Observer [${observer.name}] error handling event:`, err);
      }
    }

    const allListeners = this.listeners.get('ALL') || [];
    for (const cb of allListeners) {
      try {
        cb(event);
      } catch (err) {
        console.error('EventBus listener error:', err);
      }
    }

    const specificListeners = this.listeners.get(event.eventName) || [];
    for (const cb of specificListeners) {
      try {
        cb(event);
      } catch (err) {
        console.error('EventBus listener error:', err);
      }
    }
  }

  public recordNotification(notification: Notification): void {
    this.notificationHistory.unshift(notification);
    if (this.notificationHistory.length > 50) {
      this.notificationHistory.pop();
    }
  }

  public getNotificationHistory(): Notification[] {
    return [...this.notificationHistory];
  }
}

/**
 * 1. In-App Notification Observer
 */
export class InAppNotificationObserver implements IncidentObserver {
  public readonly name = 'InAppNotifier';
  public readonly channel = 'IN_APP';

  public onIncidentEvent(event: IncidentEvent): void {
    const notif: Notification = {
      id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recipientId: event.recipientId || 'BROADCAST',
      recipientName: event.recipientName || 'All Operators',
      channel: 'IN_APP',
      title: `[${event.eventName}] ${event.incidentId}`,
      message: `${event.incidentTitle}: ${event.details}`,
      timestamp: 'Just now',
      read: false,
    };
    IncidentEventBus.getInstance().recordNotification(notif);
  }
}

/**
 * 2. Email Adapter Observer (Simulated SMTP adapter)
 */
export class EmailNotificationAdapter implements IncidentObserver {
  public readonly name = 'EmailNotificationAdapter';
  public readonly channel = 'EMAIL';
  public sentEmails: Array<{ to: string; subject: string; body: string; sentAt: string }> = [];

  public onIncidentEvent(event: IncidentEvent): void {
    const recipientEmail = event.recipientEmail || `${event.recipientId || 'tech'}@iitsm.corp`;
    const subject = `[I-ITSM ALERT ${event.priority || 'P1'}] ${event.incidentId}: ${event.eventName}`;
    const body = `Dear ${event.recipientName || 'Team Member'},\n\nAn ITSM lifecycle event occurred on incident ${event.incidentId}.\nDetails: ${event.details}\nStatus: ${event.newState || 'UPDATED'}\nTimestamp: ${event.timestamp}\n\nPlease review your assigned console immediately.\nI-ITSM Dispatch Daemon`;

    this.sentEmails.unshift({
      to: recipientEmail,
      subject,
      body,
      sentAt: new Date().toISOString(),
    });

    const notif: Notification = {
      id: `EMAIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      recipientId: event.recipientId || 'BROADCAST',
      recipientName: `${event.recipientName || 'User'} (${recipientEmail})`,
      channel: 'EMAIL',
      title: `EMAIL DISPATCHED: ${subject}`,
      message: body.slice(0, 160) + '...',
      timestamp: 'Just now',
      read: false,
    };
    IncidentEventBus.getInstance().recordNotification(notif);
  }
}

/**
 * 3. SMS Adapter Observer (Simulated Telephony / Twilio adapter)
 */
export class SmsNotificationAdapter implements IncidentObserver {
  public readonly name = 'SmsNotificationAdapter';
  public readonly channel = 'SMS';
  public sentSms: Array<{ to: string; text: string; sentAt: string }> = [];

  public onIncidentEvent(event: IncidentEvent): void {
    // Only send SMS for critical P1/P2 or SLA Breaches
    if (event.priority === 'P1' || event.eventName === 'SLA_BREACHED') {
      const recipientPhone = event.recipientPhone || '+1 (555) 019-4821';
      const text = `[CRITICAL ITSM] ${event.incidentId} (${event.priority}): ${event.details.slice(0, 80)}`;

      this.sentSms.unshift({
        to: recipientPhone,
        text,
        sentAt: new Date().toISOString(),
      });

      const notif: Notification = {
        id: `SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipientId: event.recipientId || 'PAGER_DUTY',
        recipientName: `${event.recipientName || 'On-Call Lead'} (${recipientPhone})`,
        channel: 'SMS',
        title: `SMS DISPATCHED: Urgent Alert`,
        message: text,
        timestamp: 'Just now',
        read: false,
      };
      IncidentEventBus.getInstance().recordNotification(notif);
    }
  }
}

/**
 * 4. Audit Observer
 */
export class AuditObserver implements IncidentObserver {
  public readonly name = 'AuditObserver';
  public readonly channel = 'AUDIT';
  public auditLogs: IncidentEvent[] = [];

  public onIncidentEvent(event: IncidentEvent): void {
    this.auditLogs.unshift(event);
  }
}

// Global Observer Singletons
export const inAppObserver = new InAppNotificationObserver();
export const emailAdapter = new EmailNotificationAdapter();
export const smsAdapter = new SmsNotificationAdapter();
export const auditObserver = new AuditObserver();

/**
 * Universal Event Dispatcher for the entire application
 */
export function dispatchIncidentEvent(event: IncidentEvent): void {
  IncidentEventBus.getInstance().notify(event);
}

