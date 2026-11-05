// THE SEAM FOR THE NEXT PHASE.
// When a lead is approved, this tells the outside world to send the trial email.
// Point TRIAL_WEBHOOK_URL at whatever ends up doing that (Zapier, n8n, Make, or
// your own function). It receives everything needed to email the right agent.
// Later, swap the fetch for a direct email call if you prefer; nothing else changes.

export async function dispatchTrial(lead, { accessUrl, agentName }) {
  const url = process.env.TRIAL_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'TRIAL_WEBHOOK_URL is not set' };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'lead.approved',
      lead_id: lead.id,
      agent_key: lead.agent_key,
      agent_name: agentName,
      access_url: accessUrl,
      email: lead.contact_email,
      contact_name: lead.contact_name,
      company_name: lead.company_name,
      category: lead.category,
      departments: lead.departments,
    }),
  });
  if (!res.ok) throw new Error(`Trial webhook responded ${res.status}`);
  return { sent: true };
}
