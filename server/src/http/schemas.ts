import { z } from 'zod';
import { isValidSouthAfricanId, normalisePhone } from '../domain/customer.js';
import { normaliseReference, REFERENCE_RE } from '../domain/reference.js';
import { LOCAL_DATE_RE, LOCAL_DATETIME_RE } from '../domain/time.js';

const positiveInt = z.coerce.number().int().positive();

export const availabilityParams = z.object({ branchId: positiveInt });

export const availabilityQuery = z.object({
  serviceId: positiveInt,
  date: z.string().regex(LOCAL_DATE_RE, 'date must be YYYY-MM-DD'),
});

export const referenceParams = z.object({
  reference: z
    .string()
    .transform(normaliseReference)
    .refine((r) => REFERENCE_RE.test(r), 'reference must look like APT-XXXXXX'),
});

export const bookingBody = z.object({
  branchId: positiveInt,
  serviceId: positiveInt,
  startsAt: z.string().regex(LOCAL_DATETIME_RE, 'startsAt must be YYYY-MM-DDTHH:mm'),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    phone: z
      .string()
      .trim()
      .transform((value, ctx) => {
        const normalised = normalisePhone(value);
        if (!normalised) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid South African phone number' });
          return z.NEVER;
        }
        return normalised;
      }),
    idNumber: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === '' ? undefined : value))
      .refine((value) => value === undefined || isValidSouthAfricanId(value), {
        message: 'Enter a valid 13-digit South African ID number',
      }),
  }),
  notes: z
    .string()
    .trim()
    .max(500, 'Notes must be 500 characters or fewer')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  consent: z
    .boolean()
    .refine((value) => value === true, { message: 'You must accept the privacy notice to book an appointment.' }),
});

export type BookingBody = z.infer<typeof bookingBody>;

export const accessBody = z.object({
  contact: z.string().trim().min(3, 'Enter the email or phone number on the booking').max(254),
});

export const rescheduleBody = z.object({
  startsAt: z.string().regex(LOCAL_DATETIME_RE, 'startsAt must be YYYY-MM-DDTHH:mm'),
});

export const otpRequestBody = z.object({
  contact: z.string().trim().min(3, 'Enter your email or phone number').max(254),
});

export const otpVerifyBody = z.object({
  contact: z.string().trim().min(3).max(254),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const adminLoginBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const analyticsQuery = z.object({
  rangeDays: z.coerce.number().int().min(1).max(365).default(30),
});

export const auditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
