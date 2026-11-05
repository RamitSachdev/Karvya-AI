// Runs in the browser for instant feedback and again on the server, which is
// the check that counts. Returns field errors keyed by the same names the form uses.
import { CATEGORIES, OTHER_CATEGORY, DEPARTMENTS, EMPLOYEE_BANDS, INTENTS } from './catalog.js';

const LIMITS = { short: 120, medium: 300, long: 2000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s-]{7,20}$/;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value, max = 40) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, LIMITS.short)).slice(0, max) : [];

export function normalizeLead(input = {}) {
  return {
    category: text(input.category, 40),
    categoryOther: text(input.categoryOther, LIMITS.short),
    companyName: text(input.companyName, LIMITS.short),
    city: text(input.city, LIMITS.short),
    services: text(input.services, LIMITS.medium),
    employees: text(input.employees, 20),
    departments: list(input.departments),
    departmentsOther: text(input.departmentsOther, LIMITS.short),
    intent: text(input.intent, 20),
    tasks: list(input.tasks),
    automateNotes: text(input.automateNotes, LIMITS.long),
    tools: text(input.tools, LIMITS.medium),
    contactName: text(input.contactName, LIMITS.short),
    contactEmail: text(input.contactEmail, 254).toLowerCase(),
    contactRole: text(input.contactRole, LIMITS.short),
    contactPhone: text(input.contactPhone, 20),
    consent: input.consent === true,
  };
}

const CATEGORY_KEYS = new Set([...CATEGORIES.map((c) => c.key), OTHER_CATEGORY.key]);
const DEPARTMENT_KEYS = new Set(DEPARTMENTS.map((d) => d.key));

export const STEP_FIELDS = {
  category: ['category', 'categoryOther'],
  company: ['companyName', 'city', 'services', 'employees'],
  departments: ['departments', 'departmentsOther'],
  automate: ['intent', 'tasks', 'automateNotes'],
  contact: ['contactName', 'contactEmail', 'contactPhone', 'consent'],
};

export function validateLead(lead) {
  const e = {};
  if (!CATEGORY_KEYS.has(lead.category)) e.category = 'Pick the category closest to your company.';
  if (lead.category === OTHER_CATEGORY.key && !lead.categoryOther) e.categoryOther = 'Tell us what your company does.';
  if (!lead.companyName) e.companyName = 'Enter your company name.';
  if (!lead.city) e.city = 'Enter the city you are based in.';
  if (!lead.services) e.services = 'Tell us briefly what your company does.';
  if (!EMPLOYEE_BANDS.includes(lead.employees)) e.employees = 'Pick your team size.';
  if (!lead.departments.length && !lead.departmentsOther) e.departments = 'Pick at least one department.';
  else if (lead.departments.some((d) => !DEPARTMENT_KEYS.has(d))) e.departments = 'Pick from the departments listed.';
  if (lead.intent !== INTENTS.KNOWN && lead.intent !== INTENTS.DISCOVER) e.intent = 'Choose one of the two options.';
  if (lead.intent === INTENTS.KNOWN && !lead.tasks.length && !lead.automateNotes) e.tasks = 'Pick a task or describe what you want to automate.';
  if (!lead.contactName) e.contactName = 'Enter your name.';
  if (!EMAIL.test(lead.contactEmail)) e.contactEmail = 'Enter a valid email address. Your trial access will be sent here.';
  if (lead.contactPhone && !PHONE.test(lead.contactPhone)) e.contactPhone = 'Enter a valid phone number, or leave this blank.';
  if (!lead.consent) e.consent = 'We need your permission to contact you about the trial.';
  return e;
}
