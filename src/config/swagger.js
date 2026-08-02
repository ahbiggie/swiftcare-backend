import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'SwiftCare API',
    version: '1.0.0',
    description:
      "Clinic management API. Covers a patient's visit end to end: registration, check-in, queue, vitals, " +
      'consultation, and payment. Every request is scoped to the caller\'s clinic. ' +
      'See [docs/API_CONTRACT.md](https://github.com/ahbiggie/swiftcare-backend/blob/main/docs/API_CONTRACT.md) ' +
      'for the full written contract this spec follows.',
  },
  servers: [
    // PORT default per .env.example - docs/API_CONTRACT.md says 4000, but
    // .env.example actually ships 3000. Matching the real default here.
    { url: 'http://localhost:3000/api', description: 'Local development' },
    { url: 'https://swiftcare-backend.up.railway.app/api', description: 'Production (Railway) — update to your real domain' },
  ],
  tags: [
    { name: 'Auth', description: 'Signup, login, invites, and the signed-in user' },
    { name: 'Patients', description: 'Patient records, clinic-scoped' },
    { name: 'Appointments', description: 'Scheduled future visits' },
    { name: 'Queue', description: 'The live, in-progress visit queue' },
    { name: 'Vitals', description: 'Vital signs recorded during a visit' },
    { name: 'Consultations', description: 'Doctor consultations and prescriptions' },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Every route needs this except the three public auth routes.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string', example: 'Patient not found' },
            },
          },
        },
      },
      Patient: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clinicId: { type: 'string', format: 'uuid' },
          firstName: { type: 'string', example: 'Ada' },
          lastName: { type: 'string', example: 'Okafor' },
          phone: { type: 'string', example: '08031234567' },
          gender: { type: 'string', nullable: true, example: 'female' },
          dob: { type: 'string', format: 'date', nullable: true, example: '1990-04-12' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      PatientInput: {
        type: 'object',
        required: ['firstName', 'lastName', 'phone'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          gender: { type: 'string' },
          dob: { type: 'string', format: 'date' },
          confirmNewPatient: {
            type: 'boolean',
            description: 'Set true to create anyway after a 409 DUPLICATE_PATIENT response.',
          },
        },
      },
      PatientUpdateInput: {
        type: 'object',
        description: 'Only send the fields you want to change.',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          gender: { type: 'string' },
          dob: { type: 'string', format: 'date' },
        },
      },
      DuplicatePatientError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'DUPLICATE_PATIENT' },
              message: { type: 'string' },
              existingPatients: { type: 'array', items: { $ref: '#/components/schemas/Patient' } },
              requiresConfirmation: { type: 'boolean', example: true },
            },
          },
        },
      },
      Appointment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clinicId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          doctorId: { type: 'string', format: 'uuid' },
          date: { type: 'string', format: 'date' },
          time: { type: 'string', example: '10:30' },
          status: { type: 'string', enum: ['Scheduled', 'Cancelled', 'Completed'] },
        },
      },
      AppointmentInput: {
        type: 'object',
        required: ['patientId', 'doctorId', 'date', 'time'],
        properties: {
          patientId: { type: 'string', format: 'uuid' },
          doctorId: { type: 'string', format: 'uuid' },
          date: { type: 'string', format: 'date' },
          time: { type: 'string', example: '10:30' },
        },
      },
      QueueEntry: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clinicId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          appointmentId: { type: 'string', format: 'uuid', nullable: true },
          assignedDoctorId: { type: 'string', format: 'uuid' },
          lastUpdatedBy: { type: 'string', format: 'uuid', nullable: true },
          status: {
            type: 'string',
            enum: ['Checked-In', 'Triage Ready', 'Awaiting Doctor', 'In Consultation', 'Awaiting Payment', 'Completed', 'Cancelled'],
          },
        },
      },
      CheckInInput: {
        type: 'object',
        required: ['patientId', 'assignedDoctorId'],
        properties: {
          patientId: { type: 'string', format: 'uuid' },
          appointmentId: { type: 'string', format: 'uuid', description: 'Optional — omit for a walk-in.' },
          assignedDoctorId: { type: 'string', format: 'uuid' },
        },
      },
      QueueStatusInput: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['Triage Ready', 'Awaiting Doctor', 'In Consultation', 'Awaiting Payment', 'Completed', 'Cancelled'],
          },
          note: { type: 'string', description: 'Required when moving to Cancelled.' },
        },
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'receptionist', 'nurse', 'doctor', 'cashier'] },
          clinicId: { type: 'string', format: 'uuid' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/AuthUser' },
        },
      },
      StaffListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string' },
          status: { type: 'string', enum: ['invited', 'active'] },
        },
      },
      Doctor: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
        },
      },
      Vitals: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clinicId: { type: 'string', format: 'uuid' },
          queueEntryId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          bpSystolic: { type: 'integer', example: 120 },
          bpDiastolic: { type: 'integer', example: 80 },
          temperature: { type: 'number', format: 'float', description: 'Celsius', example: 37.0 },
          weight: { type: 'number', format: 'float', description: 'kg', example: 68.5 },
          recordedBy: { type: 'string', format: 'uuid' },
          recordedAt: { type: 'string', format: 'date-time' },
        },
      },
      VitalsInput: {
        type: 'object',
        required: ['queueEntryId', 'patientId', 'bpSystolic', 'bpDiastolic', 'temperature', 'weight'],
        properties: {
          queueEntryId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          bpSystolic: { type: 'integer', example: 120 },
          bpDiastolic: { type: 'integer', example: 80 },
          temperature: { type: 'number', format: 'float', description: 'Celsius', example: 37.0 },
          weight: { type: 'number', format: 'float', description: 'kg', example: 68.5 },
        },
      },
      Consultation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clinicId: { type: 'string', format: 'uuid' },
          queueEntryId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          doctorId: { type: 'string', format: 'uuid' },
          notes: { type: 'string', nullable: true },
          diagnosis: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['in_progress', 'completed'] },
        },
      },
      ConsultationInput: {
        type: 'object',
        required: ['queueEntryId', 'patientId'],
        properties: {
          queueEntryId: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
        },
      },
    },
    responses: {
      Unauthenticated: {
        description: 'Missing or invalid token',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Role not permitted for this action',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource missing, or belongs to another clinic',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Bad or missing fields',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
};

// glob (used internally by swagger-jsdoc) treats backslashes as escape
// characters, not path separators - forward slashes only, even on Windows.
const routesGlob = path.join(__dirname, '../routes/*.js').replace(/\\/g, '/');

const spec = swaggerJsdoc({
  definition,
  apis: [routesGlob],
});

export default spec;
