const express = require('express');
const router = express.Router();
const multer = require('multer');
const OpenAI = require('openai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/temp');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Extract text from various file types
async function extractTextFromFile(filePath, mimeType) {
  try {
    if (mimeType.includes('pdf')) {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } else if (mimeType.includes('word') || mimeType.includes('docx')) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (mimeType.includes('sheet') || mimeType.includes('excel')) {
      const workbook = XLSX.readFile(filePath);
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += XLSX.utils.sheet_to_txt(sheet) + '\n\n';
      });
      return text;
    }
    return '';
  } catch (error) {
    console.error('Error extracting text:', error);
    return '';
  }
}

// Analyze documents with GPT-4
router.post('/analyze', upload.array('documents', 10), async (req, res) => {
  const uploadedFiles = req.files;
  const projectType = req.body.projectType || 'unknown';
  
  try {
    // Extract text from all documents
    const documentContents = [];
    for (const file of uploadedFiles) {
      const text = await extractTextFromFile(file.path, file.mimetype);
      documentContents.push({
        filename: file.originalname,
        type: req.body[`docType_${file.originalname}`] || 'other',
        content: text,
        file: file
      });
    }

    // Create comprehensive analysis prompt
    const analysisPrompt = `Analyze these property development documents and extract all relevant information. The project type is: ${projectType}.

Documents provided:
${documentContents.map(doc => `${doc.filename} (${doc.type}):\n${doc.content.substring(0, 3000)}`).join('\n\n---\n\n')}

Extract and return a comprehensive JSON object with these fields (use null for missing data):

{
  "basic_info": {
    "title": "Extract or generate descriptive project title",
    "description": "Comprehensive project description",
    "location": "Full address",
    "suburb": "Suburb",
    "state": "State",
    "postcode": "Postcode",
    "property_type": "Residential|Commercial|Mixed Use|Industrial",
    "development_type": "${projectType}"
  },
  "land_details": {
    "land_area_sqm": "Total land area",
    "land_value": "Current land value from valuation",
    "acquisition_date": "When land was/will be acquired",
    "zoning": "Current zoning",
    "fsr": "Floor space ratio if mentioned",
    "height_limit": "Height restrictions"
  },
  "development_metrics": {
    "total_units": "Number of units (apartments/townhouses)",
    "total_lots": "Number of lots (subdivision)",
    "unit_mix": [{"type": "2bed", "count": 10, "size": 85, "price": 750000}],
    "total_gfa": "Gross floor area",
    "site_coverage": "Site coverage percentage",
    "car_spaces": "Total parking spaces",
    "number_of_levels": "Building levels"
  },
  "financial_details": {
    "total_development_cost": "From QS report or calculate",
    "land_cost": "Land acquisition cost",
    "construction_cost": "From QS report",
    "professional_fees": "Consultants, design fees",
    "council_contributions": "Infrastructure contributions",
    "finance_costs": "Interest and fees estimate",
    "selling_costs": "Marketing and sales fees",
    "contingency": "Project contingency amount"
  },
  "revenue_projections": {
    "total_revenue": "Gross realization value",
    "average_sale_price": "Per unit/lot",
    "presales_achieved": "Number and value of presales",
    "presales_percentage": "Percentage presold"
  },
  "construction_details": {
    "builder": "Construction company name",
    "architect": "Architectural firm",
    "structural_engineer": "Engineering firm",
    "construction_start": "Commencement date",
    "construction_duration": "Months to complete",
    "construction_type": "Type of construction"
  },
  "key_risks": ["List identified risks from documents"],
  "approvals": {
    "da_status": "Development approval status",
    "da_conditions": ["Key DA conditions"],
    "cc_status": "Construction certificate status"
  }
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert property development analyst. Extract accurate data from documents."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const extractedData = JSON.parse(completion.choices[0].message.content);

    // Calculate additional metrics
    const calculations = calculateAdvancedMetrics(extractedData);

    // Clean up temp files
    for (const file of uploadedFiles) {
      await fs.unlink(file.path);
    }

    res.json({
      success: true,
      extractedData: extractedData,
      calculations: calculations,
      filesProcessed: uploadedFiles.length
    });

  } catch (error) {
    console.error('Document analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze documents' });
  }
});

// Calculate advanced metrics
function calculateAdvancedMetrics(data) {
  const tdc = parseFloat(data.financial_details?.total_development_cost || 0);
  const revenue = parseFloat(data.revenue_projections?.total_revenue || 0);
  const landCost = parseFloat(data.land_details?.land_value || 0);
  const constructionCost = parseFloat(data.financial_details?.construction_cost || 0);
  
  return {
    profit: revenue - tdc,
    profit_margin: tdc > 0 ? ((revenue - tdc) / tdc * 100).toFixed(2) : 0,
    return_on_cost: tdc > 0 ? ((revenue - tdc) / tdc * 100).toFixed(2) : 0,
    return_on_equity: (revenue - tdc) / (tdc * 0.3) * 100, // Assuming 30% equity
    development_margin: revenue > 0 ? ((revenue - tdc) / revenue * 100).toFixed(2) : 0,
    land_to_tdc_ratio: tdc > 0 ? (landCost / tdc * 100).toFixed(2) : 0,
    construction_to_tdc_ratio: tdc > 0 ? (constructionCost / tdc * 100).toFixed(2) : 0,
    break_even_sales: revenue > 0 ? (tdc / revenue * 100).toFixed(2) : 0,
    debt_coverage_ratio: 1.45, // Placeholder - would calculate based on loan terms
    interest_cover_ratio: 2.1 // Placeholder
  };
}

module.exports = router;