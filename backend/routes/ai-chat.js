require('dotenv').config();
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('tranch.db'); // Fixed database name

// Auth middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    req.db = db;
    next();
  });
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt function that takes userRole as parameter
const getSystemPrompt = (userRole) => `You are BrokerAI, a premium property development finance expert for the Tranch platform. You're friendly, knowledgeable, and conversational while maintaining professionalism.

RESPONSE FORMAT EXAMPLE:
"Great question! 👋

**LVR (Loan-to-Value Ratio)** typically ranges from **65-80%** for development finance in Australia.

Here's what affects your LVR:
- **Location** - Prime locations can achieve higher LVRs
- **Developer experience** - Proven track record helps
- **Pre-sales** - Higher pre-sales = better LVR terms

For a first-time developer in Brisbane, expect around **70% LVR** on the land value.

💡 **Pro tip:** Having 30% equity shows lenders you're invested in the project's success.

Would you like me to calculate the LVR for your specific project?"

PERSONALITY:
- Warm and approachable, like a trusted advisor
- Use conversational language, not robotic responses
- Break up information with natural formatting
- Use emojis sparingly for friendliness (✅ ⚡ 💡 📊 🏗️)

FORMATTING RULES:
- Use short paragraphs (2-3 sentences max)
- Use bullet points for lists
- Bold key terms and important numbers
- Add line breaks between different topics
- Keep responses scannable and easy to read

YOUR EXPERTISE:
- Property development finance (construction, land, mezzanine)
- Australian market insights and regulations
- LVR calculations (typically 65-80%)
- Interest rates (8-15% p.a.) and terms (12-36 months)
- Risk assessment and due diligence
- Development feasibility analysis

RESPONSE STYLE:
- Start with a friendly acknowledgment
- Structure information clearly
- End with a helpful question or next step
- Keep responses under 200 words unless asked for details

Current user type: ${userRole === 'borrower' ? 'Property Developer' : 'Private Credit Investor'}

Remember: You're helping build Australia's premier property finance platform. Make every interaction valuable and engaging.`;

