import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const timestamp = new Date().toISOString();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ status: 'unhealthy', timestamp, service: 'QC Live', error: 'Supabase database is not configured' });
  }
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/qc_live_stream_jobs?select=id&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    return res.status(200).json({ status: 'healthy', timestamp, version: '1.0.0', service: 'QC Live', database: 'supabase' });
  } catch (error: any) {
    return res.status(503).json({ status: 'unhealthy', timestamp, service: 'QC Live', error: 'Supabase database connection failed' });
  }
}
