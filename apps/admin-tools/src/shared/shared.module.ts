import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  DalService,
  EnvironmentRepository,
  NotificationTemplateRepository,
  NotificationGroupRepository,
  ChangeRepository,
  MessageTemplateRepository,
  LayoutRepository,
  IntegrationRepository,
  SubscriberRepository,
  NotificationRepository,
  MessageRepository,
  FeedRepository,
  TopicRepository,
  TopicSubscribersRepository,
  OrganizationRepository,
  MemberRepository,
  TenantRepository,
  WorkflowOverrideRepository,
} from '@novu/dal';
import { DalServiceHealthIndicator } from '@novu/application-generic';

const DAL_MODELS = [
  EnvironmentRepository,
  NotificationTemplateRepository,
  NotificationGroupRepository,
  ChangeRepository,
  MessageTemplateRepository,
  LayoutRepository,
  IntegrationRepository,
  SubscriberRepository,
  NotificationRepository,
  MessageRepository,
  FeedRepository,
  TopicRepository,
  TopicSubscribersRepository,
  OrganizationRepository,
  MemberRepository,
  TenantRepository,
  WorkflowOverrideRepository,
];

const dalService = {
  provide: DalService,
  useFactory: async () => {
    const service = new DalService();
    await service.connect(String(process.env.MONGO_URL));

    return service;
  },
};

@Module({
  imports: [
    JwtModule.register({
      secretOrKeyProvider: () => process.env.JWT_SECRET as string,
      signOptions: {
        expiresIn: 360000,
      },
    }),
  ],
  providers: [dalService, DalServiceHealthIndicator, ...DAL_MODELS],
  exports: [dalService, DalServiceHealthIndicator, ...DAL_MODELS, JwtModule],
})
export class SharedModule {}
