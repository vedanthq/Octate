export interface UserPreferences {
  theme?: {
    mode: 'dark' | 'light';
    fontSize: number;
  };
  notifications?: {
    email: boolean;
    sms: boolean;
  };
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  isSuspended: boolean;
  roles: string[];
  preferences?: UserPreferences;
}

export interface AuthContext {
  userId: string;
  roles: string[];
}

export class UserService {
  private userStore: Map<string, UserProfile> = new Map();

  constructor() {
    this.userStore.set('usr-1', {
      id: 'usr-1',
      username: 'alice',
      email: 'alice@example.com',
      isActive: true,
      isSuspended: false,
      roles: ['user'],
    });
  }

  /**
   * CORR-01 (RESOLVED): Null/undefined failure
   * Safely accesses optional preferences with optional chaining and fallback.
   */
  getUserThemeMode(user: UserProfile): string {
    return user.preferences?.theme?.mode ?? 'light';
  }

  /**
   * CORR-02 (RESOLVED): Incorrect conditional logic
   * Corrected authorization logic: requires active account and non-suspended status.
   */
  canAccessDashboard(user: UserProfile): boolean {
    return user.isActive && !user.isSuspended;
  }

  /**
   * SEC-03 (RESOLVED): Unsafe authorization logic (IDOR)
   * Enforces actor authorization check ensuring only the account owner or admins can modify email.
   */
  async updateUserEmail(
    actor: AuthContext,
    targetUserId: string,
    newEmail: string
  ): Promise<boolean> {
    if (actor.userId !== targetUserId && !actor.roles.includes('admin')) {
      throw new Error('Forbidden: insufficient permissions to update user profile');
    }

    // Simulate async data store persistence
    await Promise.resolve();

    const user = this.userStore.get(targetUserId);
    if (!user) {
      throw new Error(`User ${targetUserId} not found`);
    }

    user.email = newEmail;
    this.userStore.set(targetUserId, user);
    return true;
  }
}
