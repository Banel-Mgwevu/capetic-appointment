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

export const staffUserBody = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dots, dashes and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const analyticsQuery = z.object({
  rangeDays: z.coerce.number().int().min(1).max(365).default(30),
});

export const auditLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const openingWindow = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm, e.g. 08:30'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm, e.g. 16:30'),
});

/** Keyed by weekday ("0" = Sunday ... "6" = Saturday); a missing key means closed that day. */
const openingHours = z
  .object({
    '0': openingWindow.optional(),
    '1': openingWindow.optional(),
    '2': openingWindow.optional(),
    '3': openingWindow.optional(),
    '4': openingWindow.optional(),
    '5': openingWindow.optional(),
    '6': openingWindow.optional(),
  })
  .strict()
  .refine((hours) => Object.values(hours).some((w) => w !== undefined), {
    message: 'Open at least one day of the week',
  })
  .refine((hours) => Object.values(hours).every((w) => !w || w.open < w.close), {
    message: 'Opening time must be before closing time',
  });

export const branchCreateBody = z.object({
  name: z.string().trim().min(2, 'Enter a branch name').max(100),
  city: z.string().trim().min(2, 'Enter a city').max(100),
  address: z.string().trim().min(5, 'Enter a street address').max(200),
  slotMinutes: z.coerce.number().int().min(5).max(240).default(30),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(50),
  openingHours,
});

export const branchUpdateBody = branchCreateBody.partial();

export const serviceCreateBody = z.object({
  name: z.string().trim().min(2, 'Enter a service name').max(100),
  description: z.string().trim().min(5, 'Enter a short description').max(300),
  durationMinutes: z.coerce.number().int().min(5, 'Must be at least 5 minutes').max(240),
});

export const serviceUpdateBody = serviceCreateBody.partial();

export const idParams = z.object({
  id: z.coerce.number().int().positive(),
});