// Create new chat session
router.post('/sessions', authMiddleware, async (req, res) => {
  try {
    const { project_id, session_title } = req.body;
    
    db.run(
      `INSERT INTO ai_chat_sessions (user_id, project_id, session_title) 
       VALUES (?, ?, ?)`,
      [req.user.id, project_id, session_title || `Chat ${new Date().toLocaleDateString()}`],
      function(err) {
        if (err) {
          console.error('Create session error:', err);
          return res.status(500).json({ error: 'Failed to create chat session' });
        }
        
        res.json({ 
          session_id: this.lastID,
          message: 'Chat session created successfully' 
        });
      }
    );
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

// Get user's chat sessions
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    db.all(
      `SELECT id, session_title, created_at 
       FROM ai_chat_sessions 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.user.id],
      (err, sessions) => {
        if (err) {
          console.error('Get sessions error:', err);
          return res.status(500).json({ error: 'Failed to fetch sessions' });
        }
        res.json(sessions);
      }
    );
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get messages for a session
router.get('/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
  try {
    // First verify the user owns this session
    db.get(
      `SELECT user_id FROM ai_chat_sessions WHERE id = ?`,
      [req.params.sessionId],
      (err, session) => {
        if (err || !session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.user_id !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        db.all(
          `SELECT id, sender, message, timestamp 
           FROM ai_chat_messages 
           WHERE session_id = ? 
           ORDER BY timestamp ASC`,
          [req.params.sessionId],
          (err, messages) => {
            if (err) {
              console.error('Get messages error:', err);
              return res.status(500).json({ error: 'Failed to fetch messages' });
            }
            res.json(messages);
          }
        );
      }
    );
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message and get AI response
router.post('/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const sessionId = req.params.sessionId;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Verify session ownership
    db.get(
      `SELECT user_id FROM ai_chat_sessions WHERE id = ?`,
      [sessionId],
      (err, session) => {
        if (err || !session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.user_id !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        
        // Save user message
        db.run(
          `INSERT INTO ai_chat_messages (session_id, sender, message) 
           VALUES (?, 'user', ?)`,
          [sessionId, message],
          async function(err) {
            if (err) {
              console.error('Save user message error:', err);
              return res.status(500).json({ error: 'Failed to save message' });
            }
            
            const userMessageId = this.lastID;
            
            try {
              // Check if OpenAI API key is configured
              if (!process.env.OPENAI_API_KEY) {
                // Use fallback response if no API key
                const fallbackResponse = generateFallbackResponse(message, req.user.role);
                
                db.run(
                  `INSERT INTO ai_chat_messages (session_id, sender, message) 
                   VALUES (?, 'ai', ?)`,
                  [sessionId, fallbackResponse],
                  function(err) {
                    if (err) {
                      console.error('Save AI message error:', err);
                      return res.status(500).json({ error: 'Failed to save AI response' });
                    }
                    
                    res.json({
                      user_message_id: userMessageId,
                      ai_message_id: this.lastID,
                      ai_response: fallbackResponse
                    });
                  }
                );
                return;
              }
              
              // Get conversation history for context
              db.all(
                `SELECT sender, message 
                 FROM ai_chat_messages 
                 WHERE session_id = ? 
                 ORDER BY timestamp ASC 
                 LIMIT 20`,
                [sessionId],
                async (err, history) => {
                  if (err) {
                    console.error('Get history error:', err);
                    return res.status(500).json({ error: 'Failed to get conversation history' });
                  }
                  
                  // Prepare messages for OpenAI
                  const messages = [
                    { role: 'system', content: getSystemPrompt(req.user.role) },
                    ...history.map(msg => ({
                      role: msg.sender === 'user' ? 'user' : 'assistant',
                      content: msg.message
                    }))
                  ];
                  
                  // Get AI response
                  const completion = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 500,
                  });
                  
                  const aiResponse = completion.choices[0].message.content;
                  
                  // Save AI response
                  db.run(
                    `INSERT INTO ai_chat_messages (session_id, sender, message) 
                     VALUES (?, 'ai', ?)`,
                    [sessionId, aiResponse],
                    function(err) {
                      if (err) {
                        console.error('Save AI message error:', err);
                        return res.status(500).json({ error: 'Failed to save AI response' });
                      }
                      
                      res.json({
                        user_message_id: userMessageId,
                        ai_message_id: this.lastID,
                        ai_response: aiResponse
                      });
                    }
                  );
                }
              );
            } catch (error) {
              console.error('OpenAI API error:', error);
              
              // Use fallback response on API error
              const fallbackResponse = generateFallbackResponse(message, req.user.role);
              
              db.run(
                `INSERT INTO ai_chat_messages (session_id, sender, message) 
                 VALUES (?, 'ai', ?)`,
                [sessionId, fallbackResponse],
                function(err) {
                  if (err) {
                    console.error('Save AI message error:', err);
                    return res.status(500).json({ error: 'Failed to save AI response' });
                  }
                  
                  res.json({
                    user_message_id: userMessageId,
                    ai_message_id: this.lastID,
                    ai_response: fallbackResponse
                  });
                }
              );
            }
          }
        );
      }
    );
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Fallback response generator when OpenAI is not available
function generateFallbackResponse(message, userRole) {
  const lowerMessage = message.toLowerCase();
  
  // Context-aware responses based on keywords
  if (lowerMessage.includes('lvr') || lowerMessage.includes('loan to value')) {
    return `Great question about LVR! 📊

**LVR (Loan-to-Value Ratio)** for property development typically ranges from **65-80%** in Australia.

Key factors affecting LVR:
- **Location** - CBD and prime suburbs can achieve 75-80%
- **Developer experience** - First project: 65-70%, experienced: up to 80%
- **Pre-sales** - 60%+ pre-sales can improve LVR terms

For example, on a $3M land value:
- 70% LVR = $2.1M loan
- 30% equity = $900K required

Would you like me to help calculate the LVR for your specific project?`;
  }
  
  if (lowerMessage.includes('interest rate') || lowerMessage.includes('rate')) {
    return `Let me break down current interest rates! 💰

**Development finance rates** typically range from **8-15% p.a.** depending on:

- **Risk profile** - Lower risk = better rates
- **LVR** - Lower LVR often means lower rates
- **Experience** - Proven developers get preferential rates
- **Security** - First mortgage vs mezzanine

Current market (2025):
- **Senior debt**: 8-12% p.a.
- **Mezzanine**: 12-18% p.a.
- **Terms**: Usually 12-36 months

💡 **Tip**: Shop around - rates can vary by 2-3% between lenders!`;
  }
  
  if (lowerMessage.includes('feasibility') || lowerMessage.includes('viable')) {
    return `Let's talk development feasibility! 🏗️

A **viable project** typically needs:

**Financial Metrics:**
- Profit margin: **20%+ on costs**
- Debt coverage: **1.5x minimum**
- Pre-sales: **60-80% for apartments**

**Quick feasibility check:**
1. Total Development Cost (TDC)
2. Gross Realisation Value (GRV)
3. Profit = GRV - TDC
4. Margin = Profit ÷ TDC

**Example:** $10M TDC, $12.5M GRV = 25% margin ✅

Want me to help assess your project's feasibility?`;
  }
  
  if (lowerMessage.includes('document') || lowerMessage.includes('paperwork')) {
    return `Here's what lenders typically require! 📄

**Essential Documents:**

✅ **Development Application (DA)**
✅ **Feasibility study** with financials
✅ **Site survey** and plans
✅ **Construction contract** or tenders
✅ **Insurance certificates**
✅ **Company financials** (2 years)

**Also helpful:**
- Pre-sale contracts
- Builder's track record
- Quantity surveyor report
- Environmental reports

💡 **Pro tip**: Prepare documents early - it speeds up approval!

Need help with any specific document?`;
  }
  
  // Default responses based on user role
  const borrowerResponses = [
    `Hi there! 👋

I'm here to help with your property development finance questions.

**Popular topics I can help with:**
- LVR calculations and requirements
- Current interest rates and terms
- Development feasibility analysis
- Required documentation
- Application process tips

What aspect of your project would you like to discuss?`,

    `Great to connect! 🏗️

**Quick tip**: Most developers start by understanding their numbers:
- Land value + construction cost = Total project cost
- Expected sales - Total cost = Profit
- Profit ÷ Total cost = Margin (aim for 20%+)

What stage is your development at?`,

    `Hello! Ready to help with your development finance! 💪

**Key success factors:**
1. Strong feasibility (20%+ margin)
2. Experienced team
3. Good location fundamentals
4. Realistic timeline

What's your biggest question right now?`
  ];
  
  const funderResponses = [
    `Welcome! 🤝

I can help you navigate property development investments.

**Key areas to explore:**
- Risk assessment frameworks
- Due diligence checklists
- Market analysis insights
- Portfolio diversification strategies
- Return expectations

What investment criteria are most important to you?`,

    `Great to assist with your investment analysis! 📊

**Smart investing focuses on:**
- Developer track record
- Location fundamentals
- Exit strategy clarity
- Risk-adjusted returns (12-18% typical)

Which projects are you currently evaluating?`,

    `Hello! Let's explore investment opportunities! 💼

**Due diligence priorities:**
1. Feasibility robustness
2. Developer experience
3. Market conditions
4. Security position

What's your investment focus?`
  ];
  
  const responses = userRole === 'borrower' ? borrowerResponses : funderResponses;
  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = router;