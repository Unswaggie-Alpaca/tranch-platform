const express = require('express');
const router = express.Router();

// Geocode autocomplete endpoint using OpenStreetMap Nominatim
router.post('/autocomplete', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || input.length < 3) {
      return res.json({ predictions: [] });
    }

    // Use OpenStreetMap Nominatim API (free, no API key required)
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&countrycodes=au&limit=5&addressdetails=1`;
    
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'Tranch Platform/1.0' // Required by Nominatim
      }
    });

    if (!response.ok) {
      throw new Error('Nominatim API error');
    }

    const data = await response.json();
    
    // Transform Nominatim results to match our expected format
    const predictions = data.map(item => ({
      place_id: item.place_id,
      description: item.display_name
    }));

    res.json({ predictions });
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({ error: 'Geocoding service error' });
  }
});

module.exports = router;