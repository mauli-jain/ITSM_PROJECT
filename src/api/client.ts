import {
  Category,
  Feedback,
  Incident,
  IncidentStatus,
  ITService,
  Priority,
  PriorityStrategyType,
  AssignmentStrategyType,
  Role,
  SLAPolicy,
  Technician,
  User,
} from '../types/itsm';

const TOKEN_KEY = 'iitsm_auth_token';
const USER_KEY = 'iitsm_active_user';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data: any
  ) {
    super(data?.error || data?.message || `API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private listeners401: Array<() => void> = [];

  public onUnauthorized(callback: () => void): () => void {
    this.listeners401.push(callback);
    return () => {
      this.listeners401 = this.listeners401.filter((cb) => cb !== callback);
    };
  }

  public getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  public setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  public clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    for (const listener of this.listeners401) {
      try {
        listener();
      } catch (err) {
        console.error('Error in 401 callback:', err);
      }
    }
  }

  public getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public setStoredUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearAuth();
      const errData = await response.json().catch(() => ({}));
      throw new ApiError(response.status, response.statusText, errData);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new ApiError(response.status, response.statusText, errData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // --- Auth API ---
  public auth = {
    login: async (username: string, password: string): Promise<{ token: string; user: User }> => {
      const res = await this.request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      this.setToken(res.token);
      this.setStoredUser(res.user);
      return res;
    },
    logout: async (): Promise<void> => {
      try {
        await this.request('/api/auth/logout', { method: 'POST' });
      } finally {
        this.clearAuth();
      }
    },
    getMe: async (): Promise<{ user: User }> => {
      return this.request<{ user: User }>('/api/auth/me');
    },
  };

  // --- Incidents API ---
  public incidents = {
    getAll: async (): Promise<Incident[]> => {
      return this.request<Incident[]>('/api/incidents');
    },
    getById: async (id: string): Promise<Incident> => {
      return this.request<Incident>(`/api/incidents/${id}`);
    },
    create: async (payload: {
      title: string;
      description: string;
      categoryId: string;
      serviceId: string;
      impact: string;
      urgency: string;
      businessCriticality: string;
      affectedUsersCount: number;
      priority?: string;
    }): Promise<Incident> => {
      return this.request<Incident>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    transition: async (id: string, targetState: IncidentStatus, note?: string): Promise<Incident> => {
      return this.request<Incident>(`/api/incidents/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetState, note }),
      });
    },
    addNote: async (id: string, note: string): Promise<Incident> => {
      return this.request<Incident>(`/api/incidents/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
    },
    assign: async (
      id: string,
      strategyCode?: AssignmentStrategyType,
      technicianId?: string
    ): Promise<{ incident: Incident; assignedTechnician: any; rationale: string }> => {
      return this.request<{ incident: Incident; assignedTechnician: any; rationale: string }>(
        `/api/incidents/${id}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({ strategyCode, technicianId }),
        }
      );
    },
    feedback: async (id: string, rating: number, comments?: string): Promise<Feedback> => {
      return this.request<Feedback>(`/api/incidents/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, comments }),
      });
    },
  };

  // --- Entities API ---
  public services = {
    getAll: async (): Promise<ITService[]> => {
      return this.request<ITService[]>('/api/services');
    },
    create: async (service: ITService): Promise<ITService> => {
      return this.request<ITService>('/api/services', {
        method: 'POST',
        body: JSON.stringify(service),
      });
    },
    delete: async (id: string): Promise<void> => {
      await this.request(`/api/services/${id}`, { method: 'DELETE' });
    },
  };

  public categories = {
    getAll: async (): Promise<Category[]> => {
      return this.request<Category[]>('/api/categories');
    },
    create: async (category: Category): Promise<Category> => {
      return this.request<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(category),
      });
    },
    delete: async (id: string): Promise<void> => {
      await this.request(`/api/categories/${id}`, { method: 'DELETE' });
    },
  };

  public slaPolicies = {
    getAll: async (): Promise<SLAPolicy[]> => {
      return this.request<SLAPolicy[]>('/api/sla-policies');
    },
    create: async (policy: SLAPolicy): Promise<SLAPolicy> => {
      return this.request<SLAPolicy>('/api/sla-policies', {
        method: 'POST',
        body: JSON.stringify(policy),
      });
    },
    delete: async (id: string): Promise<void> => {
      await this.request(`/api/sla-policies/${id}`, { method: 'DELETE' });
    },
  };

  public users = {
    getAll: async (): Promise<User[]> => {
      return this.request<User[]>('/api/users');
    },
    create: async (user: any): Promise<User> => {
      return this.request<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(user),
      });
    },
    delete: async (id: string): Promise<void> => {
      await this.request(`/api/users/${id}`, { method: 'DELETE' });
    },
  };

  public technicians = {
    getAll: async (): Promise<Technician[]> => {
      return this.request<Technician[]>('/api/technicians');
    },
  };

  public events = {
    getTicket: async (): Promise<string> => {
      const res = await this.request<{ ticket: string }>('/api/events/ticket', {
        method: 'POST',
      });
      return res.ticket;
    },
    createEventSource: (ticket: string): EventSource => {
      return new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
    },
  };

  public ai = {
    suggestCategory: async (description: string): Promise<{ categoryId: string; categoryName: string; confidence: number }> => {
      return this.request<{ categoryId: string; categoryName: string; confidence: number }>(
        '/api/ai/suggest-category',
        {
          method: 'POST',
          body: JSON.stringify({ description }),
        }
      );
    },
    suggestResolution: async (
      description: string,
      incidentId?: string
    ): Promise<{ suggestedResolution: string; confidence: number; rationale?: string }> => {
      return this.request<{ suggestedResolution: string; confidence: number; rationale?: string }>(
        '/api/ai/suggest-resolution',
        {
          method: 'POST',
          body: JSON.stringify({ description, incidentId }),
        }
      );
    },
  };

  public admin = {
    resetDatabase: async (): Promise<{ message: string }> => {
      return this.request<{ message: string }>('/api/admin/reset-database', {
        method: 'POST',
      });
    },
  };
}

export const apiClient = new ApiClient();
export default apiClient;
