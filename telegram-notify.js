import { answerMarathonQuestion } from '../../lib/marathonAgent'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const answer = await answerMarathonQuestion(req.body?.message)
    return res.status(200).json({ answer })
  } catch (error) {
    console.error('AI chat error:', error)
    return res.status(500).json({ error: 'AI chat failed' })
  }
}

