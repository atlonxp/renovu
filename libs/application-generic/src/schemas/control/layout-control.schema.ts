import { JSONSchemaEntity } from '@novu/dal';
import { UiComponentEnum, UiSchema, UiSchemaGroupEnum } from '@novu/shared';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultOptions } from './shared';

const containerSchema = z
  .object({
    maxWidth: z.string().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    padding: z.string().optional(),
    backgroundColor: z.string().optional(),
  })
  .optional();

// email layout schema is a subset of the email control schema
const layoutZodSchema = z.object({
  email: z
    .object({
      body: z.string().min(1),
      editorType: z.enum(['block', 'html']).optional().default('block'),
      container: containerSchema,
    })
    .optional(),
});

export type LayoutControlType = z.infer<typeof layoutZodSchema>;

export const layoutUiSchema: UiSchema = {
  group: UiSchemaGroupEnum.LAYOUT,
  properties: {
    email: {
      component: UiComponentEnum.LAYOUT_EMAIL,
      properties: {
        body: {
          component: UiComponentEnum.EMAIL_BODY,
          placeholder: '',
        },
        editorType: {
          component: UiComponentEnum.EMAIL_EDITOR_SELECT,
          placeholder: 'block',
        },
      },
    },
  },
};

export const layoutControlSchema = zodToJsonSchema(layoutZodSchema, defaultOptions) as JSONSchemaEntity;
