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
   * CORR-01: Null/undefined failure
   * Accesses deep property on optional preferences without null/undefined check or optional chaining.
   */
  getUserThemeMode(user: UserProfile): string {
    // Bug CORR-01: user.preferences is optional; calling .theme.mode throws when undefined
    return user.preferences.theme.mode;
  }

  /**
   * CORR-02: Incorrect conditional logic
   * Inverted conditional logic: grants access to inactive or suspended users.
   */
  canAccessDashboard(user: UserProfile): boolean {
    // Bug CORR-02: Should be `user.isActive && !user.isSuspended`
    if (!user.isActive || user.isSuspended) {
      return true;
    }
    return false;
  }

  /**
   * SEC-03: Unsafe authorization logic (IDOR)
   * Any authenticated caller can change any user's email because actor permissions are ignored.
   */
  async updateUserEmail(actor: AuthContext, targetUserId: string, newEmail: string): Promise<boolean> {
    const user = this.userStore.get(targetUserId);
    if (!user) {
      throw new Error(`User ${targetUserId} not found`);
    }

    // Bug SEC-03: Missing authorization check verifying actor.userId === targetUserId || actor.roles.includes('admin')
    user.email = newEmail;
    this.userStore.set(targetUserId, user);
    return true;
  }
}
