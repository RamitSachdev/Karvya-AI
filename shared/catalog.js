// Single source of truth for categories, departments and the starter agents.
// Imported by the landing page, the onboarding flow and the server validator,
// so adding a category here updates all three.

export const PRICE_PER_AGENT = 15000;

export const CATEGORIES = [
  { key: 'financial', label: 'Financial consulting & CA firms', note: 'Audit, tax, advisory, wealth', agent: 'Reporting & reconciliation agent', agentKey: 'finance-ops' },
  { key: 'consulting', label: 'Management & general consulting', note: 'Strategy, operations, research', agent: 'Research & proposal agent', agentKey: 'consulting-research' },
  { key: 'it', label: 'IT & software services', note: 'Delivery, support, managed services', agent: 'Delivery & documentation agent', agentKey: 'it-delivery' },
  { key: 'startup', label: 'Startups & tech products', note: 'Early teams building from zero', agent: 'Company operations agent', agentKey: 'startup-ops' },
  { key: 'marketing', label: 'Marketing, media & creative agencies', note: 'Content, campaigns, client reporting', agent: 'Content & campaign agent', agentKey: 'marketing-content' },
  { key: 'legal', label: 'Legal & compliance firms', note: 'Drafting, contracts, filings', agent: 'Drafting & contract review agent', agentKey: 'legal-drafting' },
  { key: 'architecture', label: 'Architecture, engineering & real estate', note: 'Blueprints, tenders, documentation', agent: 'Drawings & documentation agent', agentKey: 'aec-docs' },
  { key: 'healthcare', label: 'Healthcare & pharma', note: 'Records, compliance, administration', agent: 'Records & compliance agent', agentKey: 'health-admin' },
  { key: 'education', label: 'Education & training', note: 'Admissions, curriculum, student queries', agent: 'Admissions & curriculum agent', agentKey: 'education-admin' },
  { key: 'commerce', label: 'Retail, e-commerce & D2C', note: 'Catalogues, orders, customer queries', agent: 'Catalogue & customer agent', agentKey: 'commerce-ops' },
  { key: 'manufacturing', label: 'Manufacturing, trading & logistics', note: 'The office side, not the shop floor', agent: 'Back-office operations agent', agentKey: 'backoffice-ops' },
  { key: 'hr', label: 'HR, recruitment & staffing', note: 'Screening, onboarding, payroll queries', agent: 'Hiring & screening agent', agentKey: 'hr-hiring' },
];

export const OTHER_CATEGORY = { key: 'other', label: 'Something else', note: 'Tell us what you do', agent: 'Custom agent, scoped with you', agentKey: 'custom' };

export const EMPLOYEE_BANDS = ['1–10', '11–50', '51–200', '201–500', '501–1,000', '1,000+'];

// `tasks` power the task picker. `before`/`after` power the "show me" discovery
// view in onboarding and the department explorer on the landing page.
export const DEPARTMENTS = [
  {
    key: 'finance', label: 'Finance & accounts',
    tasks: ['Reconciliations', 'MIS & board reports', 'Invoice processing', 'GST & tax preparation'],
    before: 'Someone spends the last week of every month copying numbers between sheets.',
    after: 'The agent pulls the numbers, flags what does not match, and hands your team a draft report to check.',
  },
  {
    key: 'sales', label: 'Sales & business development',
    tasks: ['Lead research', 'Proposal drafting', 'CRM updates', 'Follow-up emails'],
    before: 'Every proposal starts from an old file, and half the old client’s details have to be cleaned out.',
    after: 'The agent drafts from your past wins and your pricing, so your team only edits the part that matters.',
  },
  {
    key: 'marketing', label: 'Marketing & content',
    tasks: ['Content calendars', 'Social & blog drafts', 'Campaign reports', 'Competitor tracking'],
    before: 'One brief becomes five rewrites, and the brand voice changes with whoever wrote it.',
    after: 'The agent knows your voice and past campaigns, and turns one brief into drafts for every channel.',
  },
  {
    key: 'support', label: 'Customer support',
    tasks: ['Query triage', 'Reply drafting', 'Knowledge base upkeep', 'Escalation summaries'],
    before: 'The same twenty questions land in the inbox every day, and each one gets typed out by hand.',
    after: 'The agent drafts the answer from your own policies and sends the unusual cases to a person, with a summary.',
  },
  {
    key: 'legal', label: 'Legal & compliance',
    tasks: ['Contract review', 'Document drafting', 'Compliance tracking', 'Clause comparison'],
    before: 'A junior reads forty pages to find the three clauses that differ from your standard terms.',
    after: 'The agent marks those three clauses and explains the difference. Your lawyer makes the call.',
  },
  {
    key: 'hr', label: 'HR & recruitment',
    tasks: ['CV screening', 'Interview scheduling', 'Onboarding documents', 'Policy questions'],
    before: 'Two hundred CVs arrive for one role, and HR also answers the leave policy question again.',
    after: 'The agent shortlists against your criteria and answers policy questions, so HR can spend time with people.',
  },
  {
    key: 'operations', label: 'Operations & administration',
    tasks: ['Vendor coordination', 'Status reports', 'Data entry', 'Process documentation'],
    before: 'Nobody can start the Monday review until someone has chased every team for an update.',
    after: 'The agent gathers the updates from where the work already happens and writes the status report.',
  },
  {
    key: 'research', label: 'Research & development',
    tasks: ['Literature & market scans', 'Experiment notes', 'Technical summaries', 'Knowledge capture'],
    before: 'Research sits in one person’s folder, and it leaves when they do.',
    after: 'The agent keeps the findings, and anyone on the team can ask what was tried and why.',
  },
  {
    key: 'consulting', label: 'Consulting & client delivery',
    tasks: ['Market research', 'Deck first drafts', 'Data analysis', 'Client meeting notes'],
    before: 'A new analyst spends their first week learning what the team already knows about the client.',
    after: 'The agent carries the whole engagement, so a new analyst can ask it and start on day one.',
  },
  {
    key: 'data', label: 'Data & analytics',
    tasks: ['Data cleaning', 'Recurring dashboards', 'Ad hoc analysis', 'Report commentary'],
    before: 'Most of the analysis time goes into cleaning the same export the same way.',
    after: 'The agent handles the cleaning and the recurring reports, and your analyst starts at the question.',
  },
  {
    key: 'design', label: 'Design & drafting',
    tasks: ['Blueprint documentation', 'Revision tracking', 'Spec sheets', 'Tender documents'],
    before: 'Each drawing revision means updating the spec sheet, the tender and three emails by hand.',
    after: 'The agent tracks the revision and updates the paperwork around it, ready for your review.',
  },
  {
    key: 'engineering', label: 'IT & engineering',
    tasks: ['Technical documentation', 'Ticket triage', 'Test case writing', 'Code review notes'],
    before: 'Documentation is always a sprint behind, and tickets wait for someone to sort them.',
    after: 'The agent drafts docs from the actual work and routes each ticket to the right person.',
  },
];

export const INTENTS = { KNOWN: 'known', DISCOVER: 'discover' };

export const findCategory = (key) =>
  key === OTHER_CATEGORY.key ? OTHER_CATEGORY : CATEGORIES.find((c) => c.key === key);
