import { DEFAULT_DOCUMENT_EMAIL_SETTINGS, ZDocumentEmailSettingsSchema } from '@documenso/lib/types/document-email';
import { zEmail } from '@documenso/lib/utils/zod';
import { DocumentEmailCheckboxes } from '@documenso/ui/components/document/document-email-checkboxes';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import type { TeamGlobalSettings } from '@prisma/client';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormStickySaveBar } from './form-sticky-save-bar';

const ZEmailPreferencesFormSchema = z.object({
  emailReplyTo: zEmail().nullable(),
  // emailReplyToName: z.string(),
  emailDocumentSettings: ZDocumentEmailSettingsSchema.nullable(),
});

export type TEmailPreferencesFormSchema = z.infer<typeof ZEmailPreferencesFormSchema>;

type SettingsSubset = Pick<TeamGlobalSettings, 'emailReplyTo' | 'emailDocumentSettings'>;

export type EmailPreferencesFormProps = {
  settings: SettingsSubset;
  canInherit: boolean;
  onFormSubmit: (data: TEmailPreferencesFormSchema) => Promise<void>;
};

export const EmailPreferencesForm = ({ settings, onFormSubmit, canInherit }: EmailPreferencesFormProps) => {
  const form = useForm<TEmailPreferencesFormSchema>({
    defaultValues: {
      emailReplyTo: settings.emailReplyTo,
      // emailReplyToName: settings.emailReplyToName,
      emailDocumentSettings: settings.emailDocumentSettings,
    },
    resolver: zodResolver(ZEmailPreferencesFormSchema),
  });

  const handleFormSubmit = form.handleSubmit(async (data) => {
    try {
      await onFormSubmit(data);
    } catch {
      // The page handler surfaces its own error toast. Keep the form dirty so
      // the save bar stays visible and the user can retry.
      return;
    }

    form.reset(data);
  });

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit}>
        <fieldset className="flex h-full max-w-2xl flex-col gap-y-6" disabled={form.formState.isSubmitting}>
          <FormField
            control={form.control}
            name="emailReplyTo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Reply to email</Trans>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    onChange={(value) => field.onChange(value.target.value || null)}
                    placeholder="noreply@example.com"
                    type="email"
                  />
                </FormControl>
                <FormMessage />
                <FormDescription>
                  <Trans>The email address which will show up in the "Reply To" field in emails</Trans>

                  {canInherit && (
                    <span>
                      {'. '}
                      <Trans>Leave blank to inherit from the organisation.</Trans>
                    </span>
                  )}
                </FormDescription>
              </FormItem>
            )}
          />

          {/* <FormField
            control={form.control}
            name="emailReplyToName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Reply to name</Trans>
                </FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          /> */}

          <FormField
            control={form.control}
            name="emailDocumentSettings"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>
                  <Trans>Default Email Settings</Trans>
                </FormLabel>
                {canInherit && (
                  <Select
                    value={field.value === null ? 'INHERIT' : 'CONTROLLED'}
                    onValueChange={(value) =>
                      field.onChange(value === 'CONTROLLED' ? DEFAULT_DOCUMENT_EMAIL_SETTINGS : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value={'INHERIT'}>
                        <Trans>Inherit from organisation</Trans>
                      </SelectItem>

                      <SelectItem value={'CONTROLLED'}>
                        <Trans>Override organisation settings</Trans>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {field.value && (
                  <div className="space-y-2 rounded-md border p-4">
                    <DocumentEmailCheckboxes
                      value={field.value ?? DEFAULT_DOCUMENT_EMAIL_SETTINGS}
                      onChange={(value) => field.onChange(value)}
                    />
                  </div>
                )}

                <FormDescription>
                  <Trans>
                    Controls the default email settings when new documents or templates are created. Updating these
                    settings will not affect existing documents or templates.
                  </Trans>
                </FormDescription>
              </FormItem>
            )}
          />

          <FormStickySaveBar
            isDirty={form.formState.isDirty}
            isSubmitting={form.formState.isSubmitting}
            onReset={() => form.reset()}
          />
        </fieldset>
      </form>
    </Form>
  );
};
