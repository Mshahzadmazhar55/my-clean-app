const express = require('express');
const router = express.Router();

// AI Proposal Generation
router.post('/proposal', async (req, res) => {
  try {
    const { 
      name, 
      profession, 
      yearsExperience, 
      email,
      clientName, 
      projectDescription, 
      budget, 
      timeline, 
      deliverables 
    } = req.body;

    // Check if Anthropic API key exists
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Anthropic API key not configured' 
      });
    }

    // Build the prompt for Claude
    const prompt = `You are a professional proposal writer. Create a compelling business proposal based on the following information:

Freelancer: ${name || 'Professional'}
Profession: ${profession || 'Freelancer'}
Experience: ${yearsExperience || '3'} years
Contact: ${email || 'contact@email.com'}

Client: ${clientName || 'Valued Client'}
Project: ${projectDescription || 'Project description'}
Budget: ${budget || 'To be discussed'}
Timeline: ${timeline || 'To be discussed'}
Deliverables: ${deliverables || 'Project deliverables'}

Write a professional, persuasive proposal that includes:
1. A warm introduction
2. Understanding of client needs
3. Proposed solution and approach
4. Clear deliverables breakdown
5. Timeline overview
6. Budget justification
7. Why they should choose you
8. Professional closing

Make it personal, professional, and compelling. Format it nicely with clear sections.`;

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[ANTHROPIC ERROR]', error);
      return res.status(500).json({ 
        success: false, 
        message: 'AI generation failed: ' + (error.error?.message || 'Unknown error')
      });
    }

    const data = await response.json();
    const proposal = data.content[0].text;

    res.json({
      success: true,
      proposal: proposal,
      message: 'Proposal generated successfully'
    });

  } catch (error) {
    console.error('[GENERATE ERROR]', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate proposal' 
    });
  }
});

// AI Invoice Generation
router.post('/invoice', async (req, res) => {
  try {
    const { 
      name, 
      email,
      clientName, 
      items, 
      dueDate,
      notes 
    } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Anthropic API key not configured' 
      });
    }

    const prompt = `Create a professional invoice with the following details:

From: ${name || 'Professional'}
Contact: ${email || 'contact@email.com'}
To: ${clientName || 'Client'}
Due Date: ${dueDate || 'Upon receipt'}
Items/Services: ${items || 'Services rendered'}
Additional Notes: ${notes || 'Thank you for your business'}

Format it as a clear, professional invoice with:
1. Invoice header
2. From/To details
3. Itemized services with amounts
4. Subtotal, tax (if applicable), and total
5. Payment terms
6. Thank you message`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[ANTHROPIC ERROR]', error);
      return res.status(500).json({ 
        success: false, 
        message: 'AI generation failed: ' + (error.error?.message || 'Unknown error')
      });
    }

    const data = await response.json();
    const invoice = data.content[0].text;

    res.json({
      success: true,
      invoice: invoice,
      message: 'Invoice generated successfully'
    });

  } catch (error) {
    console.error('[GENERATE ERROR]', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to generate invoice' 
    });
  }
});

module.exports = router;
