export function generateTestEmail(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}+${timestamp}${random}@test.local`;
}

export function generatePassword(): string {
  return `Test@${Date.now().toString(36).toUpperCase()}!`;
}

export function generateOrgName(prefix = 'TestOrg'): string {
  const timestamp = Date.now().toString(36).substring(4);
  return `${prefix}-${timestamp}`;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  stepType: 'in_app' | 'email' | 'push' | 'chat' | 'sms';
}

export function getWorkflowDefinitions(suffix: string): WorkflowDefinition[] {
  return [
    {
      name: `In-App Notification ${suffix}`,
      description: 'Test workflow with in-app notification step',
      stepType: 'in_app',
    },
    {
      name: `Email Notification ${suffix}`,
      description: 'Test workflow with email notification step',
      stepType: 'email',
    },
    {
      name: `Push Notification ${suffix}`,
      description: 'Test workflow with push notification step',
      stepType: 'push',
    },
  ];
}
